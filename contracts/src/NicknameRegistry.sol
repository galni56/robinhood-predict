// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal on-chain nickname registry. Standalone from
/// PredictionMarket on purpose -- any app reading the same address can look
/// nicknames up, and a bug here can't affect market funds. No backend: a
/// nickname is only ever what an address has itself written on-chain, so
/// there's no server-side database to keep in sync or that could disagree
/// with what the chain says.
contract NicknameRegistry {
    uint256 public constant MAX_LENGTH = 24;

    mapping(address => string) public nicknameOf;

    event NicknameSet(address indexed user, string nickname);

    /// @notice Set (or clear, with "") the caller's own nickname. Anyone can
    /// only ever set their own -- there's no admin override, and no
    /// uniqueness check (two wallets can pick the same name; the address is
    /// still the real identity, the nickname is just a display label).
    function setNickname(string calldata nickname) external {
        require(bytes(nickname).length <= MAX_LENGTH, "nickname too long");
        nicknameOf[msg.sender] = nickname;
        emit NicknameSet(msg.sender, nickname);
    }
}
