import { useMemo } from 'react'
import { zeroAddress, type Address } from 'viem'
import { useReadContracts } from 'wagmi'
import {
  ASSET_RACE_ADDRESS,
  assetRaceAbi,
  normalizeRaceAssets,
  type AssetRaceAsset,
  type AssetRaceData,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'
import { assetRaceChain } from '@/chain/config'
import { useWalletAssetRaceIds, useWalletPriceArenaIds } from '@/chain/gameHistory'
import {
  PRICE_ARENA_ADDRESS,
  priceArenaAbi,
  priceArenaAsset,
  type PriceArenaData,
  type PriceArenaEntry,
  type PriceArenaViewModel,
} from '@/chain/priceArena'
import { isCoherentPriceArenaSnapshot } from '@/chain/priceArenaSnapshot'

export interface WalletRacePosition {
  race: AssetRaceViewModel
  position: AssetRacePosition
}

export interface WalletArenaPosition {
  arena: PriceArenaViewModel
  entry: PriceArenaEntry
}

const EMPTY_GAME_IDS: bigint[] = []

export function useWalletGamePositions(wallet?: Address) {
  const raceIdsQuery = useWalletAssetRaceIds(wallet)
  const arenaIdsQuery = useWalletPriceArenaIds(wallet)
  const raceIds = raceIdsQuery.data ?? EMPTY_GAME_IDS
  const arenaIds = arenaIdsQuery.data ?? EMPTY_GAME_IDS
  const raceAddress = ASSET_RACE_ADDRESS ?? zeroAddress
  const arenaAddress = PRICE_ARENA_ADDRESS ?? zeroAddress

  const raceReads = useReadContracts({
    contracts: raceIds.flatMap((id) => [
      ({ address: raceAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const,
      ({ address: raceAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getRaceAssets', args: [id] }) as const,
      ({ address: raceAddress, chainId: assetRaceChain.id, abi: assetRaceAbi, functionName: 'getPosition', args: [id, wallet ?? zeroAddress] }) as const,
    ]),
    query: { enabled: !!wallet && !!ASSET_RACE_ADDRESS && raceIds.length > 0 },
  })

  const arenaReads = useReadContracts({
    contracts: arenaIds.flatMap((id) => [
      ({ address: arenaAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const,
      ({ address: arenaAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'phase', args: [id] }) as const,
      ({ address: arenaAddress, chainId: assetRaceChain.id, abi: priceArenaAbi, functionName: 'getEntry', args: [id, wallet ?? zeroAddress] }) as const,
    ]),
    query: { enabled: !!wallet && !!PRICE_ARENA_ADDRESS && arenaIds.length > 0 },
  })

  const races = useMemo(() => raceIds.flatMap((id, index): WalletRacePosition[] => {
    const raceResult = raceReads.data?.[index * 3]
    const assetsResult = raceReads.data?.[index * 3 + 1]
    const positionResult = raceReads.data?.[index * 3 + 2]
    if (raceResult?.status !== 'success' || assetsResult?.status !== 'success' || positionResult?.status !== 'success') return []
    const assets = normalizeRaceAssets(
      assetsResult.result as readonly Omit<AssetRaceAsset, 'assetIndex' | 'symbol' | 'feedAddress'>[],
    )
    const position = positionResult.result as AssetRacePosition
    if (!position.exists) return []
    return [{
      race: { ...(raceResult.result as AssetRaceData), id, assets, source: 'onchain' },
      position,
    }]
  }), [raceIds, raceReads.data])

  const arenas = useMemo(() => arenaIds.flatMap((id, index): WalletArenaPosition[] => {
    const arenaResult = arenaReads.data?.[index * 3]
    const phaseResult = arenaReads.data?.[index * 3 + 1]
    const entryResult = arenaReads.data?.[index * 3 + 2]
    if (arenaResult?.status !== 'success' || phaseResult?.status !== 'success' || entryResult?.status !== 'success') return []
    const arena = arenaResult.result as unknown as PriceArenaData
    const phase = Number(phaseResult.result)
    const asset = priceArenaAsset(arena.assetId)
    const entry = entryResult.result as PriceArenaEntry
    if (!entry.exists || !isCoherentPriceArenaSnapshot(arena, phase, asset?.category)) return []
    return [{ arena: { ...arena, id, phase, asset }, entry }]
  }), [arenaIds, arenaReads.data])

  return {
    races,
    arenas,
    isLoading: raceIdsQuery.isLoading || arenaIdsQuery.isLoading || raceReads.isLoading || arenaReads.isLoading,
    error: raceIdsQuery.error ?? arenaIdsQuery.error ?? raceReads.error ?? arenaReads.error,
  }
}
