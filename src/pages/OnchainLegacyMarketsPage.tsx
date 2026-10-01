import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatUnits } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { LEGACY_PREDICTION_MARKET_ADDRESS, MarketStatusOnchain, predictionMarketV1Abi } from '@/chain/contracts'
import { ASSET_RACE_STATUS, LEGACY_ASSET_RACE_ADDRESS, assetRaceAbi, type AssetRaceData } from '@/chain/assetRaces'
import { LEGACY_PRICE_ARENA_ADDRESS, PRICE_ARENA_STATUS, priceArenaAbi, priceArenaAsset, type PriceArenaData } from '@/chain/priceArena'
import { tickerForPredictionAssetId } from '@/chain/predictionMarketAssets'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCompactEth, formatUsd } from '@/lib/format'

type LegacyMode = 'markets' | 'races' | 'arenas'

const marketStatusLabel: Record<number, string> = { [MarketStatusOnchain.Open]: 'Open', [MarketStatusOnchain.Resolved]: 'Resolved', [MarketStatusOnchain.Cancelled]: 'Cancelled' }
const raceStatusLabel: Record<number, string> = { [ASSET_RACE_STATUS.BETTING]: 'Betting', [ASSET_RACE_STATUS.RUNNING]: 'Running', [ASSET_RACE_STATUS.RESOLVED]: 'Resolved', [ASSET_RACE_STATUS.CANCELLED]: 'Cancelled', [ASSET_RACE_STATUS.VOID]: 'Void', [ASSET_RACE_STATUS.LOBBY]: 'Lobby' }
const arenaStatusLabel: Record<number, string> = { [PRICE_ARENA_STATUS.OPEN]: 'Open', [PRICE_ARENA_STATUS.RESOLVED]: 'Resolved', [PRICE_ARENA_STATUS.CANCELLED]: 'Cancelled' }

function idsForCount(count?: bigint) {
  return Array.from({ length: Math.min(Number(count ?? 0n), 500) }, (_, index) => BigInt(index))
}

