import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'

// The app uses HashRouter (routes live in the URL hash, e.g. "#/whitepaper"),
// which a plain same-page anchor link (href="#section-id") conflicts with --
// clicking one replaces the whole hash, so the router reads "section-id" as
// a brand new (unmatched) route instead of scrolling. Scrolling manually and
// preventing the default navigation keeps the in-page jump without touching
// the URL the router is watching.
function scrollToSection(e: MouseEvent, id: string) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const SECTIONS = [
  { id: 'overview', label: '1. Overview' },
  { id: 'markets', label: '2. How a market works' },
  { id: 'weighting', label: '3. Early-bet weighting' },
  { id: 'fees', label: '4. Fees' },
  { id: 'one-sided', label: '5. One-sided market protection' },
  { id: 'creation', label: '6. Market creation' },
  { id: 'architecture', label: '7. Architecture' },
  { id: 'roadmap', label: '8. Roadmap' },
  { id: 'risks', label: '9. Risks & disclaimers' },
] as const

export function WhitepaperPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-10">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          <p className="text-xs font-bold tracking-wider text-white/40 uppercase mb-2">Contents</p>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => scrollToSection(e, s.id)}
              className="block py-1 text-white/50 hover:text-white transition-colors"
            >
              {s.label}
            </a>
          ))}
        </div>
      </aside>

      <article className="min-w-0 space-y-12">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-[#C6FF3D]/80 uppercase mb-2">Whitepaper</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Prophet: parimutuel prediction markets for tokenized stocks</h1>
          <p className="text-white/40 text-sm mt-3">
            Version 1.0 · Robinhood Chain mainnet. This document describes the real, live product — real wallet,
            real USDG, real money. It is not audited, and not legal or investment advice — see{' '}
            <Link to="/terms" className="text-[#C6FF3D] hover:underline">
              Terms of Service
            </Link>{' '}
            §9 for the full disclaimer.
          </p>
        </div>

        <Section id="overview" title="1. Overview">
          <p>
            Prophet lets anyone bet on whether a tokenized stock will reach a target price before a deadline.
            Markets are two-sided (YES / NO), settle parimutuel — everyone on the losing side funds the payout to
            everyone on the winning side, in proportion to their stake — and require no bookmaker to set odds. The
            pool itself is the price discovery mechanism.
          </p>
          <p>
            The live product is a Solidity contract deployed to Robinhood Chain <strong>mainnet</strong>, settling
            real USDG against real Chainlink price feeds. A separate, fully client-side mock demo (reachable via
            "Try the demo") mirrors the same rules with simulated prices and no wallet, for anyone who wants to see
            how it works before risking real funds — but it's a different implementation, not a sandboxed version
            of the same contract.
          </p>
        </Section>

        <Section id="markets" title="2. How a market works">
          <p>Every market has:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>a <strong>token</strong> and a <strong>target price</strong> — not capped at a flat dollar amount,
              but required to sit within a band of the live price that scales with how far out the deadline is (see §6);</li>
            <li>a <strong>deadline</strong>, after which the market can be resolved against a live price feed,</li>
            <li>two pools, <strong>YES</strong> and <strong>NO</strong>, that anyone can stake into — once each, per
              side, per market (no adding to an existing position or hedging both sides beyond one bet each), capped
              at $50 per wallet per side.</li>
          </ul>
          <p>
            At resolution, the price feed decides the outcome. Winners receive their principal back in full, plus a
            share of the losing pool proportional to their <em>weighted</em> stake (see §3) relative to the total
            weighted stake on the winning side.
          </p>
        </Section>

        <Section id="weighting" title="3. Early-bet weighting">
          <p>
            Betting doesn't stay open for a market's entire life — it closes at two-thirds of the way to the
            deadline, leaving the final third purely for the outcome to become clear and for resolution. Within that
            betting window, every bet is stamped with a weight that decays linearly from <strong>2.00x</strong> at
            the instant betting opens down to <strong>0.50x</strong> right before it closes.
          </p>
          <p>
            That weight only affects how the losing pool is split — it never inflates or reduces principal. The
            effect: a bet placed early, while the outcome is still genuinely uncertain, is worth up to 4x more in
            the payout split than one placed late, once the direction is already obvious. It's a direct incentive
            against waiting for near-certainty before committing.
          </p>
        </Section>

        <Section id="fees" title="4. Fees">
          <p>
            A protocol fee of <strong>2%</strong> is taken — and only ever taken — from the winnings portion of a
            payout (the losing-pool share), never from a winner's own principal and never from a losing bet
            (there's nothing further to take from a loss; the stake is already gone to the winning side). There is
            no fee on losing bets, on refunds, or on cancelled markets.
          </p>
        </Section>

        <Section id="one-sided" title="5. One-sided market protection">
          <p>
            If a market reaches its deadline with stakes on only one side — or no stakes at all — there is no
            genuine two-sided prediction to settle, and no losing pool to fund a payout from. Rather than let one
            side "win" a market nobody actually bet against, it cancels automatically and every position is
            refunded in full, with no fee.
          </p>
        </Section>

        <Section id="creation" title="6. Market creation & guardrails">
          <p>
            Market creation is permissionless — any wallet can open one, not just curators. Two guardrails keep that
            from being abused:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              The price feed a market settles against must already be on an owner-maintained allowlist — permissionless
              creation, but not against an arbitrary or fake price source.
            </li>
            <li>
              The target price must sit within a band of the feed's live price at creation, scaled by how far out
              the deadline is: at least 2% away in every case, and no more than 4% away for a market closing within
              2 hours, 15% within 24 hours, or 20% for anything longer. A market can't be created trivially
              guaranteed to resolve one way, and can't be created effectively impossible to hit either.
            </li>
            <li>Every market also has a 30-minute minimum duration.</li>
          </ul>
          <p>
            The contract owner may also seed a market with initial liquidity (capped at $50 combined across both
            sides) so it doesn't have to open at literally zero pools.
          </p>
        </Section>

        <Section id="architecture" title="7. Architecture">
          <p>
            The real implementation is a Solidity contract (OpenZeppelin's <code className="text-[#C6FF3D]">Ownable</code>,{' '}
            <code className="text-[#C6FF3D]">ReentrancyGuard</code>, <code className="text-[#C6FF3D]">SafeERC20</code>) live on{' '}
            Robinhood Chain mainnet, reading prices through Chainlink's{' '}
            <code className="text-[#C6FF3D]">AggregatorV3Interface</code>. It's wired into the{' '}
            <Link to="/onchain" className="text-[#C6FF3D] hover:underline">
              real mode
            </Link>{' '}
            of this site via a standard browser wallet connection (MetaMask or Phantom) — no custodial wallet, no
            key ever touches this app; every transaction is signed in your own wallet extension.
          </p>
          <p>
            A separate mock app (everything under <code className="text-[#C6FF3D]">/demo</code>) runs entirely in
            your browser instead — a simulated chain, simulated price feeds, and localStorage-backed accounts, with
            zero backend and zero real funds. It's a different, parallel implementation of similar rules, not a
            sandboxed mode of the real contract.
          </p>
        </Section>

        <Section id="roadmap" title="8. Roadmap">
          <p>Known, explicitly open items, in rough priority order:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>External security audit of the contract — not done yet, and the highest-priority open item given real funds are already at stake.</li>
            <li>ETH as a second bet currency, alongside USDG.</li>
            <li>WalletConnect support, for mobile wallets that aren't a desktop browser extension.</li>
            <li>
              An AMM-style continuous-pricing mode as an alternative to parimutuel settlement, for markets that want
              a live, tradeable price instead of a resolve-at-deadline payout.
            </li>
            <li>Legal and regulatory review — deliberately not done yet, see §9.</li>
          </ul>
        </Section>

        <Section id="risks" title="9. Risks & disclaimers">
          <p>
            Real mode is a live product on Robinhood Chain mainnet — USDG and every balance there is real, and can
            be genuinely gained or lost. The contract has not undergone an external security audit (an internal
            self-review only), and is owner-centralized: a single address controls the price-feed allowlist and the
            protocol fee. Nothing here is financial, investment, or legal advice, and none of it should be treated
            as an offer to trade a regulated financial product. Legal/regulatory review has been deliberately
            deferred and is not resolved by this document existing — see the full{' '}
            <Link to="/terms" className="text-[#C6FF3D] hover:underline">
              Terms of Service
            </Link>
            . The separate mock demo (<code className="text-[#C6FF3D]">/demo</code>) is simulated and involves no
            real funds — everything in this section is about real mode specifically.
          </p>
        </Section>
      </article>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-bold mb-3">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  )
}
