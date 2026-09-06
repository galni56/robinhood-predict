import type { ReactNode } from 'react'
import { RHCHAIN_META } from '@/market/tokens'

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      <div>
        <p className="text-xs font-bold tracking-[0.2em] text-violet-300/80 uppercase mb-2">Legal</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-white/40 text-sm mt-3">
          Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
          Draft for a demo/testnet product — see §9 before assuming this covers a real-money launch.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        This is a template written for a demo project, not reviewed by a lawyer. It is not a substitute for real
        legal review, which is a deliberately open item before PredictX handles real funds or real users — see the{' '}
        <a href="#launch-status" className="underline">
          §9 note
        </a>{' '}
        below.
      </div>

      <Section title="1. Acceptance of these terms">
        <p>
          By accessing or using PredictX (the "Service"), you agree to these Terms of Service. If you don't agree,
          don't use the Service. These terms apply to the mock demo (every page except <code className="text-violet-300">/onchain/*</code>) and
          to the real-testnet section alike.
        </p>
      </Section>

      <Section title="2. What the Service is">
        <p>
          PredictX is a parimutuel prediction market on tokenized stocks. The default experience is a client-side
          demo with simulated prices, a simulated chain, and no real funds. A separate section connects a browser
          wallet to a smart contract deployed on {RHCHAIN_META.name} — a public test network. Nothing on either
          side of the Service involves real money, and nothing here constitutes a regulated financial product,
          exchange, or brokerage.
        </p>
      </Section>

      <Section title="3. Eligibility">
        <p>
          You must be able to form a binding contract to use the Service. You're responsible for complying with any
          laws that apply to you wherever you access it from — including any local rules about prediction markets
          or simulated trading products.
        </p>
      </Section>

      <Section title="4. Accounts">
        <p>
          Demo accounts are stored only in your browser's <code className="text-violet-300">localStorage</code> —
          there is no server-side account database, no password recovery, and clearing your browser data deletes
          the account. Don't reuse a real password here. Wallet connections for the real-testnet section use your
          own browser extension (MetaMask, Phantom, or similar); PredictX never receives or stores your private key
          or seed phrase.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>attempt to exploit, spam, or degrade the Service or the underlying testnet infrastructure;</li>
          <li>use the Service to launder funds, evade sanctions, or facilitate any unlawful transaction;</li>
          <li>misrepresent the Service as handling real money, or as endorsed by any company whose stock is tokenized on it;</li>
          <li>attempt to manipulate a price feed or market outcome outside the mechanics the Service itself provides.</li>
        </ul>
      </Section>

      <Section title="6. No warranty">
        <p>
          The Service is provided "as is," with mock/testnet data that can be wrong, delayed, reset, or lost without
          notice. The smart contract has not completed an external security audit. PredictX makes no warranty that
          the Service will be uninterrupted, error-free, or fit for any particular purpose.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p>
          To the fullest extent permitted by law, PredictX and its contributors aren't liable for any loss arising
          from your use of the Service — including loss of test funds, data, or availability. Because no real
          money is at stake anywhere in the Service today, this section is largely precautionary rather than a
          response to any specific known risk.
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
          PredictX today is a demo and a public testnet integration — nothing more. Before any version of this
          product could handle real funds or onboard real users at scale, it needs, at minimum: an external
          security audit of the smart contract, and a genuine legal and regulatory review of prediction markets in
          every jurisdiction it would operate in. Neither has happened. This document existing is not a substitute
          for that review, and nothing in it should be read as PredictX asserting it has cleared that bar.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          This is an independent demo project, not affiliated with Robinhood Markets, Inc. Questions or issues can
          be filed against the project's{' '}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="text-violet-300 hover:underline"
          >
            GitHub repository
          </a>
          .
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