export function OnchainLegacyMarketsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMode = searchParams.get('mode')
  const mode: LegacyMode = requestedMode === 'races' || requestedMode === 'arenas' ? requestedMode : 'markets'

  const marketCount = useReadContract({ address: LEGACY_PREDICTION_MARKET_ADDRESS, abi: predictionMarketV1Abi, functionName: 'marketCount' })
  const raceCount = useReadContract({ address: LEGACY_ASSET_RACE_ADDRESS, abi: assetRaceAbi, functionName: 'raceCount' })
  const arenaCount = useReadContract({ address: LEGACY_PRICE_ARENA_ADDRESS, abi: priceArenaAbi, functionName: 'arenaCount' })
  const marketIds = useMemo(() => idsForCount(marketCount.data), [marketCount.data])
  const raceIds = useMemo(() => idsForCount(raceCount.data), [raceCount.data])
  const arenaIds = useMemo(() => idsForCount(arenaCount.data), [arenaCount.data])

  const markets = useReadContracts({ contracts: marketIds.map((id) => ({ address: LEGACY_PREDICTION_MARKET_ADDRESS, abi: predictionMarketV1Abi, functionName: 'getMarket', args: [id] }) as const), query: { enabled: mode === 'markets' && marketIds.length > 0 } })
  const races = useReadContracts({ contracts: raceIds.map((id) => ({ address: LEGACY_ASSET_RACE_ADDRESS, abi: assetRaceAbi, functionName: 'getRace', args: [id] }) as const), query: { enabled: mode === 'races' && raceIds.length > 0 } })
  const arenas = useReadContracts({ contracts: arenaIds.map((id) => ({ address: LEGACY_PRICE_ARENA_ADDRESS, abi: priceArenaAbi, functionName: 'getArena', args: [id] }) as const), query: { enabled: mode === 'arenas' && arenaIds.length > 0 } })

  const fundedMarkets = marketIds.flatMap((id, index) => {
    const result = markets.data?.[index]
    if (!result || result.status !== 'success' || result.result.poolYes + result.result.poolNo === 0n) return []
    return [{ id, market: result.result }]
  }).reverse()
  const fundedRaces = raceIds.flatMap((id, index) => {
    const result = races.data?.[index]
    if (!result || result.status !== 'success') return []
    const race = result.result as unknown as AssetRaceData
    return race.totalPool > 0n ? [{ id, race }] : []
  }).reverse()
  const fundedArenas = arenaIds.flatMap((id, index) => {
    const result = arenas.data?.[index]
    if (!result || result.status !== 'success') return []
    const arena = result.result as unknown as PriceArenaData
    return arena.totalPool > 0n ? [{ id, arena }] : []
  }).reverse()

  const loading = mode === 'markets'
    ? marketCount.isPending || (marketIds.length > 0 && markets.isPending)
    : mode === 'races'
      ? raceCount.isPending || (raceIds.length > 0 && races.isPending)
      : arenaCount.isPending || (arenaIds.length > 0 && arenas.isPending)
  const hasGames = mode === 'markets' ? fundedMarkets.length > 0 : mode === 'races' ? fundedRaces.length > 0 : fundedArenas.length > 0

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8">
      <p className="mb-1 text-sm font-bold text-[#B3A7FA]">Legacy settlement access</p>
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Legacy games</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">V1 no longer accepts new bets. Every funded legacy market, race and arena remains available here so claims and refunds never expire.</p>
      <Link to="/onchain" className="mt-4 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">Open current games →</Link>

      <div className="mt-7 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {([['markets', 'Prediction Markets'], ['races', 'Asset Races'], ['arenas', 'Price Arena']] as const).map(([value, label]) => (
          <button key={value} onClick={() => setSearchParams(value === 'markets' ? {} : { mode: value })} className={`min-w-0 rounded-full px-2 py-2 text-xs font-bold leading-tight transition sm:px-4 sm:text-sm ${mode === value ? 'bg-[#8A72F8] text-white' : 'bg-white/5 text-white/50 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl bg-white/5" />)}</div>
      ) : !hasGames ? (
        <div className="mt-8 rounded-2xl border border-white/5 bg-[#241b2f] p-8 text-center text-white/40">No funded legacy {mode}.</div>
      ) : mode === 'markets' ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{fundedMarkets.map(({ id, market }) => {
          const ticker = tickerForPredictionAssetId(market.assetId) ?? '…'
          const target = Number(formatUnits(market.targetPrice, market.priceDecimals))
          return <article key={id.toString()} className="rounded-2xl border border-white/5 bg-[#241b2f] p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><TokenLogo ticker={ticker} className="h-10 w-10 rounded-xl" /><div><div className="font-display text-lg font-bold">{ticker}</div><div className="text-xs text-white/35">Legacy market #{id.toString()}</div></div></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{marketStatusLabel[market.status] ?? 'Unknown'}</span></div><p className="mt-4 text-sm font-semibold text-white/75">Target {formatUsd(target)}</p><p className="mt-2 text-xs text-white/40">YES {formatCompactEth(market.poolYes)} · NO {formatCompactEth(market.poolNo)}</p><Link to={`/onchain/legacy/${id}`} className="mt-5 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">Open claim / refund →</Link></article>
        })}</div>
      ) : mode === 'races' ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{fundedRaces.map(({ id, race }) => <article key={id.toString()} className="rounded-2xl border border-white/5 bg-[#241b2f] p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-display text-lg font-bold">{race.title || `Asset Race #${id}`}</div><div className="text-xs text-white/35">Legacy race #{id.toString()}</div></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{raceStatusLabel[race.status] ?? 'Unknown'}</span></div><p className="mt-4 text-sm text-white/55">Pool {formatCompactEth(race.totalPool)}</p><Link to={`/onchain/legacy/races/${id}`} className="mt-5 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">Open claim / refund →</Link></article>)}</div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{fundedArenas.map(({ id, arena }) => { const asset = priceArenaAsset(arena.assetId); return <article key={id.toString()} className="rounded-2xl border border-white/5 bg-[#241b2f] p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><TokenLogo ticker={asset?.symbol} className="h-10 w-10 rounded-xl" /><div><div className="font-display text-lg font-bold">{arena.title || `${asset?.symbol ?? 'Price'} Arena`}</div><div className="text-xs text-white/35">Legacy arena #{id.toString()}</div></div></div><span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-bold text-white/55">{arenaStatusLabel[arena.status] ?? 'Unknown'}</span></div><p className="mt-4 text-sm text-white/55">Pool {formatCompactEth(arena.totalPool)} · {arena.participantCount} players</p><Link to={`/onchain/legacy/arenas/${id}`} className="mt-5 inline-flex text-sm font-bold text-[#B3A7FA] hover:text-white">Open claim / refund →</Link></article> })}</div>
      )}
    </div>
  )
}
