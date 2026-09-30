import { zeroAddress, type Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { assetRaceChain } from '@/chain/config'
import { ACTIVE_GAME_POLL_INTERVAL_MS, ACTIVE_GAME_REFRESH_OPTIONS } from '@/chain/gameSnapshots'
import { PRICE_ARENA_ADDRESS, priceArenaAbi, priceArenaAsset, type PriceArenaData, type PriceArenaEntry } from '@/chain/priceArena'
import { isCoherentPriceArenaSnapshot } from '@/chain/priceArenaSnapshot'

export function usePriceArena(arenaId: bigint | null, wallet?: Address) {
  const address = PRICE_ARENA_ADDRESS ?? zeroAddress
  const enabled = !!PRICE_ARENA_ADDRESS && arenaId != null
  const limitsQuery = useReadContracts({
    contracts: [
      { address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'minStakeWei' },
      { address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'maxStakeWei' },
    ],
    query: { enabled: !!PRICE_ARENA_ADDRESS },
  })
  const arenaQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena',
    args: arenaId == null ? undefined : [arenaId],
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const phaseQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase',
    args: arenaId == null ? undefined : [arenaId],
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const participantsQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getParticipants',
    args: arenaId == null ? undefined : [arenaId],
    query: { enabled, refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS, ...ACTIVE_GAME_REFRESH_OPTIONS },
  })
  const participants = (participantsQuery.data ?? []) as readonly Address[]
  const entryQueries = useReadContracts({
    contracts: participants.map((player) => ({ address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getEntry', args: [arenaId!, player] }) as const),
    query: {
      enabled: enabled && participants.length > 0,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const walletQuery = useReadContract({
    address, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getEntry',
    args: arenaId != null && wallet ? [arenaId, wallet] : undefined,
    query: {
      enabled: enabled && !!wallet,
      refetchInterval: ACTIVE_GAME_POLL_INTERVAL_MS,
      ...ACTIVE_GAME_REFRESH_OPTIONS,
    },
  })
  const rawArena = arenaQuery.data as unknown as PriceArenaData | undefined
  const phase = Number(phaseQuery.data ?? 0)
  const asset = rawArena ? priceArenaAsset(rawArena.assetId) : undefined
  const arena = rawArena && isCoherentPriceArenaSnapshot(rawArena, phase, asset?.category)
    ? { ...rawArena, id: arenaId!, phase, asset }
    : undefined
  const entries = participants.flatMap((player, index) => {
    const result = entryQueries.data?.[index]
    return result?.status === 'success' ? [{ player, entry: result.result as unknown as PriceArenaEntry }] : []
  })
  const minStakeResult = limitsQuery.data?.[0]
  const maxStakeResult = limitsQuery.data?.[1]

  return {
    arena,
    entries,
    walletEntry: walletQuery.data as unknown as PriceArenaEntry | undefined,
    minStakeWei: minStakeResult?.status === 'success' ? minStakeResult.result : undefined,
    maxStakeWei: maxStakeResult?.status === 'success' ? maxStakeResult.result : undefined,
    isLoading: enabled && (limitsQuery.isLoading || arenaQuery.isLoading || phaseQuery.isLoading || participantsQuery.isLoading || entryQueries.isLoading),
    error: limitsQuery.error ?? arenaQuery.error ?? phaseQuery.error ?? participantsQuery.error ?? entryQueries.error ?? walletQuery.error,
    refetch: async () => Promise.all([limitsQuery.refetch(), arenaQuery.refetch(), phaseQuery.refetch(), participantsQuery.refetch(), entryQueries.refetch(), walletQuery.refetch()]),
  }
}
