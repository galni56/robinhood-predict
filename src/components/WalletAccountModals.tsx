import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { MIN_PASSWORD_LENGTH, ProphetWalletName, prophetWalletStore } from '@/solana/prophetWallet'
import { useStakeBalance } from '@/solana/stakeTokens'
import { useSendInstructions } from '@/solana/tx'
import { LAMPORTS_PER_SOL, explorerUrl } from '@/solana/config'
import { useWalletHistory, type WalletHistoryKind } from '@/solana/walletHistory'
import { formatUnits, shortTxError } from '@/lib/format'
import { PIXEL } from '@/retro/scene'

// Personal-account modals for the platform wallet, in the mock's style:
// backup (forced once after creation), deposit, withdraw, import.

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

const passwordInputStyle = { width: 'calc(100% - 8px)', height: 52, padding: '0 14px', fontFamily: 'monospace', fontSize: 15 }

const PASSWORD_ERRORS: Record<string, string> = {
  WrongPassword: 'Wrong password.',
  PasswordTooShort: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  InvalidKey: 'That does not look like a valid secret key.',
}
const passwordError = (cause: unknown) => PASSWORD_ERRORS[cause instanceof Error ? cause.message : ''] ?? 'Something went wrong. Try again.'

/** Password + confirmation, for a new password. */
function NewPassword({ onSubmit, label, busyLabel }: { onSubmit: (password: string) => Promise<void>; label: string; busyLabel: string }) {
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    if (password !== repeat) return setError('The passwords do not match.')
    setBusy(true)
    try {
      await onSubmit(password)
    } catch (cause) {
      setError(passwordError(cause))
      setBusy(false)
    }
  }
  return (
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <label className="flex flex-col gap-2">
        <span style={{ fontFamily: PIXEL, fontSize: 10 }}>PASSWORD</span>
        <input className="rx-input" type="password" autoComplete="new-password" style={passwordInputStyle} value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <label className="flex flex-col gap-2">
        <span style={{ fontFamily: PIXEL, fontSize: 10 }}>REPEAT PASSWORD</span>
        <input className="rx-input" type="password" autoComplete="new-password" style={passwordInputStyle} value={repeat} onChange={(event) => setRepeat(event.target.value)} />
      </label>
      {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
      <button type="submit" disabled={busy} className="rx-btn rx-btn-yellow" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 13 }}>
        {busy ? busyLabel : label}
      </button>
    </form>
  )
}

/** A new account: the key is created in this browser, encrypted with the password. */
export function CreateAccountModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  return (
    <Modal title="CREATE ACCOUNT" onClose={onClose}>
      <p style={{ margin: 0 }}>
        Pick a password. It locks your account on this device - nobody, Prophet included, can open it without the password.
      </p>
      <p style={{ margin: 0, fontSize: 15, opacity: 0.7 }}>
        We cannot reset it. If you forget it, restore the account with the secret key you save in the next step.
      </p>
      <NewPassword label="CREATE ACCOUNT" busyLabel="CREATING…" onSubmit={async (password) => { await prophetWalletStore.create(password); onDone() }} />
    </Modal>
  )
}

/** A returning player: decrypts the saved key for this visit. */
export function UnlockModal({ onClose, onDone, onRestore }: { onClose: () => void; onDone: () => void; onRestore: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit() {
    setError(null)
    setBusy(true)
    try {
      await prophetWalletStore.unlock(password)
      onDone()
    } catch (cause) {
      setError(passwordError(cause))
      setBusy(false)
    }
  }
  return (
    <Modal title="LOG IN" onClose={onClose}>
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <label className="flex flex-col gap-2">
          <span style={{ fontFamily: PIXEL, fontSize: 10 }}>PASSWORD</span>
          <input className="rx-input" type="password" autoComplete="current-password" autoFocus style={passwordInputStyle} value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>{error}</p>}
        <button type="submit" disabled={busy || !password} className="rx-btn rx-btn-yellow" style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 13 }}>
          {busy ? 'UNLOCKING…' : 'LOG IN'}
        </button>
      </form>
      <button type="button" onClick={onRestore} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: INK, textDecoration: 'underline', textUnderlineOffset: 4 }}>
        Forgot the password? Restore with your secret key
      </button>
    </Modal>
  )
}

/** Accounts created before passwords: the key is still stored in clear. */
export function SetPasswordModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="SET A PASSWORD" onClose={onClose} locked>
      <p style={{ margin: 0 }}>
        Your account now gets a password. It encrypts the key stored in this browser, so a copy of the browser data alone cannot open it.
      </p>
      <NewPassword label="SAVE PASSWORD" busyLabel="SAVING…" onSubmit={async (password) => { await prophetWalletStore.setPassword(password); onClose() }} />
    </Modal>
  )
}

/**
 * Logging in to the platform wallet: a new player creates an account with a
 * password, a returning one unlocks it; then the adapter connects. Returns
 * `start` for the button and the modal to render.
 */
