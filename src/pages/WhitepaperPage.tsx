import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RHCHAIN_META } from '@/market/tokens'
import { MAX_SEED_LIQUIDITY, MAX_TARGET_PRICE, PROTOCOL_FEE_BP } from '@/store/marketStore'

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
    <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-[200px_1fr] gap-10">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          <p className="text-xs font-bold tracking-wider text-white/40 uppercase mb-2">Contents</p>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="block py-1 text-white/50 hover:text-white transition-colors">
              {s.label}
            </a>
          ))}
        </div>
      </aside>

      <article className="min-w-0 space-y-12">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-violet-300/80 uppercase mb-2">Whitepaper</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">PredictX: parimutuel prediction markets for tokenized stocks</h1>
          <p className="text-white/40 text-sm mt-3">
            Version 0.3 · Draft for {RHCHAIN_META.name}. This document describes how the product works today. It is
            not audited, not legal or investment advice, and describes a demo/testnet system — see{' '}
            <Link to="/terms" className="text-violet-300 hover:underline">
              Terms of Service
            </Link>{' '}
            §9 for the full disclaimer.
          </p>
        </div>

        <Section id="overview" title="1. Overview">
          <p>
            PredictX lets anyone bet on whether a tokenized stock will reach a target price before a deadline.
            Markets are two-sided (YES / NO), settle parimutuel — everyone on the losing side funds the payout to
            everyone on the winning side, in proportion to their stake — and require no bookmaker to set odds. The
            pool itself is the price discovery mechanism.
          </p>
          <p>
            The product ships as two parallel implementations of the same rules: a fully client-side mock (this
            site, on every route except <code className="text-violet-300">/onchain/*</code>) for a zero-friction
            demo, and a Solidity contract deployed to {RHCHAIN_META.name} for real (test-value) on-chain
            settlement. Both enforce identical math — target price caps, fee structure, and the weighting mechanic
            described below.
          </p>
        </Section>

        <Section id="markets" title="2. How a market works">
          <p>Every market has:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>a <strong>token</strong> and a <strong>target price</strong> (capped at {formatUsdInline(MAX_TARGET_PRICE)}),</li>
            <li>a <strong>deadline</strong>, after which the market can be resolved against a live price feed,</li>
            <li>two pools, <strong>YES</strong> and <strong>NO</strong>, that anyone can stake into — once each, per
              side, per market (no adding to an existing position or hedging both sides beyond one bet each).</li>
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
            A protocol fee of <strong>{formatPctInline(PROTOCOL_FEE_BP)}</strong> is taken — and only ever taken —
            from the winnings portion of a payout (the losing-pool share), never from a winner's own principal and
            never from a losing bet (there's nothing further to take from a loss; the stake is already gone to the
            winning side). There is no fee on losing bets, on refunds, or on cancelled markets.
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

        <Section id="creation" title="6. Market creation">
          <p>
            Market creation is permissionless — any account can open one, not just curators. To keep that from
            being abused to rig a market against a fake or manipulated price source, the price feed a market
            settles against must already be on an owner-maintained allowlist. An admin may also seed a market with
            initial liquidity (capped at {formatUsdInline(MAX_SEED_LIQUIDITY)} combined across both sides) so it
            doesn't have to open at literally zero pools.
          </p>
        </Section>

        <Section id="architecture" title="7. Architecture">
          <p>
            The mock app (everything under <code className="text-violet-300">/markets</code>,{' '}
            <code className="text-violet-300">/portfolio</code>, etc.) runs entirely in your browser — a simulated
            chain, simulated price feeds, and localStorage-backed accounts, with zero backend. It exists to make the
            mechanics playable without a wallet or test funds.
          </p>
          <p>
            The real implementation is a Solidity contract (OpenZeppelin's <code className="text-violet-300">Ownable</code>,{' '}
            <code className="text-violet-300">ReentrancyGuard</code>, <code className="text-violet-300">SafeERC20</code>) deployed to{' '}
            {RHCHAIN_META.name}, reading prices through a Chainlink-compatible{' '}
            <code className="text-violet-300">AggregatorV3Interface</code>. It is wired into the{' '}
            <Link to="/onchain" className="text-violet-300 hover:underline">
              live testnet section
            </Link>{' '}
            of this site via a standard browser wallet connection (MetaMask or Phantom) — no custodial wallet, no
            key ever touches this app.
          </p>
        </Section>

        <Section id="roadmap" title="8. Roadmap">
          <p>In rough order:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>External security audit of the contract before any real-value usage.</li>
            <li>
              Real Chainlink price feeds once Data Streams support for tokenized equities lands on this testnet
              (Data Feeds currently only exist on mainnet).
            </li>
            <li>
              An AMM-style continuous-pricing mode as an alternative to parimutuel settlement, for markets that want
              a live, tradeable price instead of a resolve-at-deadline payout.
            </li>
            <li>Legal and regulatory review — deliberately not done yet, see §9.</li>
          </ul>
        </Section>

        <Section id="risks" title="9. Risks & disclaimers">
          <p>
            This is a demo and testnet product. mUSD and every balance in the mock app have no real-world value. The
            on-chain contract runs on a public <em>testnet</em> — its tokens are test assets, not real money, and
            the contract has not undergone an external security audit. Nothing here is financial, investment, or
            legal advice, and none of it should be treated as an offer to trade a real financial product.
            Legal/regulatory review has been deliberately deferred and is not resolved by this document existing —
            see the full{' '}
            <Link to="/terms" className="text-violet-300 hover:underline">
              Terms of Service
            </Link>
            .
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

function formatUsdInline(n: number) {
  return `$${n.toLocaleString('en-US')}`
}

function formatPctInline(bp: number) {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 1)}%`
}
