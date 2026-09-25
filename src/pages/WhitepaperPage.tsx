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
  { id: 'markets', label: '3. Prediction Markets' },
  { id: 'market-payouts', label: '4. Market payouts' },
  { id: 'races', label: '5. Asset Races' },
  { id: 'race-payouts', label: '6. Race settlement' },
  { id: 'arena', label: '7. Price Arena' },
  { id: 'arena-payouts', label: '8. Arena ranking' },
  { id: 'prices', label: '9. Prices & keepers' },
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
            Prophet: three onchain prediction games for tokenized assets
          </h1>
          <p className="mt-3 text-sm text-white/40">
            Version 2.0 · Robinhood Chain mainnet. This document describes the native-ETH product implemented for
            the next deployments. Earlier USDG test deployments are unsupported historical contracts and are not
            exposed by the product UI. Prophet has not received an external security audit and this
            document is not legal, financial or investment advice. See the{' '}
            <Link to="/terms" className="text-[#8B7CF7] hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </div>

        <Section id="overview" title="1. Overview">
          <p>
            Prophet offers three independent games built around prices on Robinhood Chain. <strong>Prediction
            Markets</strong> ask whether a tokenized stock will finish above or below a target. <strong>Asset
            Races</strong> compare the percentage performance of several assets over the same interval. <strong>Price
            Arena</strong> asks players to predict one asset&apos;s exact finishing price, then rewards the closest half
            of the field.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeCard title="Markets" accent="text-[#B3A7FA]" link="/onchain">
              Pick YES or NO on a target price. Earlier correct calls receive more payout weight.
            </ModeCard>
            <ModeCard title="Races" accent="text-[#F2A65A]" link="/onchain/races">
              Back one of 2–6 assets. The highest percentage return wins the race.
            </ModeCard>
            <ModeCard title="Arena" accent="text-emerald-300" link="/onchain/arenas">
              Enter an exact price prediction. The closest 50% share the losing half&apos;s stakes.
            </ModeCard>
          </div>
          <p>
            Each mode has its own Solidity contract, lifecycle and accounting. Funds and game state are not shared
            between the three modes. A failure or cancellation in one game cannot change another game&apos;s result.
          </p>
        </Section>

        <Section id="shared" title="2. Shared foundations">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Network:</strong> all real games run on Robinhood Chain mainnet.</li>
            <li><strong>Wager currency:</strong> stakes, pools, payouts and refunds use native ETH. The interface accepts USD or ETH input for the live $1–$50 range and freezes the exact wei value; there is no ERC-20 approval, WETH wrapping or swap.</li>
            <li>
              <strong>Reviewed assets:</strong> Markets use 10 approved tokenized stocks. Races and Arena support
              those 10 Stocks plus 13 Memes; Stocks and Memes remain separate categories.
            </li>
            <li>
              <strong>Non-custodial:</strong> Prophet never receives a wallet&apos;s private key. Entries,
              claims and refunds are signed by the player in MetaMask.
            </li>
            <li>
              <strong>Parimutuel economics:</strong> players compete against one another rather than a bookmaker.
              The available payout comes from stakes already locked in that game.
            </li>
            <li>
              <strong>Claims and refunds:</strong> after an onchain result or cancellation, eligible players claim
              their payout or refund from the relevant contract.
            </li>
          </ul>
        </Section>

        <Section id="markets" title="3. Prediction Markets · YES or NO">
          <p>
            A market asks: <em>Will this stock be at or above the target price at the deadline?</em> A YES position
            wins when the final price is greater than or equal to the target; otherwise NO wins. Touching the target
            at any earlier moment does not count—the only price that determines the outcome is the scheduled
            deadline price.
          </p>
          <p>The current market lifecycle is:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Any wallet creates a market for one of the 10 approved StockToken/USDG pools, chooses a positive target
              and selects a deadline. The interface offers 30 minutes, 1 hour, 24 hours and 7 days. Thirty minutes is
              the onchain minimum.
            </li>
            <li>
              Players enter the live equivalent of $1–$50 in USD or ETH and stake the displayed native ETH amount on YES or NO. A wallet may place one bet per side. It is
              possible to hold both a YES and a NO position, but neither position can be increased after its first bet.
            </li>
            <li>
              Settlement requires non-empty YES and NO pools and at least two distinct wallet addresses. One wallet
              funding both sides still counts as one participant, so the market cancels with full refunds.
            </li>
            <li>
              Betting closes after the first two-thirds of the market&apos;s lifetime. The final third accepts no new
              bets and exists only for the price outcome to develop.
            </li>
            <li>
              After the deadline, the keeper submits the historical pool observation for the last Robinhood block
              strictly before that deadline. Calling resolution later cannot substitute a newer price.
            </li>
            <li>Winning wallets claim; a cancelled market lets every participant reclaim their original stake.</li>
          </ol>
          <p>
            Creation is permissionless, but asset approval is not: a market can only use a pool identity reviewed and
            registered by the protocol. The target ranges shown during creation are interface guidance, not an onchain
            target-distance rule. The owner may seed a new market up to the deployment-configured native ETH cap.
          </p>
        </Section>

        <Section id="market-payouts" title="4. Market weighting, payouts and cancellation">
          <p>
            A winning bet earns its principal back plus a share of the losing pool. The share is based on
            <strong> weighted stake</strong>, which rewards taking risk earlier. Weight falls linearly from
            <strong> 2.00×</strong> when the market opens to <strong>0.50×</strong> immediately before betting closes.
            Weight changes only the distribution of profit; it never changes principal.
          </p>
          <Formula>
            payout = stake + (weighted stake ÷ total weighted winning stake) × losing pool × 98%
          </Formula>
          <p>
            The 2% protocol fee applies only to each winner&apos;s share of the losing pool. It is not charged on returned
            principal or refunds. Integer division can leave a small amount of rounding dust in the contract.
          </p>
          <p>
            If either YES or NO has no stake at the deadline, the market is cancelled: there is no genuine opposing
            pool, so all existing positions are refundable in full. A stale or unusable deadline observation also
            cancels the market rather than allowing an arbitrary current price to decide it.
          </p>
        </Section>

        <Section id="races" title="5. Asset Races · highest return wins">
          <p>
            A Race compares <strong>2–6 assets from one category</strong>. Stock races use StockToken/USDG prices;
            Meme races use MemeToken/ETH prices. Players back one asset, and the winner is the asset with the highest
            percentage return between the common start and end snapshots—not the asset with the highest dollar price.
          </p>
          <p>The live community-race policy is:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              The creator chooses Stocks or Memes, a title and an approved race duration of 1, 5 or 15 minutes. The
              creator may add initial assets or leave the list open.
            </li>
            <li>
              A 5-minute lobby opens. No betting occurs yet. Each wallet may add one approved asset of the chosen
              category, up to six candidates total. Fewer than two candidates at lobby close cancels the empty race.
            </li>
            <li>
              Betting then opens for 5 minutes. A wallet enters USD or ETH worth $1–$50, sees both equivalents,
              and may top up the same selection to the contract&apos;s cumulative wei cap. The selected asset cannot be
              changed for that race.
            </li>
            <li>
              At betting close, only assets with a non-zero pool become active. At least two active contenders are
              required; otherwise the race cancels and all stakes are refundable.
            </li>
            <li>
              The start snapshot P0 is fixed at the betting cutoff. After the selected race duration, the end
              snapshot P1 is fixed at the scheduled finish. The interface may show movement between them, but only
              the two onchain settlement snapshots decide the result.
            </li>
          </ol>
          <Formula>asset return = (P1 − P0) ÷ P0</Formula>
          <p>
            The highest return wins even when every contender fell in price—the least negative return is still the
            highest. Stocks and Memes never compete in the same race because they use different quote units.
          </p>
        </Section>

        <Section id="race-payouts" title="6. Race settlement, payouts and voids">
          <p>
            Every player who backed the winning asset receives principal plus a stake-proportional share of the
            losing assets&apos; combined pool. Race bets are not time-weighted.
          </p>
          <Formula>payout = stake + (stake ÷ winning pool) × losing pool × 98%</Formula>
          <p>
            The 2% fee comes only from the losing pool. If two or more active assets finish with exactly the same top
            return, the race is void and every stake is refundable in full—no arbitrary tiebreaker selects an asset.
            A race also becomes refundable if a valid start or end snapshot cannot be fixed within its onchain grace
            window.
          </p>
          <p>
            Prophet can label platform-created races as Featured, while wallet-created races are Community races.
            Both settle with the same return calculation and payout rules.
          </p>
        </Section>

        <Section id="arena" title="7. Price Arena · closest prediction wins">
          <p>
            Price Arena is a fixed-field forecasting contest for one approved Stock or Meme. Instead of choosing a
            direction, every player enters the exact price they expect at the end of the game. Available game
            durations are <strong>1, 5, 15 and 60 minutes</strong>.
          </p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Any wallet creates an Arena. Creation opens a fixed 10-minute lobby; the selected game duration begins
              only after that lobby ends.
            </li>
            <li>
              Between 2 and 20 wallets may enter. The interface accepts a USD or ETH initial stake worth $1–$50 and sends the exact
              displayed native ETH amount. During the lobby a player may change the predicted price and add more
              native ETH up to the contract&apos;s cumulative wei cap, but cannot reduce the stake or withdraw.
            </li>
            <li>
              The regular interface and contract getter hide predicted prices during the lobby while showing stakes.
              This is display privacy, <strong>not cryptographic secrecy</strong>: calldata and blockchain storage are
              public and can be inspected by advanced users.
            </li>
            <li>
              Entry and edits close automatically when the lobby ends; no separate start transaction is required.
              Predictions then become visible and the game runs for the chosen duration.
            </li>
            <li>
              The final price comes from the last Robinhood block strictly before the Arena deadline. The keeper&apos;s
              transaction time cannot move that boundary.
            </li>
          </ol>
          <p>
            Stock Arenas predict a StockToken/USDG price in USDG. Meme Arenas predict a MemeToken/ETH price in ETH.
            Those are price quote units only; native ETH is the stake and payout currency in both categories.
          </p>
        </Section>

        <Section id="arena-payouts" title="8. Arena ranking and payout mathematics">
          <p>
            Every entry is ranked by absolute error. The winning count is <strong>floor(player count ÷ 2)</strong>, so
            the closest half wins: 2 players produce 1 winner, 3 produce 1 winner, 4 produce 2 winners, and so on.
          </p>
          <Formula>error = |predicted price − final price|</Formula>
          <p>
            Equal error is broken first by the earlier most recent prediction update, then deterministically by wallet
            address. Adding stake without changing the prediction preserves the original tiebreak priority; changing
            the prediction resets it to the edit time.
          </p>
          <p>
            Winners recover their principal and divide the losing half&apos;s pool according to both stake and accuracy.
            The least accurate winner at the cutoff receives a 1× accuracy multiplier; more accurate winners scale up
            toward 3×.
          </p>
          <Formula>
            score = stake × [1 + 2 × (cutoff error − player error) ÷ cutoff error]
          </Formula>
          <Formula>payout = stake + (player score ÷ total winner scores) × losing pool × 98%</Formula>
          <p>
            If the cutoff error is zero, exact-price winners use a 1× multiplier and stake alone determines their
            shares. The 2% fee applies only to the losing pool; integer rounding dust also remains protocol funds.
            Fewer than two players or a stale deadline price cancels the Arena and enables full refunds.
          </p>
        </Section>

        <Section id="prices" title="9. Live prices, deadline settlement and keepers">
          <p>
            Prices visible in the interface come from the reviewed Robinhood Chain liquidity pools. A shared live
            service polls those pools every two seconds and distributes one synchronized snapshot to the ticker,
            cards and game screens. These values are for display and do not themselves settle a game.
          </p>
          <p>
            The same service caches one public ETH/USD quote for every stake form, refreshing it no faster than every
            15 seconds. Players may enter USD or ETH; reciprocal conversion and range checks use fixed-point integer
            arithmetic, and the exact wei value and quote are frozen when the wallet request is built. Missing or stale
            quotes block betting. Onchain min/max values are broad fixed ETH safety fuses, not dollar enforcement.
          </p>
          <p>
            Markets, Races and Arena use the shared <code className="text-[#8B7CF7]">SignedPoolRaceOracle</code> for
            settlement. A keeper watches scheduled boundaries and submits signed proofs containing two adjacent
            Robinhood blocks. The oracle verifies signatures, parent linkage and timestamps, then selects the last
            block strictly before the required boundary. The resulting price, timestamp and observation identifier
            are stored onchain.
          </p>
          <p>
            This design separates <strong>when the outcome is measured</strong> from <strong>when the resolve
            transaction is mined</strong>. A delayed keeper can delay finalization, but it cannot choose a later price.
            Keeper actions are permissionless at the contract level where applicable, while Prophet operates the
            production automation and pays its gas.
          </p>
          <p>
            The three game contracts are non-upgradeable deployments with separate balances and accounting. The owner
            controls approved asset identities, protocol configuration and accumulated fee withdrawal; new activity
            can be paused where supported without blocking already-available claims and refunds.
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