export function usePlatformLogin() {
  const { wallet, select, connect } = useWallet()
  const [step, setStep] = useState<'create' | 'unlock' | 'restore' | null>(null)
  const enter = () => {
    setStep(null)
    // Already selected (autoConnect skipped a locked account): connect directly.
    if (wallet?.adapter.name === ProphetWalletName) void connect().catch(() => {})
    else select(ProphetWalletName)
  }
  const start = () => {
    if (prophetWalletStore.canConnect()) return enter()
    setStep(prophetWalletStore.hasWallet() ? 'unlock' : 'create')
  }
  const close = () => setStep(null)
  const modal = step === 'create' ? <CreateAccountModal onClose={close} onDone={enter} />
    : step === 'unlock' ? <UnlockModal onClose={close} onDone={enter} onRestore={() => setStep('restore')} />
      : step === 'restore' ? <ImportModal onClose={close} onDone={enter} />
        : null
  return { start, restore: () => setStep('restore'), modal }
}

export type PlatformLogin = ReturnType<typeof usePlatformLogin>

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

const KIND_LABEL: Record<WalletHistoryKind, string> = { topup: 'Top up', withdrawal: 'Withdrawal', stake: 'Stake', payout: 'Payout', other: 'Transaction' }

/** Top-ups, withdrawals, stakes and payouts of this account, from the chain. */
export function HistoryModal({ onClose }: { onClose: () => void }) {
  const history = useWalletHistory(true)
  const when = (time: number | null) => (time ? new Date(time * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'pending')
  const sol = (lamports: bigint) => `${lamports > 0n ? '+' : lamports < 0n ? '−' : ''}${Number(formatUnits(lamports < 0n ? -lamports : lamports, 9)).toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
  return (
    <Modal title="HISTORY" onClose={onClose}>
      {history.isLoading ? <p style={{ margin: 0, opacity: 0.7 }}>Loading…</p>
        : history.isError ? <p style={{ margin: 0 }}>Could not load the history right now. Try again in a moment.</p>
          : !history.data?.length ? <p style={{ margin: 0, opacity: 0.7 }}>No transactions yet. Top up to start playing.</p>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '60vh', overflowY: 'auto' }}>
                {history.data.map((row) => (
                  <li key={row.signature} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: `2px solid rgba(27,19,64,0.1)` }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{KIND_LABEL[row.kind]}{row.game ? ` · ${row.game}` : ''}{row.failed ? ' · failed' : ''}</div>
                      <a href={explorerUrl('tx', row.signature)} target="_blank" rel="noreferrer" style={{ fontSize: 14, opacity: 0.65 }}>{when(row.time)} ↗</a>
                    </div>
                    <span style={{ flexShrink: 0, fontFamily: PIXEL, fontSize: 11, color: row.change > 0n ? '#1E7A36' : row.change < 0n ? '#C2245A' : INK }}>{sol(row.change)}</span>
                  </li>
                ))}
              </ul>
            )}
      <p style={{ margin: 0, fontSize: 14, opacity: 0.6 }}>The last 40 transactions. Amounts include network fees.</p>
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

/** Restores an account from a backed-up secret key with a new password
 * (replaces the one in this browser - the UI asks for a backup of the
 * current one first). */
export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const { connected, select } = useWallet()
  const [secret, setSecret] = useState('')
  const hasCurrent = prophetWalletStore.hasWallet()
  // A key the player forgot the password of may be restored without its backup flag.
  const blocked = connected && hasCurrent && !prophetWalletStore.isBackedUp()
  return (
    <Modal title="RESTORE ACCOUNT" onClose={onClose}>
      <p style={{ margin: 0 }}>Paste the secret key you saved and pick a new password. It replaces the account in this browser.</p>
      {blocked && (
        <p style={{ margin: 0, color: '#C2245A', fontWeight: 700 }}>Back up your current key first - it will be removed from this browser.</p>
      )}
      <input className="rx-input" type="password" autoComplete="off" style={{ width: 'calc(100% - 8px)', height: 52, padding: '0 14px', fontFamily: 'monospace', fontSize: 14 }} value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Secret key" />
      {!blocked && (
        <NewPassword
          label="RESTORE"
          busyLabel="RESTORING…"
          onSubmit={async (password) => {
            try {
              await prophetWalletStore.importSecret(secret, password)
            } catch (cause) {
              throw cause instanceof Error && cause.message === 'PasswordTooShort' ? cause : new Error('InvalidKey')
            }
            if (connected) {
              // Swapping the key of a connected session: a reload is the
              // simplest way to replace it everywhere (log in again after).
              select(ProphetWalletName)
              window.location.reload()
            } else if (onDone) {
              onDone()
            } else {
              select(ProphetWalletName)
              onClose()
            }
          }}
        />
      )}
    </Modal>
  )
}
