import { Link } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'

const productLinks = [
  { to: '/markets', label: 'Markets' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/archive', label: 'Archive' },
  { to: '/explorer', label: 'Explorer' },
  { to: '/onchain', label: 'Live testnet' },
]

const resourceLinks = [
  { to: '/whitepaper', label: 'Whitepaper' },
  { to: '/terms', label: 'Terms of Service' },
]

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#08080e]">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-2 max-w-sm">
          <div className="flex items-center gap-2 font-extrabold">
            <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-violet-400 to-emerald-400 shadow-[0_0_8px_2px_rgba(139,92,246,0.55)]" />
            PredictX
          </div>
          <p className="text-white/40 text-sm mt-3">
            Parimutuel prediction markets for tokenized stocks, built for {RHCHAIN_META.name}. Pick YES or NO on a
            target price, bet early for a bigger share, settle when the deadline hits.
          </p>
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
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-white/30">
          <span>© {new Date().getFullYear()} PredictX. Demo project, not a registered financial service.</span>
          <span>{RHCHAIN_META.disclaimer}</span>
        </div>
      </div>
    </footer>
  )
}
