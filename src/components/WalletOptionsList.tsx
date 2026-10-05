import { useEffect, useMemo, useState } from 'react'
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base'
import { useWallet } from '@solana/wallet-adapter-react'
import { ProphetWalletName, prophetWalletStore } from '@/solana/prophetWallet'
import { EXTERNAL_WALLETS_ENABLED } from '@/solana/SolanaProvider'

const MOBILE_BREAKPOINT_PX = 500

// Supported wallets, in display order. Other installed Wallet Standard wallets
// are listed after these.
const PREFERRED = ['Phantom', 'Solflare']

// Opening the site inside a wallet's in-app browser is the only way to use an
// extension wallet on a phone.
function mobileDeepLink(walletName: string) {
  const url = encodeURIComponent(window.location.href)
  const ref = encodeURIComponent(window.location.origin)
  if (walletName === 'Phantom') return `https://phantom.app/ul/browse/${url}?ref=${ref}`
  if (walletName === 'Solflare') return `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`
  return undefined
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

/** Shared "pick a wallet" list, used in ConnectWalletButton's dropdown and
 * inline wherever a page asks for a wallet before showing its content. */
const PIXEL = "'Press Start 2P', 'Courier New', monospace"

/** Platform-wallet entry: one bevelled button that creates (or logs into)
 * the personal account, plus a restore link for players with a saved key. */
function PlatformAccountEntry({ onConnect, onRestore }: { onConnect?: () => void; onRestore?: () => void }) {
  const { select } = useWallet()
  const hasAccount = prophetWalletStore.hasWallet()
  return (
    <div className="flex flex-col items-stretch gap-2 text-[#1B1340]">
      <button
        type="button"
        className="rx-btn rx-btn-pink"
        style={{ minHeight: 56, fontFamily: PIXEL, fontSize: 12 }}
        onClick={() => {
          select(ProphetWalletName)
          onConnect?.()
        }}
      >
        {hasAccount ? 'LOG IN' : 'CREATE ACCOUNT'}
      </button>
      {!hasAccount && (
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, opacity: 0.7, textAlign: 'center' }}>
          Free, instant, no extension needed.
        </p>
      )}
      {onRestore && (
        <button
          type="button"
          onClick={onRestore}
          style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 16, fontWeight: 700, color: '#1B1340', textDecoration: 'underline', textUnderlineOffset: 4 }}
        >
          I have a secret key
        </button>
      )}
    </div>
  )
}

export function WalletOptionsList({ onConnect, onRestore, tone = 'market' }: {
  onConnect?: () => void
  onRestore?: () => void
  tone?: 'market' | 'race' | 'arena'
}) {
  if (!EXTERNAL_WALLETS_ENABLED) return <PlatformAccountEntry onConnect={onConnect} onRestore={onRestore} />
  return <ExternalWalletOptions onConnect={onConnect} tone={tone} />
}

function ExternalWalletOptions({ onConnect, tone = 'market' }: {
  onConnect?: () => void
  tone?: 'market' | 'race' | 'arena'
}) {
  const { wallets, select, connecting } = useWallet()
  const isMobile = useIsNarrowViewport(MOBILE_BREAKPOINT_PX)

  const options = useMemo(() => {
    const rank = (name: string) => {
      const index = PREFERRED.indexOf(name)
      return index === -1 ? PREFERRED.length : index
    }
    // Loadable covers the localnet-only burner wallet (see SolanaProvider).
    return wallets
      .filter((w) => PREFERRED.includes(w.adapter.name) || w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable)
      .sort((a, b) => rank(a.adapter.name) - rank(b.adapter.name))
  }, [wallets])

  const actionClass = tone === 'race'
    ? 'hover:border-[#ffd23f]/50 hover:bg-[#ffd23f]/10'
    : tone === 'arena'
      ? 'hover:border-[#6bcbf4]/50 hover:bg-[#6bcbf4]/10'
      : 'hover:border-[#ff4f8b]/50 hover:bg-[#ff4f8b]/10'
  const actionTextClass = tone === 'race'
    ? 'text-[#ffd23f]'
    : tone === 'arena'
      ? 'text-[#6bcbf4]'
      : 'text-[#ff4f8b]'

  return (
    <div className="space-y-2">
      {options.map(({ adapter, readyState }) => {
        const installed = readyState === WalletReadyState.Installed || readyState === WalletReadyState.Loadable
        const href = installed ? undefined : isMobile ? mobileDeepLink(adapter.name) ?? adapter.url : adapter.url
        const content = (
          <>
            <span className="w-9 h-9 rounded-none bg-[#1B1340]/5 grid place-items-center shrink-0">
              <img src={adapter.icon} alt="" className="h-5 w-5" />
            </span>
            {adapter.name}
            <span
              className={`ml-auto inline-flex items-center gap-1.5 text-xs font-bold transition-opacity ${installed ? 'opacity-0 group-hover:opacity-100' : 'opacity-70'} ${actionTextClass}`}
            >
              {installed ? 'Connect' : isMobile ? 'Open in app' : 'Install'}
              <span className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5">↗</span>
            </span>
          </>
        )
        const className = `rx-plate group w-full flex items-center gap-3 bg-white px-4 py-3 text-left text-sm font-bold text-[#1B1340] transition-all disabled:opacity-50 hover:bg-[#FFD23F] ${actionClass}`
        return href ? (
          <a key={adapter.name} href={href} target="_blank" rel="noreferrer" className={className}>
            {content}
          </a>
        ) : (
          <button
            key={adapter.name}
            disabled={connecting}
            onClick={() => {
              // autoConnect on the provider completes the connection.
              select(adapter.name as WalletName)
              onConnect?.()
            }}
            className={className}
          >
            {content}
          </button>
        )
      })}
      <p className="text-[11px] text-white/30 pt-1">
        Browsing is open to everyone - a wallet is only needed to actually play.
      </p>
    </div>
  )
}
