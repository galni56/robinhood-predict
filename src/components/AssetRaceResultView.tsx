import { formatUnits } from 'viem'
import { AssetRaceLeaderboard } from '@/components/AssetRaceLeaderboard'
import { WalletOptionsList } from '@/components/WalletOptionsList'
import { assetRaceChain } from '@/chain/config'
import {
  ASSET_RACE_CATEGORY,
  ASSET_RACE_STATUS,
  formatReturnWad,
  formatUsdRaw,
  resolvedPositionPayout,
  type AssetRacePosition,
  type AssetRaceViewModel,
} from '@/chain/assetRaces'

export function AssetRaceResultView({
  race,
  position,
  isConnected,
  onRightChain,
  isSwitching,
  onSwitchChain,
  onClaim,
  onRefund,
  txLabel,
  error,
  tokenDecimals,
  tokenLabel,
}: {
  race: AssetRaceViewModel
  position?: AssetRacePosition
  isConnected: boolean
  onRightChain: boolean
  isSwitching: boolean
  onSwitchChain: () => void
  onClaim: () => void
  onRefund: () => void
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

  const action = race.source === 'preview' ? (
    <button disabled className="w-full rounded-lg bg-white/10 py-2.5 text-sm font-semibold text-white/45">Preview only — no transaction will be sent</button>
  ) : !isConnected ? (
    <WalletOptionsList />
  ) : !onRightChain ? (
    <button onClick={onSwitchChain} disabled={isSwitching} className="w-full rounded-lg bg-amber-400 py-2.5 text-sm font-bold text-black disabled:opacity-50">
      {isSwitching ? 'Switching…' : `Switch to ${assetRaceChain.name}`}
    </button>
  ) : resolved && won ? (
    <button onClick={onClaim} disabled={!!txLabel || position?.settled} className="w-full rounded-lg bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] py-2.5 text-sm font-bold text-white disabled:opacity-40">
      {position?.settled ? 'Already claimed' : txLabel ?? `Claim ${formatUsdRaw(payout, tokenDecimals)} ${tokenLabel}`}
    </button>
  ) : refundable ? (
    <button onClick={onRefund} disabled={!!txLabel} className="w-full rounded-lg bg-white py-2.5 text-sm font-bold text-white disabled:opacity-40">
      {txLabel ?? `Refund ${formatUsdRaw(position.stake, tokenDecimals)} ${tokenLabel}`}
    </button>
  ) : null

  return (
    <div className="space-y-5">
      <div className={`relative overflow-hidden rounded-2xl border p-5 ${resolved ? meme ? 'race-result-enter border-orange-300/40 bg-gradient-to-br from-fuchsia-500/[0.18] via-[#281633] to-orange-400/[0.12]' : 'race-result-enter border-[#8B7CF7]/30 bg-[#11170e]/90' : 'border-amber-400/25 bg-amber-400/5'}`}>
        {resolved && <div aria-hidden="true" className={`absolute right-5 top-3 text-5xl ${won ? 'animate-bounce motion-reduce:animate-none' : 'animate-pulse motion-reduce:animate-none'}`}>{meme ? '🚀' : '🏆'}</div>}
        {won && <div aria-hidden="true" className="race-confetti"><i>●</i><i>◆</i><i>★</i><i>●</i><i>◆</i><i>★</i></div>}
        <div className="relative text-xs font-black tracking-[0.25em] text-white/45">{resolved ? won ? 'YOU WON' : 'WINNER' : voided ? 'RACE VOID' : 'RACE CANCELLED'}</div>
        <h2 className="relative mt-2 pr-16 text-3xl font-black">{winner ? `${winner.symbol} ${formatReturnWad(winner.returnValue)}` : voided ? 'No legitimate winner' : 'Race never started'}</h2>
        <p className="mt-2 text-sm text-white/50">
          {won ? `Your pick took the crown. ${meme ? 'Absolute scenes.' : 'Claim your payout below.'}` : lost ? 'Better luck next race. Final ranking uses the immutable P0/P1 values.' : resolved ? 'Final ranking uses the immutable P0/P1 values stored by AssetRace.' : voided ? 'Every principal stake is refundable. No protocol fee was charged.' : 'The start conditions were not met. Every principal stake is refundable with no fee.'}
        </p>
      </div>

      {position?.exists && (
        <div className={`grid grid-cols-2 gap-3 rounded-xl border p-4 transition-all sm:grid-cols-4 ${lost ? 'border-white/5 bg-[#241b2f]/75 opacity-80' : won ? meme ? 'border-orange-300/30 bg-fuchsia-400/[0.08]' : 'border-[#8B7CF7]/25 bg-[#241b2f]/95' : 'border-white/10 bg-[#241b2f]/95'}`}>
          <div><div className="text-xs text-white/35">Your asset</div><div className="font-bold">{myAsset?.symbol}</div></div>
          <div><div className="text-xs text-white/35">Your stake</div><div className="font-mono">{formatUsdRaw(position.stake, tokenDecimals)}</div></div>
          <div><div className="text-xs text-white/35">Result</div><div className={won ? 'font-bold text-[#8B7CF7]' : resolved ? 'font-bold text-rose-400' : 'font-bold text-amber-300'}>{won ? 'WON' : resolved ? 'LOST' : 'REFUND'}</div></div>
          <div><div className="text-xs text-white/35">Claimable</div><div className="font-mono">{won ? formatUsdRaw(payout, tokenDecimals) : refundable ? formatUsdRaw(position.stake, tokenDecimals) : '0'} {tokenLabel}</div></div>
        </div>
      )}

      {resolved && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-[#241b2f]/95 p-4"><div className="text-xs text-white/35">Winning pool</div><div className="mt-1 font-mono font-bold">{formatUsdRaw(race.winningPool, tokenDecimals)} {tokenLabel}</div></div>
          <div className="rounded-xl border border-white/10 bg-[#241b2f]/95 p-4"><div className="text-xs text-white/35">Total pool</div><div className="mt-1 font-mono font-bold">{formatUsdRaw(race.totalPool, tokenDecimals)} {tokenLabel}</div></div>
          <div className="col-span-2 rounded-xl border border-white/10 bg-[#241b2f]/95 p-4 sm:col-span-1"><div className="text-xs text-white/35">Fee from losing pool</div><div className="mt-1 font-mono font-bold">{formatUsdRaw(race.protocolFee, tokenDecimals)} {tokenLabel}</div></div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/45">Final standings</h3>
        {resolved || voided ? <AssetRaceLeaderboard race={race} position={position} final /> : (
          <div className="space-y-2">
            {race.assets.map((asset) => <div key={asset.assetIndex} className="flex justify-between rounded-lg border border-white/10 bg-[#241b2f]/95 px-3 py-2 text-sm"><span>{asset.symbol}</span><span className="font-mono text-white/45">{formatUsdRaw(asset.pool, tokenDecimals)} {tokenLabel} backed</span></div>)}
          </div>
        )}
      </div>

      {resolved && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-white/5 text-white/35"><tr><th className="px-3 py-2">Asset</th><th className="px-3 py-2">P0</th><th className="px-3 py-2">P1</th><th className="px-3 py-2">Return</th></tr></thead>
            <tbody>{race.assets.filter((asset) => asset.active).map((asset) => <tr key={asset.assetIndex} className="border-t border-white/10"><td className="px-3 py-2 font-bold">{asset.symbol}</td><td className="px-3 py-2 font-mono">${formatUnits(asset.startPrice, asset.expectedDecimals)}</td><td className="px-3 py-2 font-mono">${formatUnits(asset.endPrice, asset.expectedDecimals)}</td><td className={`px-3 py-2 font-mono ${asset.returnValue >= 0n ? 'text-emerald-300' : 'text-rose-400'}`}>{formatReturnWad(asset.returnValue)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {action}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  )
}
