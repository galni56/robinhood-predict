import { Link } from 'react-router-dom'

/** Shared brand header for the real (mainnet) side of the site — the
 * landing page at "/" and everything under /onchain. Carries its own
 * "Try the demo" link instead of relying on the mock <Navbar>, whose
 * links (and Log in/Sign up) don't apply to a wallet-based flow. */
export function RealModeTopBar() {
  return (
    <div className="border-b border-white/10 bg-[#0a0a12]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 font-extrabold shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-[#C6FF3D] to-emerald-400 shadow-[0_0_10px_2px_rgba(198,255,61,0.55)]" />
          PredictX
          <span className="text-white/30 font-normal text-xs hidden sm:inline">on Robinhood Chain (mainnet)</span>
        </Link>
        <Link
          to="/demo"
          className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors shrink-0"
        >
          Try the demo →
        </Link>
      </div>
    </div>
  )
}
