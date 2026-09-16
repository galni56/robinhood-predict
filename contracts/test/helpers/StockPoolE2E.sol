// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Anvil-only protocol-shape fixtures, never production AMM implementations.
contract LocalPoolToken is ERC20 {
    uint8 private immutable tokenDecimals;

    constructor(string memory tokenName, string memory tokenSymbol, uint8 decimals_) ERC20(tokenName, tokenSymbol) {
        require(block.chainid == 31337, "Anvil only");
        tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LocalRaceV3Factory {
    mapping(bytes32 => address) private pools;

    constructor() {
        require(block.chainid == 31337, "Anvil only");
    }

    function setPool(address token0, address token1, uint24 fee, address pool) external {
        pools[keccak256(abi.encode(token0, token1, fee))] = pool;
    }

    function getPool(address token0, address token1, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encode(token0, token1, fee))];
    }
}

contract LocalRaceV3Pool {
    address public immutable token0;
    address public immutable token1;
    address public immutable factory;
    uint24 public immutable fee;
    uint160 private sqrtPriceX96;

    constructor(address token0_, address token1_, address factory_, uint24 fee_, uint160 sqrtPrice_) {
        require(block.chainid == 31337, "Anvil only");
        token0 = token0_;
        token1 = token1_;
        factory = factory_;
        fee = fee_;
        sqrtPriceX96 = sqrtPrice_;
    }

    function setSqrtPrice(uint160 value) external {
        require(value > 0, "positive price");
        sqrtPriceX96 = value;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (sqrtPriceX96, 0, 0, 0, 0, 0, true);
    }
}

/// Minimal StateView-shaped fixture for historical native-V4 pricing reads.
/// It does not simulate PoolManager swaps, liquidity or hook execution.
contract LocalRaceV4StateView {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct State {
        uint160 sqrtPriceX96;
        uint24 fee;
    }

    mapping(bytes32 => State) private states;

    constructor() {
        require(block.chainid == 31337, "Anvil only");
    }

    function setSqrtPrice(PoolKey calldata key, uint160 value) external {
        require(block.chainid == 31337, "Anvil only");
        require(key.currency0 == address(0) && key.currency1 != address(0), "native quote only");
        require(key.hooks == address(0) && key.tickSpacing > 0, "hook-free key only");
        require(value > 0, "positive price");
        states[keccak256(abi.encode(key))] = State(value, key.fee);
    }

    function getSlot0(bytes32 poolId) external view returns (uint160, int24, uint24, uint24) {
        State storage state = states[poolId];
        require(state.sqrtPriceX96 > 0, "unknown pool key");
        return (state.sqrtPriceX96, 0, 0, state.fee);
    }
}
