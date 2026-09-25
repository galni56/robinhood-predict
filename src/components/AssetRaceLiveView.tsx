import { AssetRaceLeaderboard } from '@/components/AssetRaceLeaderboard'
import { TokenLogo } from '@/components/TokenLogo'
import { formatCountdown } from '@/lib/format'
import { ASSET_RACE_CATEGORY, formatStakeRaw, type AssetRacePosition, type AssetRaceViewModel } from '@/chain/assetRaces'

export function AssetRaceLiveView({ race, position, nowMs, tokenDecimals, tokenLabel }: { race: AssetRaceViewModel; position?: AssetRacePosition; nowMs: number; tokenDecimals: number; tokenLabel: string }) {
  const remainingMs = Number(race.raceEndTime) * 1_000 - nowMs
  const selectedAsset = position?.exists ? race.assets[position.assetIndex] : undefined
  const meme = race.category === ASSET_RACE_CATEGORY.MEME

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-white/5 bg-[#241b2f] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className={`mb-1 flex items-center gap-2 text-sm font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:animate-none ${meme ? 'bg-[#F2A65A]/60' : 'bg-[#8B7CF7]/60'}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${meme ? 'bg-[#F2A65A]' : 'bg-[#8B7CF7]'}`} />
              </span>
              Race live
            </div>
            <h2 className="font-display text-2xl font-bold">{meme ? 'Who moons the hardest?' : 'Who gains the most?'}</h2>
            <p className="mt-1 text-sm text-white/45">DEX movement is provisional and display-only. Final settlement comes from the race contract.</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-white">{nowMs > 0 ? formatCountdown(remainingMs) : '…'}</div>
            <div className="mt-0.5 text-xs font-bold text-white/35">until finish target</div>
          </div>
        </div>
      </div>

      {position?.exists && selectedAsset && (
        <div className="grid grid-cols-2 gap-3 rounded-3xl border border-white/5 bg-[#241b2f] p-4 text-sm sm:grid-cols-3">
          <div><div className="text-xs font-bold text-white/35">Your asset</div><div className={`mt-1 flex items-center gap-2 font-display font-bold ${meme ? 'text-[#F2A65A]' : 'text-[#B3A7FA]'}`}><TokenLogo ticker={selectedAsset.symbol} className="h-7 w-7 rounded-lg" />{selectedAsset.symbol}</div></div>
          <div><div className="text-xs font-bold text-white/35">Your stake</div><div className="font-mono">{formatStakeRaw(position.stake, tokenDecimals)} {tokenLabel}</div></div>
          <div className="col-span-2 sm:col-span-1"><div className="text-xs font-bold text-white/35">Position</div><div>Locked until result</div></div>
        </div>
      )}

      <AssetRaceLeaderboard race={race} position={position} nowSeconds={Math.floor(nowMs / 1_000)} />
    </div>
  )
}
