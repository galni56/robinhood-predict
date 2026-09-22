import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { wagmiConfig } from '@/chain/config'
import { nicknameRegistryAbi, NICKNAME_REGISTRY_ADDRESS, useNickname } from '@/chain/nicknames'
import { shortTxError } from '@/lib/format'

const MAX_LENGTH = 24

/** A real transaction (setNickname on NicknameRegistry) -- the nickname is
 * public and permanent until changed, same as everything else in real mode.
 * Rendered as a modal overlay; `onClose` is called after a successful set
 * or when the user backs out. */
export function SetNicknameModal({ onClose }: { onClose: () => void }) {
  const { address } = useAccount()
  const current = useNickname(address)
  const { writeContractAsync } = useWriteContract()
  const [value, setValue] = useState(current.data ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setPending(true)
    try {
      const hash = await writeContractAsync({
        address: NICKNAME_REGISTRY_ADDRESS,
        abi: nicknameRegistryAbi,
        functionName: 'setNickname',
        args: [value.trim()],
      })
      await waitForTransactionReceipt(wagmiConfig, { hash })
      await current.refetch()
      onClose()
    } catch (e) {
      setError(shortTxError(e))
    } finally {
      setPending(false)
    }
  }

  return (
    // The backdrop itself scrolls (rather than just centering with no
    // overflow handling) so the modal stays fully reachable on a short
    // viewport instead of its top clipping off-screen with no way to get
    // to it -- happened for real on a short/zoomed browser window.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#151622] p-5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-sm font-bold mb-1">Set your nickname</h2>
          <p className="text-white/40 text-xs mb-3">
            A real on-chain transaction — public, and visible to everyone wherever your address shows up. Leave blank
            to clear it.
          </p>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="e.g. satoshi"
            className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm outline-none focus:border-[#C6FF3D]/60 transition-colors"
          />
          <p className="text-[11px] text-white/30 mt-1">{value.length}/{MAX_LENGTH}</p>

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
              disabled={pending}
              className="flex-1 rounded-lg bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold py-2 text-sm disabled:opacity-50 transition-all"
            >
              {pending ? 'Confirm in wallet…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
