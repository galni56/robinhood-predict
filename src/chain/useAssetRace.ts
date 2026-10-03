import { useMemo } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { usePrograms } from '@/solana/programs'
import { racePda, racePositionPda } from '@/solana/pda'
import { useLivePrices } from '@/chain/livePrices'
import { useHistory } from '@/chain/history'
import {
  ASSET_RACE_STATUS,
  positionFromAccount,
  raceFromAccount,
  type AssetRaceAsset,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

const ACTIVE_POLL_MS = 4_000

export interface RaceSettlement {
  type: 'claim' | 'refund'
  amount: bigint
  signature: string
}

/** One race, the connected wallet's position in it, and display prices while
 * it runs. A claim or refund closes the position account, so a settled
 * position is recovered from the indexer's activity feed. */
export function useAssetRace(raceId: bigint | null, wallet?: PublicKey | null) {
  const { games } = usePrograms()
  const raceKey = useMemo(() => (raceId == null ? null : racePda(raceId)), [raceId])
  const positionKey = useMemo(() => (raceKey && wallet ? racePositionPda(raceKey, wallet) : null), [raceKey, wallet])

  const raceQuery = useQuery({
    queryKey: ['race', raceKey?.toBase58()],
    queryFn: async () => {
      const account = await games.account.race.fetchNullable(raceKey!)
      return account ? raceFromAccount(raceKey!, account) : null
    },
    enabled: !!raceKey,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      const terminal = status === ASSET_RACE_STATUS.RESOLVED || status === ASSET_RACE_STATUS.CANCELLED || status === ASSET_RACE_STATUS.VOID
      return terminal ? 30_000 : ACTIVE_POLL_MS
    },
  })
  const positionQuery = useQuery({
    queryKey: ['race-position', positionKey?.toBase58()],
    queryFn: async () => positionFromAccount(await games.account.position.fetchNullable(positionKey!)) ?? null,
    enabled: !!positionKey,
    refetchInterval: ACTIVE_POLL_MS,
  })

  const base = raceQuery.data ?? undefined
  const showLive = base?.status === ASSET_RACE_STATUS.RUNNING || base?.status === ASSET_RACE_STATUS.BETTING
  const live = useLivePrices({ enabled: showLive })
  const history = useHistory({ enabled: !!base && !!wallet })

  const race = useMemo<AssetRaceViewModel | undefined>(() => {
    if (!base) return undefined
    return {
      ...base,
      assets: base.assets.map((asset): AssetRaceAsset => {
        const price = showLive ? live.assets[asset.symbol] : undefined
        // A display price is only comparable to the start price at the same precision.
        const usable = price && price.decimals === asset.expectedDecimals
        return {
          ...asset,
          livePrice: usable ? price.raw : undefined,
          liveDecimals: usable ? price.decimals : asset.expectedDecimals,
          liveProvider: usable ? 'PRICE_SERVICE' : undefined,
          liveStale: showLive && !usable,
        }
      }),
    }
  }, [base, live.assets, showLive])

  const settlement = useMemo<RaceSettlement | undefined>(() => {
    if (!base || !wallet) return undefined
    const me = wallet.toBase58()
    const event = history.data?.activity.find((item) => (
      item.gameAddress === base.address && item.wallet === me && (item.type === 'claim' || item.type === 'refund')
    ))
    return event ? { type: event.type as RaceSettlement['type'], amount: BigInt(event.amount ?? '0'), signature: event.signature } : undefined
  }, [base, history.data, wallet])

  return {
    race,
    position: positionQuery.data ?? undefined,
    settlement,
    liveDisconnected: showLive && live.disconnected,
    isLoading: raceQuery.isLoading,
    error: raceQuery.error,
    refetch: async () => { await Promise.all([raceQuery.refetch(), positionQuery.refetch()]) },
  }
}
