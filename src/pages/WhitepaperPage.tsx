import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'

// The app uses HashRouter (routes live in the URL hash, e.g. "#/whitepaper"),
// which conflicts with normal same-page anchor navigation. Scroll manually so
// the router keeps the current route while the contents links still work.
function scrollToSection(e: MouseEvent, id: string) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const SECTIONS = [
  { id: 'overview', label: '1. Overview' },
  { id: 'shared', label: '2. Shared foundations' },
  { id: 'races', label: '3. Asset Races' },
  { id: 'race-payouts', label: '4. Race settlement' },
  { id: 'arena', label: '5. Price Arena' },
  { id: 'arena-payouts', label: '6. Arena ranking' },
  { id: 'prices', label: '7. Prices & automation' },
  { id: 'trust', label: '8. Trust & administration' },
] as const

export function WhitepaperPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">Contents</p>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => scrollToSection(event, section.id)}
              className="block py-1 text-white/50 transition-colors hover:text-white"
            >
              {section.label}
            </a>
          ))}
        </div>
      </aside>

      <article className="min-w-0 space-y-12">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#8B7CF7]/80">Whitepaper</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Prophet: onchain prediction games on Solana
          </h1>
          <p className="mt-3 text-sm text-white/40">
            Draft · Solana. Prophet has not received an external security audit. This document is not legal,
            financial or investment advice. See the{' '}
            <Link to="/terms" className="text-[#8B7CF7] hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>

        <Section id="overview" title="1. Overview">
          <p>
            Prophet runs two independent games on Solana around the prices of stocks, memes and crypto assets.
            <strong> Asset Races</strong> compare the percentage performance of several assets over the same interval.
            <strong> Price Arena</strong> asks players to predict one asset&apos;s finishing price, then rewards the closest
            half of the field.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard title="Races" accent="text-[#F2A65A]" link="/onchain/races">
              Back one of 2–6 assets. The highest percentage return wins the race.
            </ModeCard>
            <ModeCard title="Arena" accent="text-[#B7CEFF]" link="/onchain/arenas">
              Enter a price prediction. The closest half share the losing half&apos;s stakes.
            </ModeCard>
          </div>
          <p>
            Each game is its own Solana program with its own accounts. Every race or arena holds its stakes in its
            own account, so a failure or cancellation in one game cannot change another game&apos;s funds or result.
          </p>
        </Section>

        <Section id="shared" title="2. Shared foundations">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Network:</strong> Solana.</li>
            <li>
              <strong>Stake currency:</strong> stakes, pools, payouts and refunds use SOL. The programs can also accept
              admin-approved SPL tokens, each with its own stake limits; a game keeps the currency it was created with.
              The interface accepts USD or SOL input and shows both before the wallet opens.
            </li>
            <li>
              <strong>Reviewed assets:</strong> stocks (tokenized via xStocks), memes and crypto, each bound to one
              reviewed DEX pool with a minimum liquidity at review time. Categories never mix within a game.
            </li>
            <li>
              <strong>Prices in USD:</strong> asset prices are quoted in USD, from pools paired with USDC or converted
              through SOL/USDC at the same block. Price quotes are units, not the stake currency.
            </li>
            <li>
              <strong>Non-custodial:</strong> Prophet never receives a wallet&apos;s private key. Entries, claims and
              refunds are signed by the player in Phantom, Solflare or another Solana wallet.
            </li>
            <li>
              <strong>Parimutuel economics:</strong> players compete against one another rather than a bookmaker. The
              payout comes from stakes already locked in that game.
            </li>
          </ul>
        </Section>

        <Section id="races" title="3. Asset Races · highest return wins">
          <p>
            A Race compares <strong>2–6 assets from one category</strong>. Players back one asset, and the winner is
            the asset with the highest percentage return between the common start and end snapshots - not the asset
            with the highest price.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Prophet creates featured races; any wallet can create a community race by choosing a category, a title
              and an approved duration, optionally with initial assets.
            </li>
            <li>
              Community races open with a lobby. No betting occurs yet. Each wallet may add one approved asset, up to
              six. Fewer than two assets at lobby close cancels the race.
            </li>
            <li>
              Betting then opens. A wallet backs one asset and may top up that same asset up to the per-wallet limit;
              the selection cannot be changed.
            </li>
            <li>
              At the betting cutoff, only assets with bets become active. If fewer than the required number are active,
              the race cancels and every stake is refundable.
            </li>
            <li>
              The start snapshot P0 is the price just before the betting cutoff; the end snapshot P1 is the price just
              before the scheduled finish. Only these two snapshots decide the result.
            </li>
          </ol>
          <Formula>asset return = (P1 − P0) ÷ P0</Formula>
          <p>The highest return wins even when every contender fell in price.</p>
        </Section>

        <Section id="race-payouts" title="4. Race settlement, payouts and voids">
          <p>
            Every player who backed the winning asset receives principal plus a stake-proportional share of the losing
            assets&apos; combined pool.
          </p>
          <Formula>payout = stake + (stake ÷ winning pool) × losing pool × 98%</Formula>
          <p>
            The 2% fee comes only from the losing pool: half is credited to the race creator and half goes to Prophet.
            If two or more assets finish with exactly the same top return, the race is void and every stake is
            refundable. A race is also refundable if a valid start or end price cannot be recorded within its grace
            window. Claiming or refunding closes the position and returns its small account deposit.
          </p>
        </Section>

        <Section id="arena" title="5. Price Arena · closest prediction wins">
          <p>
            Price Arena is a forecasting contest for one approved asset. Instead of choosing a direction, every player
            enters the price they expect at the end. Durations are <strong>1, 5, 15 and 60 minutes</strong>.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Any wallet creates an Arena. Creation opens a 10-minute lobby; the round begins when the lobby ends.</li>
            <li>
              Between 2 and 10 wallets may enter. During the lobby a player may change the prediction or add stake, but
              cannot reduce the stake or withdraw.
            </li>
            <li>
              The interface hides predictions during the lobby. This is display privacy, <strong>not cryptographic
              secrecy</strong>: Solana account data is public.
            </li>
            <li>The final price is the asset&apos;s price just before the deadline.</li>
          </ol>
        </Section>

        <Section id="arena-payouts" title="6. Arena ranking and payout mathematics">
          <p>
            Every entry is ranked by absolute error. The winning count is <strong>floor(player count ÷ 2)</strong>: 2
            players produce 1 winner, 3 produce 1, 4 produce 2, and so on.
          </p>
          <Formula>error = |predicted price − final price|</Formula>
          <p>
            On equal error, the player whose current prediction was made earlier ranks higher. Adding stake without
            changing the prediction keeps that priority; changing the prediction moves the player behind everyone who
            predicted before.
          </p>
          <Formula>score = stake × [1 + 2 × (cutoff error − player error) ÷ cutoff error]</Formula>
          <Formula>payout = stake + (player score ÷ total winner scores) × losing pool × 98%</Formula>
          <p>
            The least accurate winner receives a 1× multiplier, an exact hit 3×. The 2% fee applies only to the losing
            pool, half to the Arena creator and half to Prophet. Fewer than two players, a deadline price older than 60
            seconds, or no resolution within one hour after the deadline cancels the Arena with full refunds.
          </p>
        </Section>

        <Section id="prices" title="7. Prices, settlement and automation">
          <p>
            Prophet&apos;s price service reads every reviewed pool at the last block strictly before a game boundary and
            signs one message covering all needed assets together with that block and its direct child. The programs
            accept it only if it carries the game&apos;s oracle signature, is bound to that program, proves the boundary
            falls between the two blocks, and includes every required asset at the expected precision.
          </p>
          <p>
            This separates <strong>when the outcome is measured</strong> from <strong>when the transaction lands</strong>.
            A delayed submission can delay finalization but cannot choose a later price. Anyone may submit a valid
            signed price; Prophet runs the production automation and pays its fees.
          </p>
          <p>
            Prices shown while a game runs are for display only. One cached SOL/USD quote drives every stake form so the
            USD and SOL amounts you see match what the wallet sends.
          </p>
        </Section>

        <Section id="trust" title="8. Trust and administration">
          <p>
            An admin key approves assets and stake currencies, sets the oracle key for new games, can pause new games
            and bets, and withdraws protocol fees. It cannot change a running game&apos;s oracle key, assets, fee or rules,
            cannot cancel an Arena, and the fee is capped at 10% in program code. Pausing never blocks starting,
            resolving, claims or refunds. Programs are upgradeable by their upgrade authority. There is no external
            audit; thin pools near a boundary remain a manipulation risk that liquidity floors reduce but do not
            eliminate.
          </p>
        </Section>
      </article>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-3 text-xl font-bold">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-white/60">{children}</div>
    </section>
  )
}

function ModeCard({
  title,
  accent,
  link,
  children,
}: {
  title: string
  accent: string
  link: string
  children: ReactNode
}) {
  return (
    <Link
      to={link}
      className="rounded-2xl border border-white/10 bg-[#241b2f] p-4 transition-colors hover:border-[#8B7CF7]/40"
    >
      <span className={`font-display text-lg font-bold ${accent}`}>{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-white/45">{children}</span>
    </Link>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#8B7CF7]/20 bg-[#8B7CF7]/10 px-4 py-3 font-mono text-xs text-[#d7d0ff]">
      {children}
    </div>
  )
}
