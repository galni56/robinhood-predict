import { useEffect, useMemo, useState } from 'react'
import { useConnect } from 'wagmi'

// MetaMask is a desktop browser extension - it can't be installed on a phone
// browser at all, so below this width we point mobile visitors at the
// MetaMask app's own built-in browser instead of telling them to "install
// MetaMask", which isn't actionable there.
const MOBILE_BREAKPOINT_PX = 500

function MetaMaskIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 35 35" className="h-5 w-5" fill="none">
      <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="0.25">
        <path d="m32.958 2-13.134 9.718 2.442-5.727z" fill="#e17726" stroke="#e17726" />
        <g fill="#e27625" stroke="#e27625">
          <path d="m2.663 2 13.017 9.809-2.325-5.818zM28.23 24.533l-3.495 5.34 7.483 2.06 2.143-7.283zm-26.957.117 2.13 7.282 7.47-2.06-3.481-5.339z" />
          <path d="M10.47 15.515 8.393 18.65l7.405.337-.247-7.97zm14.68 0-5.157-4.587-.169 8.06 7.405-.337zM10.873 29.872l4.482-2.164-3.858-3.006zm9.393-2.164 4.469 2.164-.61-5.17z" />
        </g>
        <path d="m24.735 29.872-4.47-2.164.365 2.903-.04 1.23zm-13.862 0 4.157 1.97-.026-1.231.351-2.903z" fill="#d5bfb2" stroke="#d5bfb2" />
        <path d="m15.108 22.784-3.715-1.088 2.624-1.205zm5.405 0 1.09-2.293 2.638 1.205z" fill="#233447" stroke="#233447" />
        <path d="m10.873 29.872.65-5.339-4.131.117zm13.225-5.339.637 5.34 3.494-5.223zm3.132-5.883-7.406.338.689 3.796 1.09-2.293 2.638 1.205zm-15.837 3.046 2.624-1.205 1.091 2.293.689-3.796-7.405-.337z" fill="#cc6228" stroke="#cc6228" />
        <path d="m8.392 18.65 3.105 6.052-.104-3.006zm15.849 3.046-.117 3.006 3.105-6.051zm-8.444-2.708-.689 3.796.87 4.484.196-5.91zm4.027 0-.364 2.358.182 5.922.87-4.484z" fill="#e27525" stroke="#e27525" />
        <path d="m20.513 22.784-.87 4.484.623.44 3.858-3.006.117-3.006zm-9.12-1.088.104 3.006 3.858 3.006.624-.44-.87-4.484z" fill="#f5841f" stroke="#f5841f" />
        <path d="m20.59 31.842.04-1.231-.338-.285h-4.963l-.325.285.026 1.23-4.157-1.969 1.455 1.192 2.95 2.035h5.053l2.962-2.035 1.442-1.192z" fill="#c0ac9d" stroke="#c0ac9d" />
        <path d="m20.266 27.708-.624-.44H15.98l-.624.44-.35 2.903.324-.285h4.963l.338.285z" fill="#161616" stroke="#161616" />
        <path d="M33.517 12.353 34.62 6.99 32.958 2l-12.692 9.394 4.885 4.12 6.898 2.01 1.52-1.776-.663-.48 1.053-.958-.806-.622 1.052-.804zM1 6.989l1.117 5.364-.714.531 1.065.804-.805.622 1.052.959-.663.48 1.52 1.774 6.899-2.008 4.884-4.12L2.663 2z" fill="#763e1a" stroke="#763e1a" />
        <path d="m32.049 17.523-6.898-2.008 2.078 3.136-3.105 6.051 4.106-.052h6.131zM10.47 15.515l-6.898 2.008-2.3 7.127h6.12l4.105.052-3.105-6.051zm9.354 3.473.442-7.594 2-5.403h-8.911l2 5.403.442 7.594.169 2.384.013 5.896h3.663l.013-5.896z" fill="#f5841f" stroke="#f5841f" />
      </g>
    </svg>
  )
}

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
      {availableConnectors.map((connector) => (
        <button
          key={connector.uid}
          disabled={isPending}
          onClick={() => {
            connect({ connector })
            onConnect?.()
          }}
          className="group w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm font-bold hover:border-[#8B7CF7]/50 hover:bg-[#8B7CF7]/10 transition-all disabled:opacity-50"
        >
          <span className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center shrink-0">
            <MetaMaskIcon />
          </span>
          {connector.name}
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
