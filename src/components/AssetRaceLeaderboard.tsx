import { formatUnits } from 'viem'
import { displayedRaceReturnWad } from '@/chain/assetRaceLiveDisplay'
import { assetRaceCatalogById, assetRaceMemeQuote } from '@/chain/assetRaceRegistry'
import {
  ASSET_RACE_CATEGORY,
  formatReturnWad,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

interface LeaderboardEntry {
  assetIndex: number
  symbol: string
  returnValue: bigint
  pool: bigint
  startPrice: bigint
  endPrice: bigint
  decimals: number
  updatedAt?: bigint
  source?: string
  stale: boolean
  quoteSymbol?: string
}

function raceLeaderboardEntries(race: AssetRaceViewModel, final = false): LeaderboardEntry[] {
  return race.assets
    .filter((asset) => asset.active || race.status === 0)
    .map((asset) => ({
      assetIndex: asset.assetIndex,
      symbol: asset.symbol,
      returnValue: displayedRaceReturnWad({
        final,
        officialReturn: asset.returnValue,
        settlementStartPrice: asset.startPrice,
        livePrice: asset.livePrice ?? asset.startPrice,
      }),
      pool: asset.pool,
      startPrice: asset.startPrice,
      endPrice: final ? asset.endPrice : (asset.livePrice ?? asset.startPrice),
      decimals: final ? asset.expectedDecimals : (asset.liveDecimals ?? asset.expectedDecimals),
      updatedAt: final ? asset.endOracleUpdatedAt : asset.liveUpdatedAt,
      source: final ? 'FINAL' : asset.liveProvider,
      stale: !final && !!asset.liveStale,
      quoteSymbol: race.category === ASSET_RACE_CATEGORY.MEME
        && assetRaceCatalogById.get(asset.assetId.toLowerCase())?.networks['robinhood-mainnet'].oracle?.identifier?.toLowerCase() === asset.oracleId.toLowerCase()
        ? assetRaceMemeQuote.symbol : undefined,
    }))
    .sort((a, b) => (a.returnValue > b.returnValue ? -1 : a.returnValue < b.returnValue ? 1 : a.assetIndex - b.assetIndex))
}

export function AssetRaceLeaderboard({
  race,
  position,
  final = false,
  nowSeconds,
}: {
  race: AssetRaceViewModel
  position?: AssetRacePosition
  final?: boolean
  nowSeconds?: number
}) {
  const entries = raceLeaderboardEntries(race, final)
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const leaderReturn = entries[0]?.returnValue ?? 0n
  const maxMagnitude = entries.reduce((max, entry) => {
    const magnitude = entry.returnValue < 0n ? -entry.returnValue : entry.returnValue
    return magnitude > max ? magnitude : max
  }, 1n)

  return (
    <div className="space-y-2">
      {entries.map((entry, rank) => {
        const isMine = position?.exists && position.assetIndex === entry.assetIndex
        const isWinner = final && race.winningAssetIndex === entry.assetIndex
        const width = Number(((entry.returnValue < 0n ? -entry.returnValue : entry.returnValue) * 46n) / maxMagnitude)
        const freshness = nowSeconds && entry.updatedAt && entry.updatedAt > 0n
          ? Math.max(0, nowSeconds - Number(entry.updatedAt))
          : null

        return (
          <div
            key={entry.assetIndex}
            className={`rounded-xl border px-3 py-3 transition-colors ${
              isMine ? meme ? 'border-orange-300/55 bg-fuchsia-400/[0.09]' : 'border-[#8B7CF7]/55 bg-[#8B7CF7]/8' : 'border-white/10 bg-white/[0.025]'
            }`}
            style={meme && !final ? { transform: `translateX(${Math.max(0, 3 - rank) * 2}px)` } : undefined}
          >
            <div className="flex items-center gap-3">
              <span className={`w-6 text-center font-mono text-sm ${rank === 0 ? meme ? 'text-orange-200' : 'text-[#8B7CF7]' : 'text-white/35'}`}>
                {rank + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold tracking-wide">{entry.symbol}</span>
                  {isMine && <span className="rounded-full bg-[#8B7CF7]/15 px-2 py-0.5 text-[10px] font-bold text-[#8B7CF7]">YOUR PICK</span>}
                  {isWinner && <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">WINNER</span>}
                </div>
                <div className="mt-2 relative h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  <div
                    className={`absolute inset-y-0 rounded-full ${entry.returnValue >= 0n ? 'bg-[#8B7CF7]' : 'bg-rose-400'}`}
                    style={entry.returnValue >= 0n ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
                  />
                </div>
              </div>
              <div className="w-24 text-right">
                <div className={`font-mono font-bold ${entry.returnValue >= 0n ? 'text-emerald-300' : 'text-rose-400'}`}>
                  {formatReturnWad(entry.returnValue)}
                </div>
                {rank > 0 && <div className="text-[10px] text-white/35">gap {formatReturnWad(leaderReturn - entry.returnValue)}</div>}
              </div>
            </div>
            <div className="mt-2 ml-9 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/35">
              {entry.startPrice > 0n && <span>P0 {entry.quoteSymbol ? `${formatUnits(entry.startPrice, entry.decimals)} ${entry.quoteSymbol}` : `$${formatUnits(entry.startPrice, entry.decimals)}`}</span>}
              {entry.endPrice > 0n && <span>{final ? 'P1' : 'display'} {entry.quoteSymbol ? `${formatUnits(entry.endPrice, entry.decimals)} ${entry.quoteSymbol}` : `$${formatUnits(entry.endPrice, entry.decimals)}`}</span>}
              {entry.source && <span>{entry.source}</span>}
              {entry.stale && <span>live display unavailable</span>}
              {freshness != null && <span>updated {freshness}s ago</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
