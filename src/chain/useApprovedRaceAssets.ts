import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { assetRaceCatalogByPool } from '@/chain/assetRaceRegistry'
import { categoryCode, type ApprovedRaceAsset } from '@/chain/assetRaces'
import { useGameConfig } from '@/chain/useGameConfig'

const CATEGORY_NAMES = ['STOCK', 'MEME', 'CRYPTO'] as const

/** Assets approved on-chain for both games, shown only when they match a
 * reviewed catalog entry (same pool, category and price precision). */
export function useApprovedRaceAssets() {
  const { games } = usePrograms()
  const config = useGameConfig()
  const approved = useQuery({
    queryKey: ['approved-assets', games.programId.toBase58()],
    queryFn: () => games.account.approvedAsset.all(),
    refetchInterval: 60_000,
  })

  const assets = useMemo(() => (approved.data ?? []).flatMap(({ account }): ApprovedRaceAsset[] => {
    if (!account.enabled) return []
    const priceSource = account.priceSource.toBase58()
    const catalog = assetRaceCatalogByPool.get(priceSource)
    const category = categoryCode(account.category)
    if (!catalog?.enabled || CATEGORY_NAMES[category] !== catalog.category || catalog.priceDecimals !== account.priceDecimals) return []
    return [{
      assetId: catalog.assetId,
      enabled: true,
      category,
      priceSource,
      expectedDecimals: account.priceDecimals,
      symbol: catalog.symbol,
      name: catalog.displayName,
      logoUrl: catalog.logoUrl,
      priceUrl: catalog.priceUrl,
    }]
  }).sort((a, b) => a.symbol.localeCompare(b.symbol)), [approved.data])

  return {
    assets,
    durations: config.data?.raceDurations ?? [],
    isLoading: approved.isLoading || config.isLoading,
    error: approved.error ?? config.error,
    refetch: async () => { await Promise.all([approved.refetch(), config.refetch()]) },
  }
}
