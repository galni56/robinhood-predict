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
        <p className="text-xs font-bold tracking-[0.2em] text-[#C6FF3D]/80 uppercase mb-2">Legal</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-white/40 text-sm mt-3">
          Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
          Prophet's real mode is a live mainnet product — real wallet, real USDG, real money. See §9 before
          assuming legal/regulatory review is complete; it isn't.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This is a template, not reviewed by a lawyer. It is not a substitute for real legal review, which is a
        deliberately open item even though the product itself is already live with real funds — see the{' '}
        <a href="#launch-status" onClick={(e) => scrollToSection(e, 'launch-status')} className="underline">
          §9 note
        </a>{' '}
        below.
      </div>

      <Section title="1. Acceptance of these terms">
        <p>
          By accessing or using Prophet (the "Service"), you agree to these Terms of Service. If you don't agree,
          don't use the Service. These terms apply to real mode (the homepage and every <code className="text-[#C6FF3D]">/onchain/*</code> page,
          where transactions are real) and to the mock demo (<code className="text-[#C6FF3D]">/demo</code> and everything under it, which is
          simulated and involves no real funds) alike — §2 explains the difference.
        </p>
      </Section>

      <Section title="2. What the Service is">
        <p>
          Prophet is a parimutuel prediction market on tokenized stocks, running on Robinhood Chain (a real EVM
          network Robinhood operates for tokenized equities). <strong className="text-white/80">Real mode is the default experience</strong>: connecting
          a browser wallet (MetaMask, Phantom, or similar) lets you interact with a live smart contract using real
          USDG — money you can genuinely gain or lose. A separate mock demo, reachable via "Try the demo", is a
          fully client-side simulation with no wallet, no real prices, and no real funds — useful to see how the
          product works without risking anything, but distinct from real mode in every respect. Nothing here
          constitutes a regulated financial product, exchange, or brokerage, and using it doesn't make Prophet one.
        </p>
      </Section>

      <Section title="3. Eligibility and risk">
        <p>
          You must be able to form a binding contract to use the Service, and you're responsible for complying with
          any laws that apply to you wherever you access it from — including local rules about prediction markets,
          derivatives, or gambling, which vary widely and are your responsibility to check, not Prophet's. Real mode
          involves real financial risk: you can lose the full amount you stake. Only use funds you can afford to
          lose, and see §6 on the lack of a security audit before treating this as a safe place to hold value.
        </p>
      </Section>

      <Section title="4. Accounts and wallets">
        <p>
          Real mode has no accounts of its own — your wallet address is your identity, and Prophet never receives
          or stores your private key or seed phrase; every transaction is signed in your own wallet extension.
          Nicknames (if you set one) are stored on-chain in a separate, public, permanent registry contract — anyone
          can see it, and it's tied to your address, not verified as your real name. Mock-demo accounts are stored
          only in your browser's <code className="text-[#C6FF3D]">localStorage</code> — no server-side database, no
          password recovery, and clearing your browser data deletes them. Don't reuse a real password there.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>attempt to exploit, spam, or degrade the Service, the smart contract, or the underlying chain infrastructure;</li>
          <li>use the Service to launder funds, evade sanctions, or facilitate any unlawful transaction;</li>
          <li>misrepresent the Service, or claim it's endorsed by any company whose stock is tokenized on it or by Robinhood Markets, Inc.;</li>
          <li>attempt to manipulate a price feed or market outcome outside the mechanics the Service itself provides.</li>
        </ul>
      </Section>

      <Section title="6. No warranty">
        <p>
          The Service is provided "as is." Prices, market data, and mock-demo data can be wrong, delayed, or
          unavailable without notice. <strong className="text-white/80">The smart contract has not completed an external security audit</strong> —
          it has had an internal self-review only (documented in the project's own engineering notes), which is not
          a substitute for one. Prophet makes no warranty that the Service, or the underlying blockchain/RPC
          infrastructure it depends on, will be uninterrupted, error-free, or fit for any particular purpose.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          To the fullest extent permitted by law, Prophet and its contributors aren't liable for any loss arising
          from your use of the Service — including loss of funds, data, or availability, whether from a bug, an
          exploit, a chain/RPC outage, or otherwise. Real mode moves real money with no audit behind it; this
          limitation is a direct response to that risk, not boilerplate.
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
          Prophet's real mode is live on Robinhood Chain mainnet with real money moving through it today — this is
          not a future state. That said, it has not had: an external security audit of the smart contract, or a
          genuine legal and regulatory review of prediction markets in every jurisdiction it's reachable from.
          Neither has happened yet. Being live doesn't mean either has been cleared — this document existing is not
          a substitute for that review, and nothing in it should be read as Prophet asserting it has cleared that
          bar. The contract is also owner-centralized: a single address controls which price feeds are allowed and
          the protocol fee, which is a real trust assumption you're making by using it.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <div className="text-white/60 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  )
}
