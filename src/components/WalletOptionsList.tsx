import { useEffect, useMemo, useState } from 'react'
import { useConnect } from 'wagmi'

// MetaMask is a desktop browser extension - it can't be installed on a phone
// browser at all, so below this width we point mobile visitors at the
// MetaMask app's own built-in browser instead of telling them to "install
// MetaMask", which isn't actionable there.
const MOBILE_BREAKPOINT_PX = 500

function useIsNarrowViewport(maxWidthPx: number) {
  const query = `(max-width: ${maxWidthPx}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setNarrow(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return narrow
}

/** Shared "pick a wallet" list - icon (from EIP-6963 `connector.icon`) + name,
 * one click to connect. Used both inside ConnectWalletButton's dropdown and
 * inline wherever a page prompts for a wallet before showing its content. */
export function WalletOptionsList({ onConnect }: { onConnect?: () => void }) {
  const { connectors: allConnectors, connect, isPending } = useConnect()
  const isMobile = useIsNarrowViewport(MOBILE_BREAKPOINT_PX)
  const metaMaskConnectors = useMemo(
    () => allConnectors.filter((connector) => connector.id === 'metaMask'),
    [allConnectors],
  )
  const [availableConnectorUids, setAvailableConnectorUids] = useState<Set<string>>(new Set())
  const [isCheckingWallet, setIsCheckingWallet] = useState(true)

  // A targeted injected connector exists even when its extension does not.
  // Resolve the provider before rendering the button so visitors without
  // MetaMask get the installation guidance instead of a dead connect action.
  useEffect(() => {
    let cancelled = false

    void Promise.all(metaMaskConnectors.map(async (connector) => {
      try {
        return await connector.getProvider() ? connector.uid : null
      } catch {
        return null
      }
    })).then((uids) => {
      if (cancelled) return
      setAvailableConnectorUids(new Set(uids.filter((uid): uid is string => uid !== null)))
      setIsCheckingWallet(false)
    })

    return () => {
      cancelled = true
    }
  }, [metaMaskConnectors])

  const availableConnectors = metaMaskConnectors.filter((connector) => availableConnectorUids.has(connector.uid))

  if (isCheckingWallet) {
    return <p className="px-4 py-3.5 text-sm text-white/40">Looking for MetaMask...</p>
  }

  if (availableConnectors.length === 0) {
    const metamaskAppLink = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.hash}`
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm text-white/60">
        {isMobile ? (
          <>
            <span className="font-bold text-white/80">Wallet extension needed.</span> MetaMask is a browser
            extension for desktop Chrome, not something you can install on a phone browser. Open this site on a
            desktop computer with the MetaMask extension, or{' '}
            <a href={metamaskAppLink} className="text-[#B3A7FA] font-bold underline underline-offset-2">
              open it in the MetaMask app ↗
            </a>
            .
          </>
        ) : (
          <>
            <span className="font-bold text-white/80">No wallet found.</span> Install the MetaMask extension for
            Chrome and reload the page - browsing works without one.
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {availableConnectors.map((c) => (
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
