import type { MouseEvent, ReactNode } from 'react'

// See the same helper/comment in WhitepaperPage.tsx -- HashRouter uses the
// URL hash for routing, so a plain href="#id" anchor breaks navigation
// instead of just scrolling. Scroll manually and prevent the default.
function scrollToSection(e: MouseEvent, id: string) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-[#C2245A]/80 uppercase mb-2">Legal</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-[#1B1340]/55 text-sm mt-3">
          Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
          Prophet runs Asset Races and Price Arena on Solana with real wallet transactions. Stakes, payouts and
          refunds use SOL or another stake currency the game was created with. See §9 for launch and legal-review
          status.
        </p>
      </div>

      <div className="rounded-none border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This is a template, not reviewed by a lawyer. It is not a substitute for real legal review - see the{' '}
        <a href="#launch-status" onClick={(e) => scrollToSection(e, 'launch-status')} className="underline">
          §9 note
        </a>{' '}
        below.
      </div>

      <Section title="1. Acceptance of these terms">
        <p>
          By accessing or using Prophet (the "Service"), you agree to these Terms of Service. If you don't agree,
          don't use the Service.
        </p>
      </Section>

      <Section title="2. What the Service is">
        <p>
          Prophet offers two parimutuel prediction games on Solana: Asset Races and Price Arena. Connecting a Solana
          wallet lets you interact with live onchain programs and money you can genuinely gain or lose. USD stake
          fields are a conversion convenience; the wallet sends the exact displayed SOL (or token) amount. Nothing
          here constitutes a regulated financial product, exchange, or brokerage, and using it doesn't make Prophet
          one. Tokenized stocks are issued by third parties; Prophet only reads their market prices.
        </p>
      </Section>

      <Section title="3. Eligibility and risk">
        <p>
          You must be able to form a binding contract to use the Service, and you're responsible for complying with
          any laws that apply to you wherever you access it from - including local rules about prediction markets,
          derivatives, or gambling, which vary widely and are your responsibility to check, not Prophet's. Losing
          positions can lose the full amount staked. Network fees and small refundable account deposits apply to
          Solana transactions.
        </p>
      </Section>

      <Section title="4. Accounts and wallets">
        <p>
          The Service has no accounts of its own - your wallet address is your identity, and Prophet never receives
          or stores your private key or seed phrase; every transaction is signed in your own wallet. Nicknames (if
          you set one) are stored onchain in a separate, public registry program - anyone can see it, and it's tied
          to your address, not verified as your real name.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>attempt to exploit, spam, or degrade the Service, its programs, or the underlying network infrastructure;</li>
          <li>use the Service to launder funds, evade sanctions, or facilitate any unlawful transaction;</li>
          <li>misrepresent the Service, or claim it's endorsed by any listed company, token issuer, Solana Labs or Robinhood;</li>
          <li>attempt to manipulate a price source or game outcome outside the mechanics the Service itself provides.</li>
        </ul>
      </Section>

      <Section title="6. No warranty">
        <p>
          The Service is provided "as is." Prices and game data can be wrong, delayed, or unavailable without notice.
          Prophet makes no warranty that the Service, or the network/RPC infrastructure it depends on, will be
          uninterrupted, error-free, or fit for any particular purpose.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Prophet and its contributors aren't liable for any loss arising
          from your use of the Service - including loss of funds, data, or availability, whether from a bug, an
          exploit, a network/RPC outage, or otherwise.
        </p>
      </Section>

      <Section title="8. Changes to these terms">
        <p>
          These terms can change as the Service does. Material changes will be reflected by updating the "last
          updated" date above. Continuing to use the Service after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="9. Launch status & legal review" id="launch-status">
        <p>
          Legal and regulatory treatment of prediction games varies by jurisdiction, and this document does not
          represent legal clearance in any jurisdiction. There is no external security audit. The programs are
          admin-centralized: one key approves assets and stake currencies, sets the price-signing key for new games
          and withdraws protocol fees, and the programs are upgradeable by their upgrade authority.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <div className="text-[#1B1340]/70 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}
