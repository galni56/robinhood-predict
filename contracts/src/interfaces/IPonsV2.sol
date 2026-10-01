// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPonsV2FeeEscrow {
    function claim() external returns (uint256 amount);
    function balanceOf(address recipient) external view returns (uint256);
}

enum PonsV2GraduationPhase {
    NotGraduated,
    Swept,
    PoolCreated,
    Rescued
}

interface IPonsV2LaunchFactory {
    struct LaunchedToken {
        address token;
        address curve;
        address deployer;
        address creatorFeeRecipient;
        address pairToken;
        uint256 graduationThreshold;
        uint24 poolFee;
        int24 tickSpacing;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        PonsV2GraduationPhase phase;
        uint256 sweptQuote;
        uint256 sweptTokens;
        uint256 sweptAt;
        bool exists;
    }

    function getLaunchedToken(address token) external view returns (LaunchedToken memory);
    function feeEscrow() external view returns (address);
    function memeHook() external view returns (address);
    function poolManager() external view returns (address);
}

interface IPonsV2BondingCurve {
    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external payable returns (uint256 tokensOut);
}

interface IPonsV2LauncherToken {
    function balanceOf(address account) external view returns (uint256);
    function burn(uint256 amount) external;
}

interface IProphetPostGraduationBuybackExecutor {
    function buy(address token, uint256 minTokensOut, uint256 deadline) external payable returns (uint256 tokensOut);
}
