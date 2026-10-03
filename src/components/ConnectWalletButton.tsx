import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { AddressAvatar } from '@/components/AddressAvatar'
import { AddressLabel } from '@/components/AddressLabel'
import { LocalnetAirdropButton } from '@/components/LocalnetAirdropButton'
import { WalletOptionsList } from '@/components/WalletOptionsList'

// Lazy: the nickname modal pulls the Anchor program clients (both IDLs);
// loading that belongs to the moment someone opens the modal, not to the
// always-mounted navbar.
const SetNicknameModal = lazy(() => import('@/components/SetNicknameModal').then((m) => ({ default: m.SetNicknameModal })))
import { explorerUrl } from '@/solana/config'

/** Wallet connect entry point (Phantom or Solflare). When connected, shows
 * an address-derived avatar plus the wallet's nickname if it has one, and an
 * account menu (portfolio, nickname, copy address, explorer, disconnect). */
export function ConnectWalletButton() {
  const { publicKey, connected, disconnect } = useWallet()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [nicknameModalOpen, setNicknameModalOpen] = useState(false)
  const address = publicKey?.toBase58()
  const menuRef = useRef<HTMLDivElement>(null)

  // A document listener rather than a full-screen overlay: the navbar's
  // backdrop-blur makes it the containing block for fixed children, so an
  // overlay would only cover the navbar.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (connected && address) {
    return (
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 transition-colors"
        >
          <AddressAvatar address={address} size={22} />
          <AddressLabel address={address} link={false} className="font-mono text-xs text-white/80" />
        </button>
        {open && (
          <>
            <div className="absolute right-0 top-10 z-20 w-52 rounded-2xl border border-white/10 bg-[#241b2f] shadow-2xl py-1 text-sm">
              <NavLink
                to="/onchain/portfolio"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
              >
                Your portfolio
              </NavLink>
              <button
                onClick={() => {
                  setOpen(false)
                  setNicknameModalOpen(true)
                }}
                className="w-full text-left px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
              >
                Set nickname
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(address)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
                className="w-full text-left px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
              >
                {copied ? 'Copied!' : 'Copy address'}
              </button>
              <a
                href={explorerUrl('address', address)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white"
              >
                View on explorer ↗
              </a>
              <LocalnetAirdropButton />
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  setOpen(false)
                  void disconnect()
                }}
                className="w-full text-left px-3 py-2 text-rose-400 hover:bg-white/5"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
        {nicknameModalOpen && (
          <Suspense fallback={null}>
            <SetNicknameModal onClose={() => setNicknameModalOpen(false)} />
          </Suspense>
        )}
      </div>
    )
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-4 py-2 rounded-full bg-gradient-to-r from-[#8B7CF7] to-[#6A5AE0] hover:brightness-110 text-white font-bold transition-all shadow-[0_4px_16px_-4px_rgba(106,90,224,0.6)]"
      >
        Connect<span className="hidden sm:inline"> wallet ↗</span>
      </button>
      {open && (
        <>
          <div className="absolute right-0 top-10 z-20 w-72 rounded-2xl border border-white/10 bg-[#241b2f] shadow-2xl p-2">
            <WalletOptionsList onConnect={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
