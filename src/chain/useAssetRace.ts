import { useMemo } from 'react'
import type { PublicKey } from '@solana/web3.js'
import { useQuery } from '@tanstack/react-query'
import { marketCapUsd, useLivePrices } from '@/chain/livePrices'
import { getJson, type ServerRace } from '@/chain/gameServer'
import { GAME_SERVER_URL } from '@/solana/services'
import { DESIGN_SAMPLES_ENABLED, SAMPLE_RACES } from '@/chain/designSamples'
import {
  ASSET_RACE_STATUS,
  payoutFor,
  positionFor,
  raceFromServer,
  type AssetRaceAsset,
  type AssetRaceViewModel,
  type RacePayout,
} from '@/chain/assetRaces'

const ACTIVE_POLL_MS = 3_000

export interface RaceSettlement {
  type: 'claim' | 'refund'
  amount: bigint
  signature: string
}

/** One race, the connected wallet's position and payout, and display prices
 * while it runs. The game server pays winners and refunds on its own. */
export function useAssetRace(raceId: bigint | null, wallet?: PublicKey | null) {
  const raceQuery = useQuery({
    queryKey: ['race', raceId?.toString()],
    queryFn: async () => {
      try {
        return raceFromServer(await getJson<ServerRace>(`/games/race/${raceId}`))
      } catch (error) {
        if (error instanceof Error && error.message === 'GameNotFound') return null
        throw error
      }
    },
    enabled: raceId != null && GAME_SERVER_URL != null,
    refetchInterval: (query) => {
      const race = query.state.data
      const terminal = race && (race.status === ASSET_RACE_STATUS.RESOLVED || race.status === ASSET_RACE_STATUS.CANCELLED || race.status === ASSET_RACE_STATUS.VOID)
      // Keep polling a finished race until every payout has landed.
      return terminal && race.payouts.every((p) => p.status === 'done') ? 30_000 : ACTIVE_POLL_MS
    },
  })

  // Dev-only: sample races stand in so detail screens can be designed
  // without servers (same gate as the list hooks).
  const sample = DESIGN_SAMPLES_ENABLED && raceId != null ? SAMPLE_RACES.find((item) => item.id === raceId) : undefined
  const base = raceQuery.data ?? (raceQuery.isFetched || raceQuery.isError || GAME_SERVER_URL == null ? sample : undefined) ?? undefined
  const showLive = base?.status === ASSET_RACE_STATUS.RUNNING || base?.status === ASSET_RACE_STATUS.BETTING
  const live = useLivePrices({ enabled: showLive })

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
          liveMarketCapUsd: usable ? marketCapUsd(price) : undefined,
        }
      }),
    }
  }, [base, live.assets, showLive])

  const me = wallet?.toBase58()
  const payout: RacePayout | undefined = base ? payoutFor(base, me) : undefined
  const settlement = useMemo<RaceSettlement | undefined>(() => (
    payout?.status === 'done' && payout.signature
      ? { type: payout.kind === 'win' ? 'claim' : 'refund', amount: payout.amount, signature: payout.signature }
      : undefined
  ), [payout])

  return {
    race,
    position: base ? positionFor(base, me) : undefined,
    /** The wallet's payout or refund in any state (queued, sending, done). */
    payout,
    settlement,
    liveDisconnected: showLive && live.disconnected,
    isLoading: raceQuery.isLoading,
    error: raceQuery.error,
    refetch: async () => { await raceQuery.refetch() },
  }
}
