import { useConnect } from 'wagmi'

/** Shared "pick a wallet" list — icon (from EIP-6963 `connector.icon`) + name,
 * one click to connect. Used both inside ConnectWalletButton's dropdown and
 * inline wherever a page prompts for a wallet before showing its content. */
export function WalletOptionsList({ onConnect }: { onConnect?: () => void }) {
  const { connectors, connect, isPending } = useConnect()

  if (connectors.length === 0) {
    return <p className="text-sm text-white/50">No wallet found (MetaMask/Phantom). Install the extension and reload the page.</p>
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
          className="w-full flex items-center gap-3 rounded-lg border border-white/10 px-4 py-2.5 text-left hover:border-[#C6FF3D]/50 transition-colors disabled:opacity-50"
        >
          {c.icon ? (
            <img src={c.icon} alt="" className="w-6 h-6 rounded-md shrink-0" />
          ) : (
            <span className="w-6 h-6 rounded-md bg-white/10 shrink-0" />
          )}
          Connect {c.name}
        </button>
      ))}
    </div>
  )
}
