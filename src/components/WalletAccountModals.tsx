import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { ProphetWalletName, prophetWalletStore } from '@/solana/prophetWallet'
import { useStakeBalance } from '@/solana/stakeTokens'
import { useSendInstructions } from '@/solana/tx'
import { LAMPORTS_PER_SOL } from '@/solana/config'
import { formatUnits, shortTxError } from '@/lib/format'

// Personal-account modals for the platform wallet, in the mock's style:
// backup (forced once after creation), deposit, withdraw, import.

const PIXEL = "'Press Start 2P', 'Courier New', monospace"
const INK = '#1B1340'
const CREAM = '#FFF6DF'
// Leaves room for the withdrawal's own network fee.
const FEE_RESERVE_LAMPORTS = 10_000n

function Modal({ title, onClose, children, locked = false }: { title: string; onClose: () => void; children: ReactNode; locked?: boolean }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'rgba(27,19,64,0.6)' }}
      onClick={locked ? undefined : onClose}
    >
      <div className="flex min-h-full items-center justify-center px-4 py-8">
        <div
          className="rx-raised w-full max-w-md"
          style={{ background: CREAM, color: INK, padding: 24, fontFamily: "'Pixelify Sans', 'Courier New', monospace" }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 style={{ margin: 0, fontFamily: PIXEL, fontSize: 14, lineHeight: 1.5 }}>{title}</h2>
            {!locked && (
              <button type="button" onClick={onClose} aria-label="Close" style={{ fontFamily: PIXEL, fontSize: 12, background: 'none', border: 0, cursor: 'pointer', color: INK }}>
                X
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-4" style={{ fontSize: 18, fontWeight: 500 }}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [revealed, setRevealed] = useState(!secret)
  return (
    <div className="flex flex-col gap-2">
      <span style={{ fontFamily: PIXEL, fontSize: 10 }}>{label}</span>
      <div className="rx-plate" style={{ background: '#FFFFFF', padding: '12px 14px', fontFamily: 'monospace', fontSize: 14, overflowWrap: 'anywhere', filter: revealed ? 'none' : 'blur(5px)', userSelect: revealed ? 'text' : 'none' }}>
        {value}
      </div>
      <div className="flex flex-wrap gap-2">
        {secret && !revealed && (
          <button type="button" className="rx-btn rx-btn-white" style={{ minHeight: 44, padding: '0 16px', fontFamily: PIXEL, fontSize: 11 }} onClick={() => setRevealed(true)}>
            REVEAL
          </button>
        )}
        <button
          type="button"
          className="rx-btn rx-btn-white"
          style={{ minHeight: 44, padding: '0 16px', fontFamily: PIXEL, fontSize: 11 }}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
    </div>
  )
}

/** Shown right after the account is created and until the player confirms
 * the backup: clearing the browser without it loses the funds for good. */
export function BackupModal({ onClose, forced = false }: { onClose: () => void; forced?: boolean }) {
  const secret = prophetWalletStore.exportSecret()
  const [confirmed, setConfirmed] = useState(false)
  if (!secret) return null
  return (
    <Modal title={forced ? 'SAVE YOUR KEY' : 'BACK UP KEY'} onClose={onClose} locked={forced}>
      <p style={{ margin: 0 }}>
        Your account lives in this browser. This secret key is the only way to recover it - if you clear the browser or switch
        devices without it, the SOL inside is gone. Prophet cannot restore it.
      </p>
      <CopyField label="SECRET KEY" value={secret} secret />
      <p style={{ margin: 0, fontSize: 15, opacity: 0.7 }}>
        Store it somewhere safe and never share it. It also imports into Phantom or Solflare.
      </p>
      <label className="flex items-start gap-3" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ width: 20, height: 20, marginTop: 2 }} />
        <span>I saved my secret key somewhere safe.</span>
      </label>
      <button
        type="button"
        disabled={!confirmed}
        className="rx-btn rx-btn-yellow"
        style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 13 }}
        onClick={() => {
          prophetWalletStore.markBackedUp()
          onClose()
        }}
      >
        DONE
      </button>
    </Modal>
  )
}

