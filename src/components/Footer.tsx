import { Link, useLocation } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'

const realModeLinks = [
  { to: '/onchain', label: 'Markets' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/demo', label: 'Try the demo' },
]

const mockModeLinks = [
  { to: '/markets', label: 'Markets' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/archive', label: 'Archive' },
  { to: '/explorer', label: 'Explorer' },
  { to: '/', label: 'Live mainnet' },
]

const resourceLinks = [
  { to: '/whitepaper', label: 'Whitepaper' },
  { to: '/terms', label: 'Terms of Service' },
]

export function Footer() {
  const { pathname } = useLocation()
  const isOnchain = pathname === '/' || pathname.startsWith('/onchain') || pathname === '/whitepaper' || pathname === '/terms'
  const productLinks = isOnchain ? realModeLinks : mockModeLinks

  return (
    <footer className="border-t border-white/10 bg-[#08080e]">
      <div className="max-w-[1500px] mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-2 max-w-sm">
          <div className="flex items-center gap-2 font-extrabold">
            <img src={`${import.meta.env.BASE_URL}ProphetMarkets_fun.png`} alt="" className="w-4 h-4 rounded-sm shrink-0" />
            Prophet
          </div>
          <p className="text-white/40 text-sm mt-3">
            Parimutuel prediction markets for tokenized stocks. Pick YES or NO on a target price, bet early for a
            bigger share, settle when the deadline hits.
          </p>
          <a
            href="https://x.com/prophetmarketsx"
            target="_blank"
            rel="noreferrer"
            aria-label="Prophet on X"
            className="inline-flex items-center justify-center w-8 h-8 mt-4 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>

        <div>
          <div className="text-xs font-bold tracking-wider text-white/40 uppercase mb-3">Product</div>
          <ul className="space-y-2 text-sm">
            {productLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-white/60 hover:text-white transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-xs font-bold tracking-wider text-white/40 uppercase mb-3">Resources</div>
          <ul className="space-y-2 text-sm">
            {resourceLinks.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="text-white/60 hover:text-white transition-colors">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-[1500px] mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/30">
          <span>© {new Date().getFullYear()} Prophet. Demo project, not a registered financial service.</span>
          <span>
            {isOnchain
              ? 'Real mode: Robinhood Chain mainnet, real USDG. Not affiliated with Robinhood Markets, Inc. Contract has not had an external security audit.'
              : RHCHAIN_META.disclaimer}
          </span>
        </div>
      </div>
    </footer>
  )
}
