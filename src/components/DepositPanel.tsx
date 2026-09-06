import { type FormEvent, useState } from 'react'
import { formatUsd } from '@/lib/format'
import { RHCHAIN_META } from '@/market/tokens'
import { useChainStore } from '@/store/chainStore'

const PRESETS = [100, 500, 1_000, 5_000]

export function DepositPanel({ walletAddress }: { walletAddress: string }) {
  const faucet = useChainStore((s) => s.faucet)
  const [amount, setAmount] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function deposit(value: number) {
    if (!(value > 0)) return
    faucet(walletAddress, value, `Add funds (demo faucet): ${formatUsd(value)}`)
    setFeedback(`Request for ${formatUsd(value)} sent to mempool — will land with the next block ✅`)
    setAmount('')
    window.setTimeout(() => setFeedback(null), 4000)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    deposit(Number(amount))
  }

  return (
    <div className="bg-[#12121c]/95 border border-white/10 rounded-xl p-4">
      <h2 className="font-medium mb-1">Add funds</h2>
      <p className="text-white/40 text-xs mb-3">
        A mock faucet — not real money, no real payment involved. Credited via a blockchain transaction, same as
        everything else here (visible in the explorer).
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => deposit(p)}
            className="px-3 py-1.5 rounded-lg border border-white/10 text-sm text-white/70 hover:text-white hover:border-emerald-400/50 transition-colors"
          >
            +{formatUsd(p, 0)}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          type="number"
          min={1}
          placeholder="Custom amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-emerald-400/60"
        />
        <button
          type="submit"
          className="px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium text-sm transition-colors"
        >
          Add
        </button>
      </form>

      {feedback && <p className="text-xs text-emerald-400 mt-2">{feedback}</p>}
      <p className="text-white/25 text-xs mt-2">
        Currency is {RHCHAIN_META.ticker}, a test unit for this demo — it has no real-world value.
      </p>
    </div>
  )
}
