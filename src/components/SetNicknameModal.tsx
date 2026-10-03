import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { MAX_NICKNAME_BYTES, nicknameQueryKey, useNickname } from '@/solana/nicknames'
import { usePrograms } from '@/solana/programs'
import { solanaTxError, useSendInstructions } from '@/solana/tx'

const byteLength = (value: string) => new TextEncoder().encode(value).length

/** A real transaction on nickname_registry: the nickname is public until
 * changed. Saving an empty value clears it and refunds the account rent. */
export function SetNicknameModal({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet()
  const owner = publicKey?.toBase58()
  const current = useNickname(owner)
  const programs = usePrograms()
  const send = useSendInstructions()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(current.data ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, pending])

  async function submit() {
    if (!publicKey) return
    setError(null)
    setPending(true)
    try {
      const nickname = value.trim()
      const ix = nickname
        ? await programs.nicknameRegistry.methods.setNickname(nickname).accounts({ owner: publicKey }).instruction()
        : await programs.nicknameRegistry.methods.clearNickname().accounts({ owner: publicKey }).instruction()
      if (!nickname && !current.data) {
        onClose()
        return
      }
      await send([ix])
      queryClient.setQueryData(nicknameQueryKey(owner), nickname || null)
      onClose()
    } catch (e) {
      setError(solanaTxError(e))
    } finally {
      setPending(false)
    }
  }

  return createPortal(
    // Portaled to <body>: the navbar's backdrop-blur would otherwise become
    // the containing block for this fixed overlay. The backdrop scrolls so
    // the modal stays reachable on short viewports.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151622] p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-sm font-bold mb-1">Set your nickname</h2>
          <p className="text-white/40 text-xs mb-3">
            A real Solana transaction - public, and visible wherever your address shows up. Storing it costs a small
            refundable rent deposit (~0.001 SOL). Leave blank to clear it and get the deposit back.
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              let next = e.target.value
              while (byteLength(next) > MAX_NICKNAME_BYTES) next = next.slice(0, -1)
              setValue(next)
            }}
            placeholder="e.g. satoshi"
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#8B7CF7]/60 transition-colors"
          />
          <p className="text-[11px] text-white/30 mt-1">{byteLength(value)}/{MAX_NICKNAME_BYTES}</p>

          {error && <p className="text-rose-400 text-xs mt-2">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || !publicKey}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-black font-semibold py-2 text-sm disabled:opacity-50 transition-all"
            >
              {pending ? 'Confirm in wallet…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
