import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@solana/wallet-adapter-react'
import { MAX_NICKNAME_BYTES, NICKNAMES_QUERY_KEY, useNickname } from '@/solana/nicknames'
import { useSignedAction } from '@/chain/gameServer'
import { shortTxError } from '@/lib/format'

const byteLength = (value: string) => new TextEncoder().encode(value).length

/** Signed with the wallet (no transaction, no fee) and kept by the game
 * server: public, one per wallet, unique. Saving an empty value clears it. */
export function SetNicknameModal({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet()
  const owner = publicKey?.toBase58()
  const current = useNickname(owner)
  const act = useSignedAction()
  const queryClient = useQueryClient()
  const [value, setValue] = useState(current.data ?? '')
  const [touched, setTouched] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The modal can open before the nickname query resolves, so the input
  // starts empty. Fill it when the data arrives (unless the user already
  // typed) - otherwise pressing Save with the untouched empty input would
  // clear the existing nickname.
  useEffect(() => {
    if (!touched && current.data) setValue(current.data)
  }, [current.data, touched])

  const closeUnlessPending = () => {
    if (!pending) onClose()
  }

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
      if (!nickname && !current.data) {
        onClose()
        return
      }
      await act({ action: 'set-nickname', nickname })
      queryClient.setQueryData<Record<string, string>>(NICKNAMES_QUERY_KEY, (all) => {
        const next = { ...(all ?? {}) }
        if (nickname) next[owner!] = nickname
        else delete next[owner!]
        return next
      })
      onClose()
    } catch (e) {
      setError(shortTxError(e, 'set-nickname'))
    } finally {
      setPending(false)
    }
  }

  return createPortal(
    // Portaled to <body>: the navbar's backdrop-blur would otherwise become
    // the containing block for this fixed overlay. The backdrop scrolls so
    // the modal stays reachable on short viewports.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60" onClick={closeUnlessPending}>
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-sm rounded-none border border-[#1B1340]/15 bg-[#FFF6DF] p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-sm font-bold mb-1">Set your nickname</h2>
          <p className="text-[#1B1340]/55 text-xs mb-3">
            Your wallet signs a message (free, no transaction). The nickname is public and shows wherever your address
            does; each nickname belongs to one wallet. Leave blank to clear it.
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              let next = e.target.value
              while (byteLength(next) > MAX_NICKNAME_BYTES) next = next.slice(0, -1)
              setTouched(true)
              setValue(next)
            }}
            placeholder="e.g. satoshi"
            className="w-full rounded-none bg-black/30 border border-[#1B1340]/15 px-3 py-2 text-sm outline-none focus:border-[#ff4f8b]/60 transition-colors"
          />
          <p className="text-[11px] text-[#1B1340]/50 mt-1">{byteLength(value)}/{MAX_NICKNAME_BYTES}</p>

          {error && <p className="text-[#C2245A] text-xs mt-2">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button
              onClick={closeUnlessPending}
              disabled={pending}
              className="flex-1 rounded-none border border-[#1B1340]/15 text-[#1B1340]/70 hover:text-[#1B1340] hover:border-white/30 py-2 text-sm transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={pending || !publicKey || current.isLoading}
              className="flex-1 rounded-none bg-gradient-to-r from-[#ff4f8b] to-[#ff4f8b] hover:brightness-110 text-black font-semibold py-2 text-sm disabled:opacity-50 transition-all"
            >
              {pending ? 'Sign in wallet…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
