import { useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { AddressAvatar } from '@/components/AddressAvatar'
import { WalletOptionsList } from '@/components/WalletOptionsList'

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Wallet connect entry point for the real (mainnet) side — replaces a
 * generic "Connect Wallet" button with the actual installed wallets shown
 * immediately (icon + name each, via EIP-6963 discovery — wagmi's
 * `injected()` connector populates `connector.icon` from what the wallet
 * extension itself announces), one click to connect. When connected, shows
 * an address-derived avatar (see AddressAvatar) instead of a raw string, and
 * a one-item menu to disconnect. */
export function ConnectWalletButton() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border border-white/10 hover:border-white/30 transition-colors"
        >
          <AddressAvatar address={address} size={22} />
          <span className="font-mono text-xs text-white/80">{truncateAddress(address)}</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-white/10 bg-[#151622] shadow-2xl py-1 text-sm">
              <button
                onClick={() => {
                  setOpen(false)
                  disconnect()
                }}
                className="w-full text-left px-3 py-2 text-rose-400 hover:bg-white/5"
              >
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-[#C6FF3D] to-[#8FBF1F] hover:brightness-110 text-black font-semibold transition-all"
      >
        Connect wallet
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-white/10 bg-[#151622] shadow-2xl p-1.5">
            <WalletOptionsList onConnect={() => setOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}
