// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAssetRaceOracle} from "./interfaces/IAssetRaceOracle.sol";

/// @title PredictionMarket
/// @notice Parimutuel YES/NO prediction market: "Is <StockToken> at or above
/// <target> USDG at <deadline>?", settled from the same deterministic
/// StockToken/USDG pool endpoint used by Asset Race.
/// Stakes, payouts, refunds and protocol fees are all denominated in native ETH.
///
/// @dev STATUS: this deadline-settlement revision is tested but not deployed.
/// A legacy revision is live on mainnet. Neither revision has had an independent
/// security review; see contracts/CLAUDE.md before any production rollout.
contract PredictionMarket is ReentrancyGuard, Ownable {
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
        bytes32 assetId; // bytes32 ticker, e.g. bytes32("TSLA")
        bytes32 oracleId; // frozen StockToken/USDG pool identity
        uint8 priceDecimals; // frozen price scale for target and settlement
        int256 targetPrice; // scaled to `priceDecimals`
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

    struct Settlement {
        uint256 price;
        uint256 updatedAt;
        bytes32 observationId;
    }

    struct AssetConfig {
        bytes32 oracleId;
        uint8 decimals;
        bool allowed;
    }

    /// @dev The selected endpoint is the last Robinhood block strictly before
    /// the deadline. If that block is unexpectedly farther away than one minute,
    /// cancel rather than settle from an old pool state.
    uint256 public constant MAX_PRICE_STALENESS = 60 seconds;

    /// @dev Anti-griefing: `createMarket` is permissionless, so without a
    /// floor a creator could open a market seconds before its own deadline,
    /// bet immediately, and leave no real window for a counterparty to react.
    /// Matches the shortest frontend duration preset (1 hour).
    uint256 public constant MIN_MARKET_DURATION = 30 minutes;

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

    /// @notice Shared verifier for signed historical StockToken/USDG pool
    /// endpoint observations. It is deployed separately and also used by races.
    IAssetRaceOracle public immutable endpointOracle;

    /// @notice Native-ETH guardrails configured at deployment, both in wei.
    /// They are approximate dollar exposure limits only: ETH/USD is deliberately
    /// not an onchain dependency and the UI enforces the exact $1-$50 product range.
    uint256 public immutable maxSeedLiquidityWei;

    /// @dev A wallet may stake up to this amount on YES and independently on NO.
    /// This bounds one late bet's influence without pretending ETH has a fixed
    /// dollar price; the deployer chooses the wei value before deployment.
    uint256 public immutable maxStakePerSideWei;

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
    mapping(uint256 => Settlement) public settlements;
    // A single address may still take both sides, but it only counts once.
    // Resolution requires two distinct participant addresses as well as two
    // funded sides; this is an address-level P2P guard, not Sybil resistance.
    mapping(uint256 => uint256) public participantCount;
    mapping(uint256 => mapping(address => bool)) public hasParticipated;

    /// @dev Market creation is permissionless, but every asset must be bound by
    /// the owner to a reviewed pool oracle id and price scale first.
    mapping(bytes32 => AssetConfig) public approvedAssets;

    event MarketCreated(
        uint256 indexed id, bytes32 indexed assetId, bytes32 indexed oracleId, int256 targetPrice, uint256 deadline
    );
    event BetPlaced(uint256 indexed id, address indexed user, Side side, uint256 amount, uint256 weightBp);
    event MarketResolved(uint256 indexed id, Side outcome, int256 settlePrice);
    event MarketVoided(uint256 indexed id, string reason);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event Refunded(uint256 indexed id, address indexed user, Side side, uint256 amount);
    event AssetConfigured(bytes32 indexed assetId, bytes32 indexed oracleId, uint8 decimals, bool allowed);
    event FeeBpUpdated(uint256 feeBp);
    event FeesWithdrawn(address indexed to, uint256 amount);

    constructor(address _endpointOracle, uint256 _feeBp, uint256 _maxSeedLiquidityWei, uint256 _maxStakePerSideWei)
        Ownable(msg.sender)
    {
        require(_endpointOracle != address(0), "oracle = zero addr");
        require(_feeBp <= MAX_FEE_BP, "fee exceeds max");
        require(_maxSeedLiquidityWei > 0, "seed cap = 0");
        require(_maxStakePerSideWei > 0, "stake cap = 0");
        endpointOracle = IAssetRaceOracle(_endpointOracle);
        feeBp = _feeBp;
        maxSeedLiquidityWei = _maxSeedLiquidityWei;
        maxStakePerSideWei = _maxStakePerSideWei;
    }

    receive() external payable {
        revert("direct ETH disabled");
    }

    fallback() external payable {
        revert("direct ETH disabled");
    }

    /// @notice Bind a public asset id to one reviewed StockToken/USDG pool.
    /// Existing markets retain their frozen oracle id and decimals if this
    /// configuration is later changed or disabled.
    function setAssetAllowed(bytes32 assetId, bytes32 oracleId, uint8 decimals, bool allowed) external onlyOwner {
        require(assetId != bytes32(0), "asset = zero id");
        require(oracleId != bytes32(0), "oracle = zero id");
        require(decimals > 0, "decimals = 0");
        approvedAssets[assetId] = AssetConfig({oracleId: oracleId, decimals: decimals, allowed: allowed});
        emit AssetConfigured(assetId, oracleId, decimals, allowed);
    }

    /// @notice Update the protocol fee for markets created from now on. Never
    /// affects a market that's already open — see `Market.feeBp`.
    function setFeeBp(uint256 _feeBp) external onlyOwner {
        require(_feeBp <= MAX_FEE_BP, "fee exceeds max");
        feeBp = _feeBp;
        emit FeeBpUpdated(_feeBp);
    }

    /// @notice Withdraw accumulated protocol fees to `to`.
    function withdrawFees(address to) external onlyOwner nonReentrant {
        require(to != address(0), "to = zero addr");
        uint256 amount = accumulatedFees;
        accumulatedFees = 0;
        _sendEth(to, amount);
        emit FeesWithdrawn(to, amount);
    }

    /// @notice Create a new market. Permissionless — any address may call this —
    /// but `assetId` must already be configured by the owner. The contract does
    /// not read a manipulable spot price during creation; the UI shows the live
    /// pool price and applies product-level target guidance.
    ///
    /// `initialYesAmount`/`initialNoAmount` let the owner seed both sides of a
    /// fresh market with house liquidity (e.g. to open at 50/50 odds instead of
    /// waiting for organic bets on both sides) — only the owner may pass non-zero
    /// values here, and their combined size is capped at `maxSeedLiquidityWei`.
    /// Regular permissionless callers pass `(0, 0)`. Either way, a market that
    /// lacks a funded side or a second distinct participant address at its
    /// deadline is cancelled instead of resolved — see `resolve`.
    function createMarket(
        bytes32 assetId,
        int256 targetPrice,
        uint256 deadline,
        uint256 initialYesAmount,
        uint256 initialNoAmount
    ) external payable nonReentrant returns (uint256 id) {
        AssetConfig memory asset = approvedAssets[assetId];
        require(asset.allowed, "asset not allowed");
        require(deadline > block.timestamp, "deadline in the past");
        require(deadline - block.timestamp >= MIN_MARKET_DURATION, "market duration too short");
        require(targetPrice > 0, "target must be > 0");

        uint256 seedAmount = initialYesAmount + initialNoAmount;
        require(msg.value == seedAmount, "incorrect ETH amount");
        if (seedAmount > 0) {
            require(msg.sender == owner(), "seed liquidity is owner-only");
            require(seedAmount <= maxSeedLiquidityWei, "seed exceeds max");
        }

        id = marketCount++;
        Market storage m = markets[id];
        m.assetId = assetId;
        m.oracleId = asset.oracleId;
        m.priceDecimals = asset.decimals;
        m.targetPrice = targetPrice;
        m.createdAt = block.timestamp;
        m.deadline = deadline;
        m.status = Status.Open;
        m.feeBp = feeBp;
        emit MarketCreated(id, assetId, asset.oracleId, targetPrice, deadline);

        // Seed liquidity lands at creation time (elapsed = 0), so it always
        // gets MAX_WEIGHT_BP — consistent with "earliest possible bet".
        if (seedAmount > 0) _recordParticipant(id, msg.sender);
        if (initialYesAmount > 0) {
            stakes[id][msg.sender][Side.YES] += initialYesAmount;
            uint256 weighted = (initialYesAmount * MAX_WEIGHT_BP) / BP_DENOMINATOR;
            weightedStakes[id][msg.sender][Side.YES] += weighted;
            m.poolYes = initialYesAmount;
            m.weightedPoolYes = weighted;
            emit BetPlaced(id, msg.sender, Side.YES, initialYesAmount, MAX_WEIGHT_BP);
        }
        if (initialNoAmount > 0) {
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

    /// @notice Bet `amount` wei of native ETH on `side` for market `id`.
    /// `msg.value` must equal `amount`. One bet per side per market —
    /// once you've staked on a side, a second call on that same side reverts
    /// (you can still bet the *other* side once, if you haven't already).
    ///
    /// Betting closes at `bettingWindowEnd(id)`, earlier than `deadline` — see
    /// `BETTING_WINDOW_BP`. The earlier you bet within that window, the bigger
    /// a share of the losing pool your stake is weighted for if you win (your
    /// principal is unaffected either way) — see `currentWeightBp`.
    function bet(uint256 id, Side side, uint256 amount) external payable nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(amount > 0, "amount = 0");
        require(msg.value == amount, "incorrect ETH amount");
        require(stakes[id][msg.sender][side] == 0, "already bet this side");
        require(amount <= maxStakePerSideWei, "exceeds max stake per side");

        uint256 weightBp = currentWeightBp(id); // reverts "betting closed" past the window
        _recordParticipant(id, msg.sender);

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

    /// @notice Resolve a market once its deadline has passed, using the last
    /// valid StockToken/USDG pool state from the last Robinhood block strictly
    /// before the scheduled deadline. Its adjacent child proves the boundary.
    /// Callable by anyone (keeper-friendly); execution time cannot change the outcome.
    ///
    /// If either side never got a bet or fewer than two distinct addresses
    /// participated, the market is cancelled instead of resolved. One address
    /// may hold both sides but cannot make its own market eligible for settlement.
    /// Cancelling lets whoever did bet reclaim their own stake in full via `refund`.
    function resolve(uint256 id, bytes calldata endpointProof) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(block.timestamp >= m.deadline, "too early");

        if (m.poolYes == 0 || m.poolNo == 0) {
            m.status = Status.Cancelled;
            emit MarketVoided(id, "one-sided market: no counter-bets");
            return;
        }
        if (participantCount[id] < 2) {
            m.status = Status.Cancelled;
            emit MarketVoided(id, "fewer than two participants");
            return;
        }

        IAssetRaceOracle.Observation memory observation =
            endpointOracle.endpointObservation(m.oracleId, m.deadline, MAX_PRICE_STALENESS, endpointProof);
        require(observation.price > 0 && observation.price <= uint256(type(int256).max), "invalid pool price");
        require(observation.decimals == m.priceDecimals, "price decimals changed");
        require(observation.updatedAt > 0 && observation.updatedAt < m.deadline, "invalid endpoint timestamp");

        if (m.deadline - observation.updatedAt > MAX_PRICE_STALENESS) {
            m.status = Status.Cancelled;
            emit MarketVoided(id, "stale deadline price");
            return;
        }

        settlements[id] = Settlement({
            price: observation.price, updatedAt: observation.updatedAt, observationId: observation.observationId
        });

        m.status = Status.Resolved;
        m.outcome = observation.price >= uint256(m.targetPrice) ? Side.YES : Side.NO;

        emit MarketResolved(id, m.outcome, int256(observation.price));
    }

    /// @notice Claim payout after a market resolves in your favor. Parimutuel with
    /// a protocol fee taken only from the losing pool's contribution — your own
    /// stake always comes back in full:
    ///
    ///   payout = yourStake + yourWeightedStake * losingPool * (10000 - feeBp) / (weightedWinningPool * 10000)
    ///
    /// `losingPool` is the *raw* wei amount forfeited by the losing side —
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
        _sendEth(msg.sender, payout);

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
        _sendEth(msg.sender, amount);

        emit Refunded(id, msg.sender, side, amount);
    }

    function getMarket(uint256 id) external view returns (Market memory) {
        return markets[id];
    }

    function _recordParticipant(uint256 id, address participant) private {
        if (hasParticipated[id][participant]) return;
        hasParticipated[id][participant] = true;
        participantCount[id] += 1;
    }

    function _sendEth(address to, uint256 amount) private {
        (bool success,) = payable(to).call{value: amount}("");
        require(success, "ETH transfer failed");
    }
}