export function DepositModal({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet()
  if (!publicKey) return null
  return (
    <Modal title="TOP UP" onClose={onClose}>
      <p style={{ margin: 0 }}>Send SOL on the Solana network to your account address. It shows up here in a few seconds.</p>
      <CopyField label="YOUR ADDRESS" value={publicKey.toBase58()} />
      <p style={{ margin: 0, fontSize: 15, opacity: 0.7 }}>Only send SOL on Solana. Tokens from other networks will be lost.</p>
    </Modal>
  )
}

export function WithdrawModal({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet()
  const balance = useStakeBalance()
  const send = useSendInstructions()
  const queryClient = useQueryClient()
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const maxLamports = balance.data != null && balance.data > FEE_RESERVE_LAMPORTS ? balance.data - FEE_RESERVE_LAMPORTS : 0n

  async function submit() {
    setError(null)
    try {
      if (!publicKey) return
      let destination: PublicKey
      try {
        destination = new PublicKey(to.trim())
      } catch {
        throw new Error('Enter a valid Solana address.')
      }
      const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(amount.trim())
      if (!match) throw new Error('Enter an amount in SOL.')
      const lamports = BigInt(match[1]) * LAMPORTS_PER_SOL + BigInt((match[2] ?? '').padEnd(9, '0'))
      if (lamports <= 0n) throw new Error('Enter an amount above zero.')
      if (lamports > maxLamports) throw new Error('That is more than your balance minus the network fee.')
      setStatus('Sending…')
      await send([SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: destination, lamports })], {
        onPhase: (phase) => setStatus(phase === 'signing' ? 'Signing…' : 'Confirming…'),
      })
      await queryClient.invalidateQueries({ queryKey: ['stake-balance'] })
      onClose()
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error && !('logs' in cause) && /valid|amount|balance/.test(cause.message) ? cause.message : shortTxError(cause, 'withdraw'))
    }
  }

  const inputStyle = { width: 'calc(100% - 8px)', height: 52, padding: '0 14px', fontFamily: 'monospace', fontSize: 15 }
  return (
    <Modal title="WITHDRAW" onClose={onClose} locked={status != null}>
      <p style={{ margin: 0 }}>Send SOL from your account to any Solana address.</p>
      <label className="flex flex-col gap-2">
        <span style={{ fontFamily: PIXEL, fontSize: 10 }}>TO ADDRESS</span>
        <input className="rx-input" style={inputStyle} value={to} onChange={(event) => setTo(event.target.value)} placeholder="Solana address" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between" style={{ fontFamily: PIXEL, fontSize: 10 }}>
          AMOUNT, SOL
          <button
            type="button"
            onClick={() => setAmount(formatUnits(maxLamports, 9))}
            style={{ fontFamily: PIXEL, fontSize: 10, background: 'none', border: 0, cursor: 'pointer', color: '#C2245A', textDecoration: 'underline' }}
          >
            MAX
          </button>
        </span>
        <input className="rx-input" style={inputStyle} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.0" />
      </label>
      <span style={{ fontSize: 15, opacity: 0.7 }}>Available: {formatUnits(maxLamports, 9)} SOL</span>
      {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
      <button type="button" disabled={status != null} className="rx-btn rx-btn-pink" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 13 }} onClick={submit}>
        {status ?? 'WITHDRAW'}
      </button>
    </Modal>
  )
}

/** Restores an account from a backed-up secret key (replaces the one in
 * this browser - the UI asks for a backup of the current one first). */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { select } = useWallet()
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const hasCurrent = prophetWalletStore.hasWallet()
  return (
    <Modal title="RESTORE ACCOUNT" onClose={onClose}>
      <p style={{ margin: 0 }}>Paste the secret key you saved. It replaces the account in this browser.</p>
      {hasCurrent && !prophetWalletStore.isBackedUp() && (
        <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>Back up your current key first - it will be removed from this browser.</p>
      )}
      <input className="rx-input" style={{ width: 'calc(100% - 8px)', height: 52, padding: '0 14px', fontFamily: 'monospace', fontSize: 14 }} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Secret key" />
      {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
      <button
        type="button"
        disabled={!secret.trim() || (hasCurrent && !prophetWalletStore.isBackedUp())}
        className="rx-btn rx-btn-yellow"
        style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 13 }}
        onClick={async () => {
          try {
            prophetWalletStore.importSecret(secret)
            select(ProphetWalletName)
            // autoConnect restores the selected wallet on load; a reload is
            // the simplest way to swap the in-memory key everywhere at once.
            window.location.reload()
          } catch {
            setError('That does not look like a valid secret key.')
          }
        }}
      >
        RESTORE
      </button>
    </Modal>
  )
}
