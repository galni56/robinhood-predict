import { useEffect, useMemo, useState } from 'react'
import { useConnect } from 'wagmi'

// MetaMask is a desktop browser extension - it can't be installed on a phone
// browser at all, so below this width we point mobile visitors at the
// MetaMask app's own built-in browser instead of telling them to "install
// MetaMask", which isn't actionable there.
const MOBILE_BREAKPOINT_PX = 500
const METAMASK_ICON_DATA_URL = 'data:image/png;base64,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'

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

/** Shared "pick a wallet" list - MetaMask icon + name, one click to connect.
 * Used both inside ConnectWalletButton's dropdown and
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
            <img src={c.icon ?? METAMASK_ICON_DATA_URL} alt="" className="w-5 h-5 rounded-md" />
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
