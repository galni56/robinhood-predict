// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAssetRaceOracle} from "../interfaces/IAssetRaceOracle.sol";

/// @notice MVP adapter for observations signed by the project's Robinhood
/// Stock quote collector. The collector signs raw underlying-equity midpoints;
/// callers can relay proofs but cannot alter their contents.
contract SignedRobinhoodRaceOracle is IAssetRaceOracle, EIP712 {
    struct SignedObservation {
        bytes32 oracleId;
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
        uint256 sequence;
    }

    bytes32 public constant OBSERVATION_TYPEHASH =
        keccak256("PriceObservation(bytes32 oracleId,uint256 price,uint8 decimals,uint256 updatedAt,uint256 sequence)");

    address public immutable TRUSTED_SIGNER;

    error InvalidAddress();
    error InvalidObservationProof();
    error InvalidSigner();
    error ProofRequired();

    constructor(address signer) EIP712("SignedRobinhoodRaceOracle", "1") {
        if (signer == address(0)) revert InvalidAddress();
        TRUSTED_SIGNER = signer;
    }

    function endpointProofType() external pure returns (EndpointProofType) {
        return EndpointProofType.SIGNED_OBSERVATION_PAIR;
    }

    function latestObservation(bytes32) external pure returns (Observation memory) {
        revert ProofRequired();
    }

    /// @notice Verifies two consecutive collector observations and returns the
    /// first one at or after the predetermined endpoint.
    function endpointObservation(
        bytes32 oracleId,
        uint256 targetTimestamp,
        uint256 maxEndpointLag,
        bytes calldata proof
    ) external view returns (Observation memory observation) {
        (
            SignedObservation memory previous,
            bytes memory previousSignature,
            SignedObservation memory selected,
            bytes memory selectedSignature
        ) = abi.decode(proof, (SignedObservation, bytes, SignedObservation, bytes));

        if (
            oracleId == bytes32(0) || previous.oracleId != oracleId || selected.oracleId != oracleId
                || previous.price == 0 || selected.price == 0 || previous.decimals != selected.decimals
                || previous.updatedAt >= targetTimestamp || selected.updatedAt < targetTimestamp
                || selected.updatedAt > targetTimestamp + maxEndpointLag || selected.sequence != previous.sequence + 1
        ) revert InvalidObservationProof();

        bytes32 previousDigest = _observationDigest(previous);
        bytes32 selectedDigest = _observationDigest(selected);
        if (ECDSA.recover(previousDigest, previousSignature) != TRUSTED_SIGNER) revert InvalidSigner();
        if (ECDSA.recover(selectedDigest, selectedSignature) != TRUSTED_SIGNER) revert InvalidSigner();

        observation = Observation({
            price: selected.price,
            decimals: selected.decimals,
            updatedAt: selected.updatedAt,
            observationId: selectedDigest
        });
    }

    function observationDigest(SignedObservation calldata observation) external view returns (bytes32) {
        return _observationDigest(observation);
    }

    function _observationDigest(SignedObservation memory observation) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    OBSERVATION_TYPEHASH,
                    observation.oracleId,
                    observation.price,
                    observation.decimals,
                    observation.updatedAt,
                    observation.sequence
                )
            )
        );
    }
}
