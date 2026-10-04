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
          className="flex items-center gap-2 border-[3px] border-[#191330] bg-[#fbf3e2] py-1 pl-1.5 pr-3 shadow-[3px_3px_0_#191330] transition-transform hover:-translate-y-0.5"
        >
          <AddressAvatar address={address} size={22} />
          <AddressLabel address={address} link={false} className="font-mono text-xs font-bold text-[#191330]" />
        </button>
        {open && (
          <>
            <div className="absolute right-0 top-11 z-20 w-56 border-[3px] border-[#191330] bg-[#fbf3e2] py-1 text-sm shadow-[5px_5px_0_#191330]">
              <NavLink
                to="/onchain/portfolio"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 font-bold text-[#191330]/75 hover:bg-[#ffd23f] hover:text-[#191330]"
              >
                Your portfolio
              </NavLink>
              <button
                onClick={() => {
                  setOpen(false)
                  setNicknameModalOpen(true)
                }}
                className="w-full px-3 py-2 text-left font-bold text-[#191330]/75 hover:bg-[#ffd23f] hover:text-[#191330]"
              >
                Set nickname
              </button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(address)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
                className="w-full px-3 py-2 text-left font-bold text-[#191330]/75 hover:bg-[#ffd23f] hover:text-[#191330]"
              >
                {copied ? 'Copied!' : 'Copy address'}
              </button>
              <a
                href={explorerUrl('address', address)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 font-bold text-[#191330]/75 hover:bg-[#ffd23f] hover:text-[#191330]"
              >
                View on explorer ↗
              </a>
              <LocalnetAirdropButton />
              <div className="my-1 border-t-2 border-[#191330]/15" />
              <button
                onClick={() => {
                  setOpen(false)
                  void disconnect()
                }}
                className="w-full px-3 py-2 text-left font-bold text-[#e5484d] hover:bg-[#e5484d]/10"
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
        className="px-btn px-btn--pink px-btn--sm"
      >
        Connect<span className="hidden sm:inline"> wallet</span>
      </button>
      {open && (
        <>
          <div className="absolute right-0 top-12 z-20 w-72 border-[3px] border-[#191330] bg-[#fbf3e2] p-2 shadow-[5px_5px_0_#191330]">
            <WalletOptionsList onConnect={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
