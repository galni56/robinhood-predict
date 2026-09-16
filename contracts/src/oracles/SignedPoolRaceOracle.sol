// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAssetRaceOracle} from "../interfaces/IAssetRaceOracle.sol";

/// @notice Verifies endpoint prices derived from one frozen StockToken/USDG pool.
/// @dev The signer attests pool state and canonical block metadata. Relayers can
/// submit the signed pair but cannot change its price, source, or boundary block.
/// The price comes from the last block strictly before T. Its consecutive child
/// only proves the timestamp boundary; its transactions cannot change P(T).
contract SignedPoolRaceOracle is IAssetRaceOracle, EIP712 {
    struct SignedPoolObservation {
        bytes32 oracleId;
        uint256 price;
        uint8 decimals;
        uint256 blockNumber;
        bytes32 blockHash;
        bytes32 parentBlockHash;
        uint256 blockTimestamp;
    }

    bytes32 public constant OBSERVATION_TYPEHASH = keccak256(
        "PoolObservation(bytes32 oracleId,uint256 price,uint8 decimals,uint256 blockNumber,bytes32 blockHash,bytes32 parentBlockHash,uint256 blockTimestamp)"
    );

    address public immutable TRUSTED_SIGNER;

    error InvalidAddress();
    error InvalidObservationProof();
    error InvalidSigner();
    error ProofRequired();

    constructor(address signer) EIP712("SignedPoolRaceOracle", "1") {
        if (signer == address(0)) revert InvalidAddress();
        TRUSTED_SIGNER = signer;
    }

    function endpointProofType() external pure returns (EndpointProofType) {
        return EndpointProofType.SIGNED_POOL_BLOCK_PAIR;
    }

    function latestObservation(bytes32) external pure returns (Observation memory) {
        revert ProofRequired();
    }

    function endpointObservation(bytes32 oracleId, uint256 targetTimestamp, uint256, bytes calldata proof)
        external
        view
        returns (Observation memory observation)
    {
        (
            SignedPoolObservation memory previous,
            bytes memory previousSignature,
            SignedPoolObservation memory selected,
            bytes memory selectedSignature
        ) = abi.decode(proof, (SignedPoolObservation, bytes, SignedPoolObservation, bytes));

        if (
            oracleId == bytes32(0) || previous.oracleId != oracleId || selected.oracleId != oracleId
                || previous.price == 0 || selected.price == 0 || previous.decimals != selected.decimals
                || previous.blockHash == bytes32(0) || selected.blockHash == bytes32(0)
                || previous.blockHash == selected.blockHash || selected.parentBlockHash != previous.blockHash
                || selected.blockNumber != previous.blockNumber + 1 || previous.blockTimestamp >= targetTimestamp
                || selected.blockTimestamp < targetTimestamp || selected.blockTimestamp > block.timestamp
                || selected.blockTimestamp < previous.blockTimestamp
        ) revert InvalidObservationProof();

        if (ECDSA.recover(_observationDigest(previous), previousSignature) != TRUSTED_SIGNER) {
            revert InvalidSigner();
        }
        if (ECDSA.recover(_observationDigest(selected), selectedSignature) != TRUSTED_SIGNER) {
            revert InvalidSigner();
        }

        observation = Observation({
            price: previous.price,
            decimals: previous.decimals,
            updatedAt: previous.blockTimestamp,
            observationId: previous.blockHash
        });
    }

    function observationDigest(SignedPoolObservation calldata observation) external view returns (bytes32) {
        return _observationDigest(observation);
    }

    function _observationDigest(SignedPoolObservation memory observation) private view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    OBSERVATION_TYPEHASH,
                    observation.oracleId,
                    observation.price,
                    observation.decimals,
                    observation.blockNumber,
                    observation.blockHash,
                    observation.parentBlockHash,
                    observation.blockTimestamp
                )
            )
        );
    }
}
