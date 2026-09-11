import type { Address } from 'viem'
import { useReadContract } from 'wagmi'

// Standalone from PredictionMarket on purpose -- any address, on any app
// reading this same contract, can look up the same nickname. No backend: a
// nickname only exists if that address itself wrote it on-chain (see
// contracts/src/NicknameRegistry.sol).
export const NICKNAME_REGISTRY_ADDRESS = (import.meta.env.VITE_NICKNAME_REGISTRY_ADDRESS ??
  '0x1Ddc13e9D4895a5E6671079478007C7371b76E75') as Address

export const nicknameRegistryAbi = [
  {
    type: 'function',
    name: 'nicknameOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'setNickname',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'nickname', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'MAX_LENGTH',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const

export function useNickname(address?: Address) {
  return useReadContract({
    address: NICKNAME_REGISTRY_ADDRESS,
    abi: nicknameRegistryAbi,
    functionName: 'nicknameOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
}
