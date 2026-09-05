// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title PredictionMarket
/// @notice Parimutuel YES/NO prediction market: "Does <stock token> reach
/// $<target> by <deadline>?", settled by reading a Chainlink price feed.
/// Bets are placed in a single ERC-20 bet token (e.g. a USD stablecoin).
///
/// @dev STATUS: compiles clean, full Foundry suite passing (via Docker — see
/// contracts/CLAUDE.md). Not deployed anywhere yet and has had no independent
/// security review. Do not deploy to mainnet, or accept real user funds on
/// any network, before that review happens.
contract PredictionMarket is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Side {
        YES,
        NO
    }
    enum Status {
        Open,
        Resolved,
        Cancelled
    }

    struct Market {
        address priceFeed; // Chainlink AggregatorV3Interface for the underlying stock token
        int256 targetPrice; // scaled to the feed's own `decimals()`
        uint256 createdAt; // unix timestamp at creation — anchors the betting-window/decay math below
        uint256 deadline; // unix timestamp — resolution allowed here (betting closes earlier, see BETTING_WINDOW_BP)
        uint256 poolYes;
        uint256 poolNo;
        // Sum of every winning-side bettor's *weighted* stake (raw stake x
        // their early-bet weight at bet time) — used only to divide up the
        // losing pool among winners; principal is always paid from the raw
        // `poolYes`/`poolNo` figures above, unaffected by weight.
        uint256 weightedPoolYes;
        uint256 weightedPoolNo;
        Status status;
        Side outcome;
        // Snapshotted from the global `feeBp` at creation time, so a later
        // `setFeeBp` call never retroactively changes the fee on a market
        // that's already open — bettors know the exact fee when they bet.
        uint256 feeBp;
    }

    /// @dev Max age (seconds) a Chainlink round may have at resolution time before
    /// it's considered stale and resolution is refused. Tune per feed heartbeat —
    /// see contracts/CLAUDE.md for how to find the actual heartbeat for a given feed.
    uint256 public constant MAX_PRICE_STALENESS = 1 hours;

    /// @dev Business rule mirrored from the frontend (`MAX_TARGET_PRICE` in
    /// `src/store/marketStore.ts`) — no market can target above this, in whole
    /// USD. Compared against `targetPrice` after scaling to the feed's own
    /// `decimals()`, since `targetPrice` is always in feed-decimal units.
    uint256 public constant MAX_TARGET_PRICE_USD = 500;

    /// @dev Cap on owner-supplied house seed liquidity per market, in whole
    /// bet-token units (scaled to `betToken.decimals()` at use). Keeps the
    /// platform's own risk per market bounded regardless of `feeBp`.
    uint256 public constant MAX_SEED_LIQUIDITY_USD = 50;

    /// @dev Upper bound on `feeBp` itself (1000 = 10%), so `setFeeBp` can
    /// never turn into a de facto rug on winners' payouts.
    uint256 public constant MAX_FEE_BP = 1000;
    uint256 private constant BP_DENOMINATOR = 10_000;

    /// @dev Betting only stays open for the first slice of a market's life —
    /// closes at `createdAt + (deadline - createdAt) * BETTING_WINDOW_BP / 10000`,
    /// well before `deadline` itself (resolution still only unlocks at
    /// `deadline`). 6667 = 2/3, e.g. a 15-minute market takes bets for the
    /// first 10 minutes and then just waits 5 minutes for resolution — this
    /// mirrors any market's `deadline - createdAt` proportionally, not a
    /// fixed number of minutes.
    uint256 public constant BETTING_WINDOW_BP = 6667;

    /// @dev A winning stake's share of the *losing* pool (not its own
    /// principal, which always comes back in full) is scaled by a weight
    /// that decays linearly from MAX_WEIGHT_BP at the moment betting opens
    /// to MIN_WEIGHT_BP right as the betting window closes — rewarding
    /// bettors who take a position early, while the outcome is still
    /// genuinely uncertain, over those who wait for the trend to become
    /// obvious and snipe right before betting closes.
    uint256 public constant MAX_WEIGHT_BP = 20_000; // 2x for a bet placed the instant betting opens
    uint256 public constant MIN_WEIGHT_BP = 5_000; // 0.5x for a bet placed right at the betting cutoff

    /// @dev Assumed to be a standard ERC20: no fee-on-transfer, no rebasing.
    /// The contract's internal accounting (`stakes`, `poolYes`/`poolNo`)
    /// trusts that `safeTransferFrom(user, address(this), amount)` credits
    /// the contract with exactly `amount`. A fee-on-transfer or rebasing
    /// token would silently under-fund the contract relative to what it
    /// believes it owes bettors — vet this before ever changing it at deploy
    /// time, this is not something the contract can detect on its own.
    IERC20 public immutable betToken;

    /// @notice Current protocol fee in basis points, applied to the losing
    /// pool's share of a winner's payout (never to principal). Snapshotted
    /// per-market at creation — see `Market.feeBp`.
    uint256 public feeBp;

    /// @notice Fees collected across all resolved markets, withdrawable by
    /// the owner via `withdrawFees`. Left in the contract as plain balance
    /// until withdrawn — never auto-swept.
    uint256 public accumulatedFees;

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    // marketId => user => side => raw amount staked (principal — always paid back in full)
    mapping(uint256 => mapping(address => mapping(Side => uint256))) public stakes;
    // marketId => user => side => stake x early-bet weight at the time of the bet
    // (used only to divide up the losing pool among winners — see Market.weightedPoolYes/No)
    mapping(uint256 => mapping(address => mapping(Side => uint256))) public weightedStakes;
    mapping(uint256 => mapping(address => bool)) public claimed;

    /// @dev Market creation is permissionless, but the price feed it settles
    /// against is not — an attacker could otherwise deploy their own
    /// "Chainlink-shaped" contract that reports whatever price they want and
    /// create a rigged market against it. Only owner-allowlisted feeds
    /// (real Chainlink feeds, verified against
    /// https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood)
    /// can be used, even though anyone can call `createMarket` itself.
    mapping(address => bool) public allowedPriceFeeds;

    event MarketCreated(uint256 indexed id, address indexed priceFeed, int256 targetPrice, uint256 deadline);
    event BetPlaced(uint256 indexed id, address indexed user, Side side, uint256 amount, uint256 weightBp);
    event MarketResolved(uint256 indexed id, Side outcome, int256 settlePrice);
    event MarketVoided(uint256 indexed id, string reason);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event Refunded(uint256 indexed id, address indexed user, Side side, uint256 amount);
    event PriceFeedAllowlisted(address indexed feed, bool allowed);
    event FeeBpUpdated(uint256 feeBp);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _betToken, uint256 _feeBp) Ownable(msg.sender) {
        require(_betToken != address(0), "bet token = zero addr");
        require(_feeBp <= MAX_FEE_BP, "fee exceeds max");
        betToken = IERC20(_betToken);
        feeBp = _feeBp;
    }

    /// @notice Owner-maintained allowlist of price feeds `createMarket` may settle
    /// against. Keeps market creation itself permissionless while preventing anyone
    /// from rigging a market with a fake "Chainlink-shaped" feed contract they control.
    function setPriceFeedAllowed(address feed, bool allowed) external onlyOwner {
        require(feed != address(0), "feed = zero addr");
        allowedPriceFeeds[feed] = allowed;
        emit PriceFeedAllowlisted(feed, allowed);
    }

    /// @notice Update the protocol fee for markets created from now on. Never
    /// affects a market that's already open — see `Market.feeBp`.
    function setFeeBp(uint256 _feeBp) external onlyOwner {
        require(_feeBp <= MAX_FEE_BP, "fee exceeds max");
        feeBp = _feeBp;
        emit FeeBpUpdated(_feeBp);
    }

    /// @notice Withdraw accumulated protocol fees to `to`.
    function withdrawFees(address to) external onlyOwner {
        require(to != address(0), "to = zero addr");
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        betToken.safeTransfer(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Create a new market. Permissionless — any address may call this —
    /// but `priceFeed` must already be on the owner-maintained allowlist (see
    /// `setPriceFeedAllowed`), and `targetPrice` is capped at `MAX_TARGET_PRICE_USD`
    /// to mirror the frontend's product rule.
    ///
    /// `initialYesAmount`/`initialNoAmount` let the owner seed both sides of a
    /// fresh market with house liquidity (e.g. to open at 50/50 odds instead of
    /// waiting for organic bets on both sides) — only the owner may pass non-zero
    /// values here, and their combined size is capped at `MAX_SEED_LIQUIDITY_USD`.
    /// Regular permissionless callers pass `(0, 0)`. Either way, a market that
    /// never gets a bet on *both* sides by its deadline is cancelled instead of
    /// resolved — see `resolve`.
    function createMarket(
        address priceFeed,
        int256 targetPrice,
        uint256 deadline,
        uint256 initialYesAmount,
        uint256 initialNoAmount
    ) external nonReentrant returns (uint256 id) {
        require(priceFeed != address(0), "feed = zero addr");
        require(allowedPriceFeeds[priceFeed], "feed not allowlisted");
        require(deadline > block.timestamp, "deadline in the past");
        require(targetPrice > 0, "target must be > 0");

        uint8 feedDecimals = AggregatorV3Interface(priceFeed).decimals();
        require(targetPrice <= int256(MAX_TARGET_PRICE_USD * 10 ** feedDecimals), "target exceeds max");

        if (initialYesAmount > 0 || initialNoAmount > 0) {
            require(msg.sender == owner(), "seed liquidity is owner-only");
            uint8 betDecimals = IERC20Metadata(address(betToken)).decimals();
            require(
                initialYesAmount + initialNoAmount <= MAX_SEED_LIQUIDITY_USD * 10 ** betDecimals,
                "seed exceeds max"
            );
        }

        id = marketCount++;
        Market storage m = markets[id];
        m.priceFeed = priceFeed;
        m.targetPrice = targetPrice;
        m.createdAt = block.timestamp;
        m.deadline = deadline;
        m.status = Status.Open;
        m.feeBp = feeBp;

        emit MarketCreated(id, priceFeed, targetPrice, deadline);

        // Seed liquidity lands at creation time (elapsed = 0), so it always
        // gets MAX_WEIGHT_BP — consistent with "earliest possible bet".
        if (initialYesAmount > 0) {
            betToken.safeTransferFrom(msg.sender, address(this), initialYesAmount);
            stakes[id][msg.sender][Side.YES] += initialYesAmount;
            uint256 weighted = (initialYesAmount * MAX_WEIGHT_BP) / BP_DENOMINATOR;
            weightedStakes[id][msg.sender][Side.YES] += weighted;
            m.poolYes = initialYesAmount;
            m.weightedPoolYes = weighted;
            emit BetPlaced(id, msg.sender, Side.YES, initialYesAmount, MAX_WEIGHT_BP);
        }
        if (initialNoAmount > 0) {
            betToken.safeTransferFrom(msg.sender, address(this), initialNoAmount);
            stakes[id][msg.sender][Side.NO] += initialNoAmount;
            uint256 weighted = (initialNoAmount * MAX_WEIGHT_BP) / BP_DENOMINATOR;
            weightedStakes[id][msg.sender][Side.NO] += weighted;
            m.poolNo = initialNoAmount;
            m.weightedPoolNo = weighted;
            emit BetPlaced(id, msg.sender, Side.NO, initialNoAmount, MAX_WEIGHT_BP);
        }
    }

    /// @notice Unix timestamp at which betting closes for market `id` — before
    /// this, `bet()` is allowed; after this (but before `deadline`), the
    /// market is just waiting for resolution. See `BETTING_WINDOW_BP`.
    function bettingWindowEnd(uint256 id) public view returns (uint256) {
        Market storage m = markets[id];
        return m.createdAt + ((m.deadline - m.createdAt) * BETTING_WINDOW_BP) / BP_DENOMINATOR;
    }

    /// @notice The early-bet weight (basis points, 10000 = 1x) a bet placed
    /// right now would get on market `id` — decays linearly from
    /// `MAX_WEIGHT_BP` at the moment betting opened to `MIN_WEIGHT_BP` right
    /// as the betting window closes. Reverts the same way `bet()` would if
    /// betting is already closed, so callers can rely on a revert here to
    /// mean "don't bother calling bet()".
    function currentWeightBp(uint256 id) public view returns (uint256) {
        Market storage m = markets[id];
        uint256 windowEnd = bettingWindowEnd(id);
        require(block.timestamp < windowEnd, "betting closed");

        uint256 windowDuration = windowEnd - m.createdAt;
        uint256 elapsed = block.timestamp - m.createdAt;
        uint256 range = MAX_WEIGHT_BP - MIN_WEIGHT_BP;
        uint256 decay = (range * elapsed) / windowDuration;
        return MAX_WEIGHT_BP - decay;
    }

    /// @notice Bet `amount` of `betToken` on `side` for market `id`. Requires prior
    /// `betToken.approve(address(this), amount)`. One bet per side per market —
    /// once you've staked on a side, a second call on that same side reverts
    /// (you can still bet the *other* side once, if you haven't already).
    ///
    /// Betting closes at `bettingWindowEnd(id)`, earlier than `deadline` — see
    /// `BETTING_WINDOW_BP`. The earlier you bet within that window, the bigger
    /// a share of the losing pool your stake is weighted for if you win (your
    /// principal is unaffected either way) — see `currentWeightBp`.
    function bet(uint256 id, Side side, uint256 amount) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(amount > 0, "amount = 0");
        require(stakes[id][msg.sender][side] == 0, "already bet this side");

        uint256 weightBp = currentWeightBp(id); // reverts "betting closed" past the window

        betToken.safeTransferFrom(msg.sender, address(this), amount);
        stakes[id][msg.sender][side] += amount;
        uint256 weighted = (amount * weightBp) / BP_DENOMINATOR;
        weightedStakes[id][msg.sender][side] += weighted;
        if (side == Side.YES) {
            m.poolYes += amount;
            m.weightedPoolYes += weighted;
        } else {
            m.poolNo += amount;
            m.weightedPoolNo += weighted;
        }

        emit BetPlaced(id, msg.sender, side, amount, weightBp);
    }

    /// @notice Resolve a market once its deadline has passed, using the Chainlink feed.
    /// Callable by anyone (keeper-friendly) once the deadline has passed.
    ///
    /// If either side never got a bet, the market is cancelled instead of resolved —
    /// there's no genuine two-sided prediction to settle, and (for the case where
    /// the empty side would've "won") no losing pool to pay a winner from anyway.
    /// Cancelling lets whoever did bet reclaim their own stake in full via `refund`.
    function resolve(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(block.timestamp >= m.deadline, "too early");

        if (m.poolYes == 0 || m.poolNo == 0) {
            m.status = Status.Cancelled;
            emit MarketVoided(id, "one-sided market: no counter-bets");
            return;
        }

        (, int256 price,, uint256 updatedAt,) = AggregatorV3Interface(m.priceFeed).latestRoundData();
        require(price > 0, "invalid feed answer");
        require(block.timestamp - updatedAt <= MAX_PRICE_STALENESS, "stale price feed");

        m.status = Status.Resolved;
        m.outcome = price >= m.targetPrice ? Side.YES : Side.NO;

        emit MarketResolved(id, m.outcome, price);
    }

    /// @notice Claim payout after a market resolves in your favor. Parimutuel with
    /// a protocol fee taken only from the losing pool's contribution — your own
    /// stake always comes back in full:
    ///
    ///   payout = yourStake + yourWeightedStake * losingPool * (10000 - feeBp) / (weightedWinningPool * 10000)
    ///
    /// `losingPool` is the *raw* dollar amount forfeited by the losing side —
    /// weight never applies to it, losers just lose their stake. `weightedWinningPool`
    /// is guaranteed non-zero here: `resolve` only reaches `Resolved` (as opposed to
    /// `Cancelled`) when both `poolYes` and `poolNo` are non-zero, and every non-zero
    /// stake has a non-zero weighted stake (weight is always > 0, see MIN_WEIGHT_BP).
    /// Integer division rounds down, so any rounding dust favors the contract
    /// (stays unclaimed) rather than ever over-paying.
    function claim(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Resolved, "not resolved");
        require(!claimed[id][msg.sender], "already claimed");

        uint256 userStake = stakes[id][msg.sender][m.outcome];
        require(userStake > 0, "no winning stake");

        uint256 losingPool = m.outcome == Side.YES ? m.poolNo : m.poolYes;
        uint256 weightedWinningPool = m.outcome == Side.YES ? m.weightedPoolYes : m.weightedPoolNo;
        uint256 userWeightedStake = weightedStakes[id][msg.sender][m.outcome];
        assert(weightedWinningPool > 0);

        claimed[id][msg.sender] = true;

        uint256 losingShare = (userWeightedStake * losingPool) / weightedWinningPool;
        uint256 fee = (losingShare * m.feeBp) / BP_DENOMINATOR;
        uint256 winnings = losingShare - fee;
        uint256 payout = userStake + winnings;

        accumulatedFees += fee;
        betToken.safeTransfer(msg.sender, payout);

        emit Claimed(id, msg.sender, payout);
    }

    /// @notice Owner escape hatch for a market that can't resolve cleanly (e.g. the
    /// feed is broken). Only before resolution — never overrides an already-settled
    /// outcome.
    function voidMarket(uint256 id, string calldata reason) external onlyOwner {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        m.status = Status.Cancelled;
        emit MarketVoided(id, reason);
    }

    /// @notice Reclaim your own stake from a voided/cancelled market. Always the
    /// full amount — no fee is ever taken on a cancelled market.
    function refund(uint256 id, Side side) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Cancelled, "not cancelled");

        uint256 amount = stakes[id][msg.sender][side];
        require(amount > 0, "nothing to refund");

        stakes[id][msg.sender][side] = 0;
        betToken.safeTransfer(msg.sender, amount);

        emit Refunded(id, msg.sender, side, amount);
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return markets[id];
    }
}
