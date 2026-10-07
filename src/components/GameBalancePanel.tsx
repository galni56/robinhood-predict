import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { useSignedAction } from '@/chain/gameServer'
import { BALANCE_MEMO, useGameBalance } from '@/chain/shots'
import { useStakeTransfer } from '@/solana/stake'
import { useStakeBalance } from '@/solana/stakeTokens'
import { formatUnits, shortTxError } from '@/lib/format'
import { CREAM, INK, PIXEL } from '@/retro/scene'

const sol = (raw: bigint) => `${Number(Number(formatUnits(raw, 9)).toPrecision(5))} SOL`
const toLamports = (text: string) => {
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? BigInt(Math.round(value * 1e9)) : 0n
}

/**
 * The game balance Price Shot stakes come from: add SOL from the account,
 * withdraw it back. Winnings and refunds land here automatically.
 */
export function GameBalancePanel({ compact = false }: { compact?: boolean }) {
  const { publicKey } = useWallet()
  const me = publicKey?.toBase58()
  const balance = useGameBalance(me)
  const wallet = useStakeBalance()
  const stake = useStakeTransfer()
  const act = useSignedAction()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'add' | 'withdraw' | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (!me) return null
  const refresh = () => Promise.all([balance.refetch(), wallet.refetch(), queryClient.invalidateQueries({ queryKey: ['wallet-history'] })])

  async function submit() {
    const lamports = toLamports(amount)
    if (lamports <= 0n) return setMessage('Enter an amount in SOL.')
    setMessage(null)
    try {
      if (mode === 'add') {
        const note = await stake(lamports, BALANCE_MEMO, (phase) => setBusy(phase === 'signing' ? 'Sign in your wallet…' : phase === 'confirming' ? 'Confirming…' : 'Crediting…'))
        setMessage(note ?? `Added ${sol(lamports)} to your game balance.`)
      } else {
        setBusy('Withdrawing…')
        await act({ action: 'balance-withdraw', amount: lamports.toString() })
        setMessage(`${sol(lamports)} is on its way to your account (minus a 0.000005 SOL network fee).`)
      }
      setAmount('')
      setMode(null)
      await refresh()
    } catch (cause) {
      setMessage(shortTxError(cause, 'shot'))
    } finally {
      setBusy(null)
    }
  }

  const value = balance.data?.balance
  return (
    <div className="rx-raised" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: compact ? 12 : 16, background: CREAM, color: INK }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <span>
          <span style={{ display: 'block', fontFamily: PIXEL, fontSize: 9, opacity: 0.7 }}>GAME BALANCE</span>
          <span style={{ fontFamily: PIXEL, fontSize: compact ? 13 : 16 }}>{value != null ? sol(value) : '…'}</span>
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button type="button" disabled={!!busy} onClick={() => { setMode(mode === 'add' ? null : 'add'); setMessage(null) }} className={`rx-btn ${mode === 'add' ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '6px 10px', fontWeight: 700 }}>Add</button>
          <button type="button" disabled={!!busy || !value} onClick={() => { setMode(mode === 'withdraw' ? null : 'withdraw'); setMessage(null) }} className={`rx-btn ${mode === 'withdraw' ? 'rx-btn-yellow' : 'rx-btn-white'}`} style={{ padding: '6px 10px', fontWeight: 700 }}>Withdraw</button>
        </span>
      </div>
      {mode && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount in SOL" className="rx-input" style={{ flex: '1 1 140px', height: 40, padding: '0 10px', fontWeight: 600 }} />
          <button type="button" onClick={() => setAmount(formatUnits(mode === 'add' ? (wallet.data ?? 0n) > 20_000n ? (wallet.data ?? 0n) - 20_000n : 0n : value ?? 0n, 9))} className="rx-btn rx-btn-white" style={{ padding: '6px 10px', fontWeight: 700 }}>Max</button>
          <button type="button" disabled={!!busy} onClick={submit} className="rx-btn rx-btn-pink" style={{ padding: '8px 14px', fontFamily: PIXEL, fontSize: 10, color: CREAM }}>{busy ?? (mode === 'add' ? 'ADD' : 'WITHDRAW')}</button>
        </div>
      )}
      {mode === 'add' && <span style={{ fontSize: 14, opacity: 0.7 }}>From your account ({wallet.data != null ? sol(wallet.data) : '…'}). Stakes are taken from the game balance; winnings and refunds come back to it.</span>}
      {message && <span style={{ fontSize: 15, fontWeight: 600 }}>{message}</span>}
    </div>
  )
}
