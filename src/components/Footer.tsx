import { Link } from 'react-router-dom'
import { PROPHET_X_URL } from '@/lib/social'

const productLinks = [
  { to: '/onchain/races', label: 'Asset Races' },
  { to: '/onchain/arenas', label: 'Price Arena' },
  { to: '/onchain/portfolio', label: 'Portfolio' },
  { to: '/onchain/leaderboard', label: 'Leaderboard' },
  { to: '/onchain/archive', label: 'Archive' },
]

const resourceLinks = [
  { to: '/roadmap', label: 'Roadmap' },
  { to: '/whitepaper', label: 'Whitepaper' },
  { to: '/terms', label: 'Terms of Service' },
]

export function Footer() {
  return (
    <footer className="border-t-[3px] border-[#191330] bg-[#221c40]">
      <div className="px-checker h-4 border-b-[3px] border-[#191330] opacity-90" />
      <div className="max-w-[1500px] mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-2 max-w-sm">
          <div className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}brand/mascot-pixel.png`} alt="" className="px-art w-8 h-8 shrink-0" />
            <span className="px-font text-[11px] text-[#fbf3e2]">
              Prophet
            </span>
          </div>
          <p className="text-white/40 text-sm mt-3">
            Onchain prediction games on Solana: back the fastest mover or name the final price of stocks, memes and
            crypto. Stakes and payouts in SOL.
          </p>
          <a
            href={PROPHET_X_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Prophet on X"
            className="mt-4 inline-flex h-9 w-9 items-center justify-center border-2 border-[#fbf3e2]/30 text-[#fbf3e2]/60 transition-colors hover:border-[#ffd23f] hover:text-[#ffd23f]"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>

        <div>
          <div className="px-font mb-4 text-[9px] text-[#ffd23f]">Product</div>
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
          <div className="px-font mb-4 text-[9px] text-[#ff4f8b]">Resources</div>
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
          <span>© {new Date().getFullYear()} Prophet Markets</span>
          <span>Independent project on Solana. Not affiliated with Solana Labs, Robinhood or any listed issuer.</span>
        </div>
      </div>
    </footer>
  )
}
