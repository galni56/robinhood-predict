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
  { id: 'shared', label: '2. Foundations' },
  { id: 'notation', label: '3. Notation' },
  { id: 'duels', label: '4. Coin Duels' },
  { id: 'duel-math', label: '5. Duel settlement' },
  { id: 'arena', label: '6. Price Shot' },
  { id: 'arena-math', label: '7. Arena ranking' },
  { id: 'prices', label: '8. Prices & settlement' },
  { id: 'trust', label: '9. Custody & trust' },
] as const

export function WhitepaperPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-1 text-sm">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[#1B1340]/55">Contents</p>
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => scrollToSection(event, section.id)}
              className="block py-1 text-[#1B1340]/60 transition-colors hover:text-[#1B1340]"
            >
              {section.label}
            </a>
          ))}
        </div>
      </aside>

      <article className="min-w-0 space-y-12">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#C2245A]/80">Whitepaper</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            HasteFun: coin duels and price arenas on Solana
          </h1>
          <p className="mt-3 text-sm text-[#1B1340]/55">
            Draft · Solana. HasteFun has not received an external security audit. This document is not legal,
            financial or investment advice. See the{' '}
            <Link to="/terms" className="text-[#C2245A] hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>

        <Section id="overview" title="1. Overview">
          <p>
            HasteFun runs two parimutuel games on Solana around the prices of meme coins and crypto assets.
            <strong> Coin Duels</strong> race 2–6 coins against each other: every racer brings one coin and the same
            stake, and the coin with the largest percentage gain takes the pot. <strong>Price Arena</strong> asks up to
            ten players to call one coin&apos;s final price (or market cap); the closest half split the rest.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard title="Duels" accent="text-[#B8860B]" link="/onchain/races">
              Bring a coin, match the stake, press READY. Biggest % gain wins. Spectators back a racer.
            </ModeCard>
            <ModeCard title="Arena" accent="text-[#1F7FD1]" link="/onchain/shots">
              Call the final price. The closest half share the losing half&apos;s stakes, weighted by accuracy.
            </ModeCard>
          </div>
          <p>
            Nobody plays against the house. Every payout comes from stakes already paid into that game; HasteFun&apos;s
            only income is a 2% fee taken from winnings (Duels) or from the losing pool (Arena).
          </p>
        </Section>

        <Section id="shared" title="2. Foundations">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Network and currency:</strong> Solana mainnet; stakes and payouts in SOL. Forms accept USD or SOL and show both before signing, from one cached SOL/USD quote.</li>
            <li>
              <strong>A stake is one transfer:</strong> SOL sent to the game wallet with a memo naming the game, e.g.
              <code> prophet:arena:12:&lt;prediction&gt;</code>. The game server applies it; anything it cannot apply (late, over a limit, no memo) is refunded minus the network fee.
            </li>
            <li>
              <strong>Accounts:</strong> a HasteFun account is a Solana key generated in the browser and encrypted with the player&apos;s password (PBKDF2-SHA256, 600,000 iterations, AES-256-GCM). The key never leaves the device. External wallets (Phantom, Solflare) work the same way.
            </li>
            <li>
              <strong>Assets:</strong> reviewed crypto and meme pools, plus PumpSwap coins selected automatically: a real pump.fun coin paired with SOL or USDC, at least $10,000 of liquidity, a pool older than one hour; the list keeps up to 40 coins (the most liquid make room), drops a coin whose liquidity falls under $10,000 or that has not been seen for 7 days, minus a hand-kept blocklist of honeypots and wash-traded coins.
            </li>
            <li><strong>Prices in USD</strong> come straight from each coin&apos;s pool reserves; SOL-paired pools are converted through SOL/USDC at the same block.</li>
          </ul>
        </Section>

        <Section id="notation" title="3. Notation">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <tbody className="[&_td]:border-b [&_td]:border-[#1B1340]/10 [&_td]:py-1.5 [&_td]:pr-4">
                <tr><td>P₀, P₁</td><td className="font-sans">pool price at the last block before the start / end boundary</td></tr>
                <tr><td>rᵢ</td><td className="font-sans">return of coin i: (P₁ − P₀) ÷ P₀, computed with 18 decimal places</td></tr>
                <tr><td>s</td><td className="font-sans">duel stake, equal for every racer</td></tr>
                <tr><td>n</td><td className="font-sans">racers (duel) or players (arena)</td></tr>
                <tr><td>B_w, B_l</td><td className="font-sans">spectator stakes on the winning racer / on all losing racers</td></tr>
                <tr><td>f</td><td className="font-sans">HasteFun fee, 2% (200 basis points)</td></tr>
                <tr><td>eⱼ</td><td className="font-sans">arena error of player j: |prediction − final price|</td></tr>
                <tr><td>k</td><td className="font-sans">arena winners: ⌊n ÷ 2⌋</td></tr>
              </tbody>
            </table>
          </div>
          <p>All amounts are integers in lamports (10⁻⁹ SOL); every division rounds down, and rounding dust stays with the game wallet.</p>
        </Section>

        <Section id="duels" title="4. Coin Duels · biggest gain wins">
          <ol className="list-decimal space-y-2 pl-5">
            <li>The first racer picks a category (memes or crypto), the stake ($1–$50), the race length and whether the board shows price or market cap. Each later racer brings a different coin.</li>
            <li>A racer has 2 minutes to pay the stake. Before anyone presses READY, a paid racer may leave with the full stake.</li>
            <li>The first READY starts a 60-second window for the others (+15 seconds once for &ldquo;preparing&rdquo;). A paid racer who misses it is removed with a tax (section 5).</li>
            <li>When every paid racer (at least two) is ready, the race starts at the next boundary; P₀ and P₁ are taken at the start and end boundaries.</li>
            <li>Spectators may back one racer each, up to $100 per wallet; racers cannot back.</li>
          </ol>
          <Formula>winner = argmaxᵢ rᵢ   (a tie at the top voids the duel)</Formula>
          <p>The coin with the largest return wins even if every coin fell. Price, not market cap, decides: a pump.fun coin&apos;s supply is fixed, so both give the same order.</p>
        </Section>

        <Section id="duel-math" title="5. Duel settlement">
          <p>The winning racer takes every racer stake and a share of what spectators put on the losers:</p>
          <Formula>racer cut = B_l × 30%   (all of B_l if nobody backed the winner)</Formula>
          <Formula>racer gain G = (n − 1) × s + racer cut</Formula>
          <Formula>winning racer payout = s + G × (1 − f)</Formula>
          <p>Spectators who backed the winner share the rest of the losing spectator money in proportion to their stake b:</p>
          <Formula>spectator gain g = (B_l − racer cut) × b ÷ B_w</Formula>
          <Formula>spectator payout = b + g × (1 − f)</Formula>
          <p>The fee is taken only from gains, never from a returned stake. Losing racers and their spectators receive nothing.</p>
          <p><strong>Missed ready check.</strong> A removed racer gets the stake back minus a tax; his spectators get everything back:</p>
          <Formula>tax = s × 10%   (20% if spectators backed him; doubled after 10 removals in 7 days)</Formula>
          <Formula>each remaining racer += tax × 50% ÷ racers still in;   HasteFun keeps the other 50%</Formula>
          <p><strong>Void.</strong> A top tie, or no valid start price within 5 minutes (end price within 10 minutes), refunds every racer and spectator in full.</p>
        </Section>

        <Section id="arena" title="6. Price Shot · closest call wins">
          <ol className="list-decimal space-y-2 pl-5">
            <li><strong>Room.</strong> Any player opens a room for one coin and a match length of 1, 5, 15 or 60 minutes; up to 10 players join it for free.</li>
            <li><strong>Ready.</strong> Players press Ready. Once more than half of the room, and at least two, are ready, the ready players go on; the rest sit this match out.</li>
            <li><strong>Aim (30 seconds).</strong> Each player sets the price they expect at the end with a crosshair on the chart, picks a stake and presses Lock Shot. The stake is taken from the player&apos;s game balance at once. Fewer than two locked shots cancel the match and every stake returns to its balance.</li>
            <li><strong>Live.</strong> Shots are fixed and become visible to everyone; each player sees the current price, every shot and a provisional place until the final bell.</li>
            <li><strong>Result.</strong> The final price is the signed pool price at the deadline. Winnings land on the game balance automatically; no claim is needed.</li>
          </ol>
          <p>
            Shots travel in signed messages to the game server, not in public transactions, so they stay secret until the match starts.
            Meme rooms can be called in market cap; the site converts it to price (cap ÷ supply), so the result is the same.
            The game balance is topped up with a transfer to the game wallet and can be withdrawn to the player&apos;s account at any time.
          </p>
        </Section>

        <Section id="arena-math" title="7. Arena ranking and payouts">
          <Formula>eⱼ = |predictionⱼ − P₁|,   ranked ascending;   k = ⌊n ÷ 2⌋ winners</Formula>
          <p>On equal error, the earlier shot ranks higher. The k-th winner&apos;s error is the cutoff e꜀.</p>
          <Formula>multiplier mⱼ = 1 + 2 × (e꜀ − eⱼ) ÷ e꜀   ∈ [1, 3]</Formula>
          <Formula>score σⱼ = stakeⱼ × mⱼ</Formula>
          <Formula>L = Σ losing stakes;   payoutⱼ = stakeⱼ + (σⱼ ÷ Σσ) × L × (1 − f)</Formula>
          <p>
            An exact hit earns 3× the weight of the least accurate winner. The fee comes only out of the losing pool and
            is split equally between the arena&apos;s creator and HasteFun. Fewer than two players, a final price older than
            60 seconds, or no result within an hour after the deadline cancels the arena with full refunds.
          </p>
        </Section>

        <Section id="prices" title="8. Prices and settlement">
          <p>
            HasteFun&apos;s price service follows every pool block by block and, for a boundary time T, signs one Ed25519
            message (domain <code>PRPHPOOL</code>) holding each pool&apos;s price at the last block strictly before T, that
            block and its direct child. The game server accepts it only if it is signed by the pinned oracle key, is
            bound to this game wallet and to T, and covers exactly the coins of the game.
          </p>
          <p>
            Measuring at a fixed block separates <strong>when the result is measured</strong> from <strong>when it is
            processed</strong>: a slow server can delay a result but cannot pick a later price. A game settles only after
            every deposit up to the boundary is final, so a stake that arrived in time is never missed.
          </p>
          <p>
            Payouts go through an outbox: each transfer is signed and stored before it is sent, re-sent if it is lost,
            and marked paid only once finalized, so a crash or a lagging node cannot pay twice. Live prices on screen
            are for display; only the signed boundary prices decide a game.
          </p>
        </Section>

        <Section id="trust" title="9. Custody and trust">
          <p>
            Stakes sit in one game wallet run by HasteFun&apos;s game server until a game ends, so players trust the
            operator to run the published rules. The wallet&apos;s balance and what it owes are public at
            <code> /health</code>; the server refuses to start on an unknown wallet history, and only fees it has
            recorded as earned can be moved to the owner&apos;s cold wallet. Actions such as creating a game are signed
            messages bound to HasteFun&apos;s domain with a one-time nonce, so they cannot be replayed elsewhere.
          </p>
          <p>
            There is no external audit. Thin pools near a boundary remain a manipulation risk that liquidity floors and
            the blocklist reduce but do not eliminate. Play only with amounts you can afford to lose.
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
      <div className="space-y-3 text-sm leading-relaxed text-[#1B1340]/70">{children}</div>
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
      className="rounded-none border border-[#1B1340]/15 bg-[#FFF6DF] p-4 transition-colors hover:border-[#ff4f8b]/40"
    >
      <span className={`font-display text-lg font-bold ${accent}`}>{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-[#1B1340]/55">{children}</span>
    </Link>
  )
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-none border border-[#ff4f8b]/20 bg-[#ff4f8b]/10 px-4 py-3 font-mono text-xs text-[#1B1340]">
      {children}
    </div>
  )
}
