// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";

/// @title PredictionMarket
/// @notice Parimutuel YES/NO prediction market: "Does <stock token> reach
/// $<target> by <deadline>?", settled by reading a Chainlink price feed.
/// Bets are placed in a single ERC-20 bet token (e.g. a USD stablecoin).
///
/// @dev STATUS: written but NOT compiled or tested — Foundry is not installed
/// on the machine this was authored on (deliberately, by the owner's choice).
/// See contracts/CLAUDE.md for exactly how to build, test and deploy this
/// before it is trusted with a single real token. Do not deploy to mainnet,
/// or accept real user funds on any network, before:
///   1. `forge test` passes locally, including the edge cases noted inline
///   2. an independent security review (this has not had one)
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
        uint256 deadline; // unix timestamp — bets close here, resolution allowed after
        uint256 poolYes;
        uint256 poolNo;
        Status status;
        Side outcome;
    }

    /// @dev Max age (seconds) a Chainlink round may have at resolution time before
    /// it's considered stale and resolution is refused. Tune per feed heartbeat —
    /// see contracts/CLAUDE.md for how to find the actual heartbeat for a given feed.
    uint256 public constant MAX_PRICE_STALENESS = 1 hours;

    IERC20 public immutable betToken;

    uint256 public marketCount;
    mapping(uint256 => Market) public markets;
    // marketId => user => side => amount staked
    mapping(uint256 => mapping(address => mapping(Side => uint256))) public stakes;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event MarketCreated(uint256 indexed id, address indexed priceFeed, int256 targetPrice, uint256 deadline);
    event BetPlaced(uint256 indexed id, address indexed user, Side side, uint256 amount);
    event MarketResolved(uint256 indexed id, Side outcome, int256 settlePrice);
    event MarketVoided(uint256 indexed id, string reason);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);
    event Refunded(uint256 indexed id, address indexed user, Side side, uint256 amount);

    constructor(address _betToken) Ownable(msg.sender) {
        require(_betToken != address(0), "bet token = zero addr");
        betToken = IERC20(_betToken);
    }

    /// @notice Create a new market. Owner-gated for the MVP (permissionless market
    /// creation is a reasonable v2 step, but widens the attack surface — e.g. someone
    /// pointing `priceFeed` at a bogus/manipulable contract).
    function createMarket(address priceFeed, int256 targetPrice, uint256 deadline) external onlyOwner returns (uint256 id) {
        require(priceFeed != address(0), "feed = zero addr");
        require(deadline > block.timestamp, "deadline in the past");
        require(targetPrice > 0, "target must be > 0");

        id = marketCount++;
        markets[id] = Market({
            priceFeed: priceFeed,
            targetPrice: targetPrice,
            deadline: deadline,
            poolYes: 0,
            poolNo: 0,
            status: Status.Open,
            outcome: Side.NO
        });

        emit MarketCreated(id, priceFeed, targetPrice, deadline);
    }

    /// @notice Bet `amount` of `betToken` on `side` for market `id`. Requires prior
    /// `betToken.approve(address(this), amount)`.
    function bet(uint256 id, Side side, uint256 amount) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(block.timestamp < m.deadline, "betting closed");
        require(amount > 0, "amount = 0");

        betToken.safeTransferFrom(msg.sender, address(this), amount);
        stakes[id][msg.sender][side] += amount;
        if (side == Side.YES) {
            m.poolYes += amount;
        } else {
            m.poolNo += amount;
        }

        emit BetPlaced(id, msg.sender, side, amount);
    }

    /// @notice Resolve a market once its deadline has passed, using the Chainlink feed.
    /// Callable by anyone (keeper-friendly) once the deadline has passed.
    /// If nobody backed the winning side, the market is voided instead of resolved
    /// so the losing side's stakes are refundable rather than stuck forever.
    function resolve(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Open, "market not open");
        require(block.timestamp >= m.deadline, "too early");

        (, int256 price,, uint256 updatedAt,) = AggregatorV3Interface(m.priceFeed).latestRoundData();
        require(price > 0, "invalid feed answer");
        require(block.timestamp - updatedAt <= MAX_PRICE_STALENESS, "stale price feed");

        Side outcome = price >= m.targetPrice ? Side.YES : Side.NO;
        uint256 winningPool = outcome == Side.YES ? m.poolYes : m.poolNo;

        if (winningPool == 0) {
            // Nobody backed the correct side — there's no one to pay the losing
            // pool out to. Void the market so everyone who did bet can reclaim
            // their own stake via `refund`, instead of funds being stranded.
            m.status = Status.Cancelled;
            emit MarketVoided(id, "no stake on winning side");
            return;
        }

        m.status = Status.Resolved;
        m.outcome = outcome;
        emit MarketResolved(id, outcome, price);
    }

    /// @notice Claim payout after a market resolves in your favor. Parimutuel:
    /// payout = yourStake * totalPool / winningPool.
    function claim(uint256 id) external nonReentrant {
        Market storage m = markets[id];
        require(m.status == Status.Resolved, "not resolved");
        require(!claimed[id][msg.sender], "already claimed");

        uint256 userStake = stakes[id][msg.sender][m.outcome];
        require(userStake > 0, "no winning stake");

        uint256 winningPool = m.outcome == Side.YES ? m.poolYes : m.poolNo;
        uint256 totalPool = m.poolYes + m.poolNo;
        uint256 payout = (userStake * totalPool) / winningPool;

        claimed[id][msg.sender] = true;
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

    /// @notice Reclaim your own stake from a voided/cancelled market.
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
