import { AssetRaceLeaderboard } from '@/components/AssetRaceLeaderboard'
import { formatCountdown } from '@/lib/format'
import { ASSET_RACE_CATEGORY, formatUsdRaw, type AssetRacePosition, type AssetRaceViewModel } from '@/chain/assetRaces'

export function AssetRaceLiveView({ race, position, nowMs, tokenDecimals, tokenLabel }: { race: AssetRaceViewModel; position?: AssetRacePosition; nowMs: number; tokenDecimals: number; tokenLabel: string }) {
  const remainingMs = Number(race.raceEndTime) * 1_000 - nowMs
  const selectedAsset = position?.exists ? race.assets[position.assetIndex] : undefined
  const meme = race.category === ASSET_RACE_CATEGORY.MEME

  return (
    <div className="space-y-5">
      <div className={`relative overflow-hidden rounded-2xl border p-5 ${meme ? 'border-fuchsia-300/30 bg-gradient-to-br from-[#29143c]/95 to-[#351713]/90' : 'border-[#8B7CF7]/30 bg-[#11170e]/90'}`}>
        <div className={`absolute -right-12 -top-20 h-52 w-52 rounded-full blur-3xl ${meme ? 'bg-orange-400/25' : 'bg-[#8B7CF7]/10'}`} />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className={`mb-2 flex items-center gap-2 text-xs font-black tracking-[0.25em] ${meme ? 'text-orange-200' : 'text-[#8B7CF7]'}`}>
              <span className={`h-2 w-2 animate-pulse rounded-full motion-reduce:animate-none ${meme ? 'bg-fuchsia-400' : 'bg-[#8B7CF7]'}`} /> RACE LIVE
            </div>
            <h2 className="text-2xl font-black">{meme ? 'Who moons the hardest?' : 'Who gains the most?'}</h2>
            <p className="mt-1 text-sm text-white/45">DEX movement is provisional and display-only. Final settlement comes from the race contract.</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-black text-white">{nowMs > 0 ? formatCountdown(remainingMs) : '…'}</div>
            <div className="text-[11px] uppercase tracking-wider text-white/35">until finish target</div>
          </div>
        </div>
      </div>

      {position?.exists && selectedAsset && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-[#241b2f]/95 p-4 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-white/35">Your asset</div><div className="font-bold text-[#8B7CF7]">{selectedAsset.symbol}</div></div>
          <div><div className="text-xs text-white/35">Your stake</div><div className="font-mono">{formatUsdRaw(position.stake, tokenDecimals)} {tokenLabel}</div></div>
          <div className="col-span-2 sm:col-span-1"><div className="text-xs text-white/35">Position</div><div>Locked until result</div></div>
        </div>
      )}

      <AssetRaceLeaderboard race={race} position={position} nowSeconds={Math.floor(nowMs / 1_000)} />
    </div>
  )
}
