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
  { id: 'abstract', label: '1. Abstract' },
  { id: 'why', label: '2. Why HasteFun' },
  { id: 'product', label: '3. The product' },
  { id: 'haste', label: '4. Haste: coin races' },
  { id: 'haste-math', label: '5. Race payouts' },
  { id: 'shot', label: '6. Shot: price calls' },
  { id: 'shot-math', label: '7. Shot ranking' },
  { id: 'launchpad', label: '8. Launchpad' },
  { id: 'coins', label: '9. The coin universe' },
  { id: 'accounts', label: '10. Accounts and money' },
  { id: 'prices', label: '11. Prices and settlement' },
  { id: 'fairness', label: '12. Fair play' },
  { id: 'economics', label: '13. Business model' },
  { id: 'community', label: '14. Social layer' },
  { id: 'next', label: '15. What comes next' },
] as const

export function WhitepaperPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 lg:grid-cols-[210px_1fr]">
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
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#C2245A]/80">Whitepaper · v1.0 · October 2026</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            HasteFun: fast prediction games on Solana coins
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#1B1340]/75">
            Minute-long races between coins, price calls with friends, and a launchpad whose coins can play the moment
            they are born. Paid in SOL, settled on signed on-chain prices, paid out automatically.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <Stat big="1 min" label="shortest round" />
            <Stat big="2%" label="fee, only from winnings" />
            <Stat big="0" label="house edge: players vs players" />
            <Stat big="~1 min" label="from launch to first game" />
          </div>
        </div>

        <Section id="abstract" title="1. Abstract">
          <p>
            HasteFun turns the most watched thing in crypto, a coin&apos;s price in the next few minutes, into a game you
            play against other people, not against a house. In <strong>Haste</strong>, two to six players each bring a
            coin and the same stake; the coin that gains the most in the round takes the pot. In <strong>Shot</strong>, up
            to ten players call where one coin&apos;s price will land; the closest half split the rest, and the sharper
            the call, the bigger the share. The <strong>Launchpad</strong> creates a pump.fun coin in one signature, and
            that coin can be raced and called on HasteFun right away.
          </p>
          <p>
            Every game runs on Solana in SOL. Stakes are plain transfers, results are measured on prices read straight
            from each coin&apos;s pool and signed at an exact block, and winnings arrive by themselves, with no claim
            button. HasteFun earns a 2% fee taken only from winnings.
          </p>
        </Section>

        <Section id="why" title="2. Why HasteFun">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>People already watch coins like a sport.</strong> Meme coins and majors move by whole percents in
              minutes, and millions follow those moves live. HasteFun gives that attention a clear round, a scoreboard
              and a winner.
            </li>
            <li>
              <strong>Short, social rounds.</strong> A race lasts one to thirty minutes. Friends join a lobby by link,
              spectators back a racer and cheer, and everyone sees the same live board.
            </li>
            <li>
              <strong>Skill and conviction, not leverage.</strong> There is no liquidation, no funding rate and no
              order book to learn. You pick a coin, or call a price, and stake a fixed amount.
            </li>
            <li>
              <strong>A home for new coins.</strong> A fresh launch usually has nothing to do but trade. On HasteFun it
              becomes a racer the day it is born, which gives creators a reason to launch here and players a stream of
              new match-ups.
            </li>
          </ul>
        </Section>

        <Section id="product" title="3. The product at a glance">
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard title="Haste" accent="text-[#B8560B]" link="/onchain/races">
              Coin duels. 2–6 racers, one coin each, the same $1–$50 stake. Biggest percentage gain wins the pot.
            </ModeCard>
            <ModeCard title="Shot" accent="text-[#1F5FD1]" link="/onchain/shots">
              Price calls. Up to 10 players aim at the final price. The closest half win, weighted by accuracy and stake.
            </ModeCard>
            <ModeCard title="Launchpad" accent="text-[#C2245A]" link="/onchain/launch">
              Launch a pump.fun coin in one signature. It plays on HasteFun at once, in its own group.
            </ModeCard>
            <ModeCard title="PumpSwap list" accent="text-[#2F8F46]" link="/onchain/pumpswap">
              Up to 40 live PumpSwap coins picked automatically, refreshed every 15 minutes.
            </ModeCard>
          </div>
        </Section>

        <Section id="haste" title="4. Haste: coin races">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Open a lobby.</strong> The first racer picks a coin group, the stake ($1–$50), the round length
              and whether the board shows price or market cap. Groups never mix: <em>Crypto</em> (BTC, SOL, ETH and
              other majors), <em>Memes</em> (reviewed meme coins), <em>PumpSwap</em> (fresh coins from the automatic
              list) and <em>Made on HasteFun</em> (coins from our launchpad).
            </li>
            <li>
              <strong>Bring a coin.</strong> Every racer brings a different coin of that group and pays the same stake
              within 2 minutes. Until someone presses READY, a racer can leave with the full stake back.
            </li>
            <li>
              <strong>READY.</strong> The first READY gives the others 60 seconds (plus 15 once, if they are preparing).
              A paid racer who misses it is removed with a small tax (section 5).
            </li>
            <li>
              <strong>Race.</strong> When every paid racer is ready, the race starts at the next boundary. Memes race
              for 1, 3, 5 or 15 minutes; crypto for 1, 5, 15 or 30 minutes.
            </li>
            <li>
              <strong>Win.</strong> The coin with the largest percentage change wins, even if every coin fell. The
              payout lands in the winner&apos;s account automatically.
            </li>
          </ol>
          <p>
            Spectators can back one racer each, up to $100, and cheer for free; every cheer shows up for everyone
            watching. A backer never loses money because of the racer: if the racer leaves or is removed, the backing
            returns in full.
          </p>
          <Formula>rᵢ = (P₁ − P₀) ÷ P₀;   winner = argmaxᵢ rᵢ   (a tie at the top refunds everyone)</Formula>
        </Section>

        <Section id="haste-math" title="5. Race payouts">
          <p>With n racers, stake s, B_w backed on the winner, B_l on the losers and fee f = 2%:</p>
          <Formula>racer cut = B_l × 30%   (all of B_l if nobody backed the winner)</Formula>
          <Formula>winning racer payout = s + ((n − 1) × s + racer cut) × (1 − f)</Formula>
          <Formula>backer payout = b + (B_l − racer cut) × b ÷ B_w × (1 − f)</Formula>
          <p>
            The winner takes every racer stake plus 30% of the money backed on losing racers; the winner&apos;s backers
            share the other 70% in proportion to what they put in. The fee comes only out of gains, never out of a
            returned stake.
          </p>
          <p>
            <strong>Ready check.</strong> A racer removed for missing READY gets the stake back minus 10% (20% if
            others backed them, doubled for players removed more than 10 times in 7 days). Half of the tax goes to the
            racers who stayed, half to HasteFun. It keeps lobbies moving and protects those who showed up.
          </p>
          <p>
            <strong>Refunds.</strong> A tie at the top, or a start or end price that cannot be confirmed in time,
            returns every stake and every backing in full.
          </p>
        </Section>

        <Section id="shot" title="6. Shot: price calls">
          <ol className="list-decimal space-y-2 pl-5">
            <li><strong>Room.</strong> Anyone opens a room for one coin and a match of 1, 5, 15 or 60 minutes. Up to 10 players join for free; an invite link brings friends straight in.</li>
            <li><strong>Ready.</strong> Once more than half of the room, and at least two players, are ready, the others get 15 seconds to press Ready too; then the match begins for everyone who is ready. If the whole room is ready, it begins at once.</li>
            <li><strong>Aim, 30 seconds.</strong> Each player sets a crosshair on the chart where they expect the price to end, picks a stake from 0.005 to 1 SOL and locks the shot: the price goes to the server as a signed message, the stake as one transfer, like a race stake. A shot locked before the 30 seconds end counts: its stake then has 15 more seconds to confirm, and the match starts after that.</li>
            <li><strong>Live.</strong> All shots are revealed at once. Everyone watches the price, every shot and a provisional ranking until the final bell.</li>
            <li><strong>Result.</strong> The final price is the signed pool price at the deadline; winnings are paid to the winners&apos; wallets automatically.</li>
          </ol>
          <p>
            Shots travel as signed messages to the game server, not as public transactions, so nobody can copy a call
            before the match starts. Meme rooms can be played in market cap, which the site converts to price exactly.
          </p>
        </Section>

        <Section id="shot-math" title="7. Shot ranking and payouts">
          <Formula>eⱼ = |callⱼ − P₁|,   ranked ascending;   k = ⌊n ÷ 2⌋ winners;   e꜀ = error of the k-th winner</Formula>
          <Formula>accuracy mⱼ = 1 + 2 × (e꜀ − eⱼ) ÷ e꜀   ∈ [1, 3]</Formula>
          <Formula>payoutⱼ = stakeⱼ + (stakeⱼ × mⱼ ÷ Σ stake × m) × L × (1 − f),   L = Σ losing stakes</Formula>
          <p>
            A perfect call weighs three times the least accurate winner, so precision pays as much as size. On equal
            error the earlier shot ranks higher. The 2% fee comes only out of the losing stakes and is split equally
            between HasteFun and the player who opened the room, which rewards people who bring others to play.
          </p>
        </Section>

        <Section id="launchpad" title="8. Launchpad and Made on HasteFun">
          <p>
            The launchpad creates a coin on pump.fun from a picture, a name and a ticker, in one signature from the
            creator&apos;s wallet. HasteFun charges nothing for it; the creator pays only Solana and pump.fun&apos;s own
            costs (about 0.02 SOL) and becomes the coin&apos;s creator, earning pump.fun&apos;s creator fees.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Plays at once.</strong> About a minute after the launch the coin is in Haste and Shot, priced live from its pump.fun bonding curve.</li>
            <li><strong>Its own group.</strong> Launchpad coins race only against each other, under the MADE ON HASTEFUN badge, so a fresh coin is never matched against BTC.</li>
            <li><strong>Graduation.</strong> When the curve fills and pump.fun moves the coin to a PumpSwap pool, HasteFun follows it and prices it from the pool from then on.</li>
            <li><strong>Your coins.</strong> Every launch appears under &ldquo;Your coins&rdquo; with its live status, plus copy-link and post-on-X buttons to get the first buyers in.</li>
          </ul>
          <p>
            This is the growth loop: creators launch here because their coin gets games on day one, and every new coin
            is a new match-up for players.
          </p>
        </Section>

        <Section id="coins" title="9. The coin universe">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Crypto, 11 coins:</strong> BTC, SOL, ETH, HYPE, ZEC, PUMP, NEAR, DOGE, BNB, SUI and XRP, each priced from a deep Solana pool.</li>
            <li><strong>Memes, 10 coins:</strong> established meme coins with reviewed pools.</li>
            <li>
              <strong>PumpSwap, up to 40 coins:</strong> chosen every 15 minutes from the most traded PumpSwap pools:
              a genuine pump.fun coin paired with SOL or USDC, at least $10,000 of liquidity and a pool older than one
              hour. The list builds up over time: a coin stays until its liquidity drops below the floor or it goes
              7 days unseen, and a blocklist keeps out honeypots and wash-traded coins.
            </li>
            <li><strong>Made on HasteFun:</strong> every coin launched from the launchpad (section 8).</li>
          </ul>
        </Section>

        <Section id="accounts" title="10. Accounts and money flow">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>A HasteFun account in seconds.</strong> Sign-up creates a Solana wallet in the browser, locked with
              the player&apos;s password (PBKDF2-SHA256 with 600,000 iterations, AES-256-GCM). The key never leaves the
              device, and the player can back it up at any time. Phantom and Solflare work too.
            </li>
            <li>
              <strong>A stake is one transfer.</strong> Joining a race sends the stake in SOL to the game wallet with a
              short memo naming the game. Forms show both USD and SOL before signing, and check the balance first.
            </li>
            <li>
              <strong>Automatic payouts.</strong> Winnings, refunds and returned backings are sent by the game server as
              soon as the result is final. Each payout is recorded before it is sent and confirmed on chain, so it
              arrives exactly once.
            </li>
          </ul>
        </Section>

        <Section id="prices" title="11. Prices and settlement">
          <p>
            HasteFun&apos;s price service follows every coin&apos;s pool block by block: Raydium, Orca, Meteora,
            PumpSwap and pump.fun curves. For the start and end of each game it signs one Ed25519 message holding every
            coin&apos;s USD price at the last block before that moment. Coins paired with SOL are converted through
            SOL/USDC at the same block.
          </p>
          <p>
            The game server accepts only messages signed by the pinned price key, bound to its own wallet and to the
            exact boundary time. Results are measured at a fixed block rather than at the moment they are processed, so
            a busy network can delay a result but can never change it. A game settles only after every stake up to the
            boundary is final.
          </p>
        </Section>

        <Section id="fairness" title="12. Fair play by design">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>No house.</strong> Every payout comes from stakes in that game. HasteFun never takes the other side of a bet, so it has no reason to want anyone to lose.</li>
            <li><strong>Same price for everyone.</strong> One signed price per coin per boundary decides the game; the live board on screen is the same for all players.</li>
            <li><strong>Hidden calls.</strong> Shot predictions stay secret until all are locked.</li>
            <li><strong>Signed actions.</strong> Creating a game or pressing READY is a message signed for the HasteFun domain with a one-time code, so it cannot be replayed on another site.</li>
            <li><strong>Open books.</strong> The game wallet&apos;s balance, everything it owes and every payout are visible; the server checks that it always holds more than it owes.</li>
            <li><strong>Clear rules on screen.</strong> Leaving, the ready check and refunds are explained in the lobby before anyone pays, and backers are always made whole if their racer leaves.</li>
          </ul>
        </Section>

        <Section id="economics" title="13. Business model">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>2% of winnings</strong> in races, and 2% of the losing stakes in Shot (half of it goes to the player who opened the room).</li>
            <li><strong>Half of the ready-check tax</strong>; the other half rewards racers who stayed.</li>
            <li><strong>Nothing on launches.</strong> The launchpad is free and feeds new coins, and new players, into the games.</li>
          </ul>
          <p>
            Revenue scales with the volume played, not with any one result. Fees collect in the game wallet and move to
            the owner&apos;s cold wallet only as earned fees the server has recorded.
          </p>
        </Section>

        <Section id="community" title="14. The social layer">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Lobbies by link.</strong> One tap on Invite copies a link that drops a friend into the lobby or room.</li>
            <li><strong>Spectators and backers.</strong> Anyone can watch a duel, back a racer and see their bet on the board.</li>
            <li><strong>Cheers.</strong> A free 👍 sends pixel confetti across everyone&apos;s screen.</li>
            <li><strong>Nicknames, portfolio and leaderboard.</strong> Every player has a public record of games, wins and earnings.</li>
            <li><strong>Pixel-arcade style.</strong> Every coin is a little racer, so even a chart reads like a game.</li>
          </ul>
        </Section>

        <Section id="next" title="15. What comes next">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Bigger stakes.</strong> High-stakes lobbies above today&apos;s $50 race stake and 1 SOL Shot stake, for players who want more on the line.</li>
            <li><strong>Launch races.</strong> Several coins launched in one lobby; the first to graduate to PumpSwap wins.</li>
            <li><strong>Graduation calls.</strong> &ldquo;Will it graduate in 24 hours?&rdquo; games on fresh launches.</li>
            <li><strong>The HasteFun token</strong> on pump.fun, with buyback and burn through pump.fun and PumpSwap.</li>
          </ul>
          <p>
            The exact rules of every game are in{' '}
            <Link to="/terms" className="text-[#C2245A] hover:underline">Rules and Terms</Link>.
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
      <div className="space-y-3 text-sm leading-relaxed text-[#1B1340]/75">{children}</div>
    </section>
  )
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div className="border-2 border-[#1B1340] bg-[#FFF6DF] px-4 py-3 shadow-[0_3px_0_#1B1340]">
      <div className="font-display text-2xl font-bold">{big}</div>
      <div className="mt-1 text-xs font-semibold text-[#1B1340]/65">{label}</div>
    </div>
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
      <span className="mt-1 block text-xs leading-relaxed text-[#1B1340]/60">{children}</span>
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
