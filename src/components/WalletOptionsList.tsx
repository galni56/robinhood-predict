import { useConnect } from 'wagmi'

/** Shared "pick a wallet" list - icon (from EIP-6963 `connector.icon`) + name,
 * one click to connect. Used both inside ConnectWalletButton's dropdown and
 * inline wherever a page prompts for a wallet before showing its content. */
export function WalletOptionsList({ onConnect }: { onConnect?: () => void }) {
  const { connectors: allConnectors, connect, isPending } = useConnect()

  // wagmi's injected() always adds a generic "Injected" fallback (id
  // 'injected', no real icon) alongside whatever EIP-6963 announces by name
  // (MetaMask, Phantom, ...) - redundant and non-functional-looking once a
  // real one is already listed, so hide it unless it's the only option.
  const named = allConnectors.filter((c) => c.id !== 'injected')
  const connectors = named.length > 0 ? named : allConnectors

  if (connectors.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white/60">
        <span className="font-bold text-white/80">No wallet found.</span> Install MetaMask or Phantom and reload the
        page - browsing works without one.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {connectors.map((c) => (
        <button
          key={c.uid}
          disabled={isPending}
          onClick={() => {
            connect({ connector: c })
            onConnect?.()
          }}
          className="group w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-bold hover:border-[#8B7CF7]/50 hover:bg-[#8B7CF7]/10 transition-all disabled:opacity-50"
        >
          <span className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center shrink-0">
            {c.icon ? <img src={c.icon} alt="" className="w-5 h-5 rounded-md" /> : <span className="w-5 h-5 rounded-md bg-white/15" />}
          </span>
          {c.name}
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#B3A7FA] opacity-0 group-hover:opacity-100 transition-opacity">
            Connect
            <span className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
          </span>
        </button>
      ))}
      <p className="text-[11px] text-white/30 pt-1">
        Browsing is open to everyone - a wallet is only needed to actually bet.
      </p>
    </div>
  )
}
