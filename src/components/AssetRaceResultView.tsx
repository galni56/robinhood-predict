import { AssetRaceLeaderboard } from '@/components/AssetRaceLeaderboard'
import { TrophyIcon } from '@/components/icons'
import { PriceSourceLink } from '@/components/PriceSourceLink'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { TokenLogo } from '@/components/TokenLogo'
import { priceSourceUrlForAssetId } from '@/chain/assetRaceRegistry'
import type { RaceSettlement } from '@/chain/useAssetRace'
import { formatUnits } from '@/lib/format'
import {
  ASSET_RACE_CATEGORY,
  ASSET_RACE_STATUS,
  formatReturnWad,
  formatStakeRaw,
  resolvedPositionPayout,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

export function AssetRaceResultView({
  race,
  position,
  settlement,
  isConnected,
  onClaim,
  onRefund,
  onCloseLosing,
  txLabel,
  error,
  tokenDecimals,
  tokenLabel,
}: {
  race: AssetRaceViewModel
  position?: AssetRacePosition
  /** A claim or refund already made (the position account is then closed). */
  settlement?: RaceSettlement
  isConnected: boolean
  onClaim: () => void
  onRefund: () => void
  onCloseLosing: () => void
  txLabel: string | null
  error: string | null
  tokenDecimals: number
  tokenLabel: string
}) {
  const resolved = race.status === ASSET_RACE_STATUS.RESOLVED
  const voided = race.status === ASSET_RACE_STATUS.VOID
  const winner = resolved ? race.assets[race.winningAssetIndex] : undefined
  const myAsset = position?.exists ? race.assets[position.assetIndex] : undefined
  const won = resolved && position?.exists && position.assetIndex === race.winningAssetIndex
  const lost = resolved && position?.exists && !won
  const meme = race.category === ASSET_RACE_CATEGORY.MEME
  const payout = won ? resolvedPositionPayout(race, position) : 0n
  const refundable = !resolved && position?.exists && !position.settled
  // A settled position comes from history: its account is already closed.
  const settled = !!position?.settled

  const action = !isConnected ? (
    <WalletOptionsList tone="race" />
  ) : settlement && (settled || !position?.exists) ? (
    <div className="w-full rounded-xl bg-white/5 py-3 text-center text-sm font-bold text-white/45">
      {settlement.type === 'claim' ? 'Claimed' : 'Refunded'} {formatStakeRaw(settlement.amount, tokenDecimals)} {tokenLabel}
    </div>
  ) : settled ? (
    <div className="w-full rounded-xl bg-white/5 py-3 text-center text-sm font-bold text-white/45">
      {lost ? 'Position closed · account deposit recovered' : 'Settled'}
    </div>
  ) : resolved && won ? (
    <button onClick={onClaim} disabled={!!txLabel} className="w-full rounded-xl bg-gradient-to-r from-[#F2A65A] to-[#ED8F3A] py-3 text-sm font-bold text-[#3b2416] disabled:opacity-40">
      {txLabel ?? `Claim ${formatStakeRaw(payout, tokenDecimals)} ${tokenLabel}`}
    </button>
  ) : lost ? (
    <button onClick={onCloseLosing} disabled={!!txLabel} className="w-full rounded-xl border border-white/15 py-3 text-sm font-bold text-white/60 transition-colors hover:border-white/30 disabled:opacity-40">
      {txLabel ?? 'Close position and recover its account deposit'}
    </button>
  ) : refundable ? (
    <button onClick={onRefund} disabled={!!txLabel} className="w-full rounded-xl border border-[#F2A65A]/35 bg-[#F2A65A]/15 py-3 text-sm font-bold text-[#F2A65A] transition-colors hover:bg-[#F2A65A]/25 disabled:opacity-40">
      {txLabel ?? `Refund ${formatStakeRaw(position.stake, tokenDecimals)} ${tokenLabel}`}
    </button>
  ) : null

  return (
    <div className="space-y-5">
      <div className={`relative overflow-hidden rounded-3xl border p-6 ${resolved ? 'race-result-enter border-[#F2A65A]/40 bg-gradient-to-b from-[#3D2A2B] to-[#241b2f]' : 'border-[#F2A65A]/25 bg-[#F2A65A]/5'}`}>
        {resolved && (
          <span aria-hidden="true" className={`absolute right-6 top-5 grid h-12 w-12 rotate-6 place-items-center rounded-2xl bg-[#f7f1e3] text-[#241a33] shadow-lg ${won ? 'animate-bounce motion-reduce:animate-none' : ''}`}>
            <TrophyIcon className="h-6 w-6" />
          </span>
        )}
        {won && <div aria-hidden="true" className="race-confetti"><i>●</i><i>◆</i><i>★</i><i>●</i><i>◆</i><i>★</i></div>}
        <div className="relative text-sm font-bold text-[#F2A65A]">{resolved ? won ? 'You won' : 'Winner' : voided ? 'Race void' : 'Race cancelled'}</div>
        <h2 className="relative mt-1 flex items-center gap-3 pr-16 font-display text-3xl font-bold">{winner && <TokenLogo ticker={winner.symbol} className="h-11 w-11 rounded-xl" />}{winner ? `${winner.symbol} ${formatReturnWad(winner.returnValue)}` : voided ? 'No legitimate winner' : 'Race never started'}</h2>
        <p className="mt-2 text-sm text-white/50">
          {won ? `Your pick took the crown. ${meme ? 'Absolute scenes.' : 'Claim your payout below.'}` : lost ? 'Better luck next race. Final ranking uses the immutable P0/P1 values.' : resolved ? 'Final ranking uses the immutable P0/P1 values stored by the program.' : voided ? 'Every principal stake is refundable. No protocol fee was charged.' : 'The start conditions were not met. Every principal stake is refundable with no fee.'}
        </p>
      </div>

      {position?.exists && (
        <div className={`grid grid-cols-2 gap-3 rounded-3xl border p-4 transition-all sm:grid-cols-4 ${lost ? 'border-white/5 bg-[#241b2f]/75 opacity-80' : won ? 'border-[#F2A65A]/30 bg-[#241b2f]' : 'border-white/5 bg-[#241b2f]'}`}>
          <div><div className="text-xs font-bold text-white/35">Your asset</div><div className="mt-1 flex items-center gap-2 font-display font-bold"><TokenLogo ticker={myAsset?.symbol} className="h-7 w-7 rounded-lg" />{myAsset?.symbol}</div></div>
          <div><div className="text-xs font-bold text-white/35">Your stake</div><div className="font-mono">{formatStakeRaw(position.stake, tokenDecimals)}</div></div>
          <div><div className="text-xs font-bold text-white/35">Result</div><div className={won ? 'font-bold text-[#F2A65A]' : resolved ? 'font-bold text-rose-400' : 'font-bold text-[#F2A65A]'}>{won ? 'Won' : resolved ? 'Lost' : 'Refund'}</div></div>
          <div><div className="text-xs font-bold text-white/35">{settled ? 'Received' : 'Claimable'}</div><div className="font-mono">{settled ? formatStakeRaw(settlement?.amount ?? 0n, tokenDecimals) : won ? formatStakeRaw(payout, tokenDecimals) : refundable ? formatStakeRaw(position.stake, tokenDecimals) : '0'} {tokenLabel}</div></div>
        </div>
      )}

      {resolved && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#241b2f]/95 p-4"><div className="text-xs text-white/35">Winning pool</div><div className="mt-1 font-mono font-bold">{formatStakeRaw(race.winningPool, tokenDecimals)} {tokenLabel}</div></div>
          <div className="rounded-xl border border-white/10 bg-[#241b2f]/95 p-4"><div className="text-xs text-white/35">Total pool</div><div className="mt-1 font-mono font-bold">{formatStakeRaw(race.totalPool, tokenDecimals)} {tokenLabel}</div></div>
          <div className="col-span-2 rounded-xl border border-white/10 bg-[#241b2f]/95 p-4 sm:col-span-1"><div className="text-xs text-white/35">Fee from losing pool</div><div className="mt-1 font-mono font-bold">{formatStakeRaw(race.protocolFee, tokenDecimals)} {tokenLabel}</div></div>
        </div>
      )}

      <div>
        <h3 className="mb-3 font-display text-lg font-bold">Final standings</h3>
        {resolved || voided ? <AssetRaceLeaderboard race={race} position={position} final /> : (
          <div className="space-y-2">
            {race.assets.map((asset) => <div key={asset.assetIndex} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#241b2f]/95 px-3 py-2 text-sm"><span className="flex items-center gap-2 font-bold"><TokenLogo ticker={asset.symbol} className="h-6 w-6 rounded-md" />{asset.symbol}</span><span className="ml-auto font-mono text-white/45">{formatStakeRaw(asset.pool, tokenDecimals)} {tokenLabel} backed</span><PriceSourceLink href={priceSourceUrlForAssetId(asset.assetId)} symbol={asset.symbol} tone="race" className="px-2 py-1 text-[10px]" /></div>)}
          </div>
        )}
      </div>

      {resolved && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-white/5 text-white/35"><tr><th className="px-3 py-2">Asset</th><th className="px-3 py-2">P0</th><th className="px-3 py-2">P1</th><th className="px-3 py-2">Return</th></tr></thead>
            <tbody>{race.assets.filter((asset) => asset.active).map((asset) => <tr key={asset.assetIndex} className="border-t border-white/10"><td className="px-3 py-2 font-bold"><span className="flex items-center gap-2"><TokenLogo ticker={asset.symbol} className="h-6 w-6 rounded-md" />{asset.symbol}</span></td><td className="px-3 py-2 font-mono">${formatUnits(asset.startPrice, asset.expectedDecimals)}</td><td className="px-3 py-2 font-mono">${formatUnits(asset.endPrice, asset.expectedDecimals)}</td><td className={`px-3 py-2 font-mono ${asset.returnValue >= 0n ? 'text-emerald-300' : 'text-rose-400'}`}>{formatReturnWad(asset.returnValue)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {action}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
