import type { Metadata } from "next";
import { ArrowRightIcon, BotIcon, LockIcon, ShieldCheckIcon, XBrandIcon } from "@/components/icons";

/**
 * The landing page: the front door.
 *
 * The app itself lives at /app. This page is the argument for it, and it is
 * built like a printed one: one voice for the headline and the step titles,
 * hairlines instead of cards, and the brand colour reduced to two small marks.
 * It renders identically in the static bundle (the Worker deployment mounts it
 * client-side at /), so it stays a plain, synchronous, hook-free component: the
 * FAQ is native <details>, and every entrance is a CSS animation with no
 * observer behind it.
 *
 * Three rules the page keeps, because they are what a front door is for:
 *
 *   one call to action, and it is in the bar. "Open the app" sits at the top
 *   right where a product puts the one thing it wants you to do, visible while
 *   you read. The hero points at the argument instead of repeating the button.
 *
 *   no third-party marks. Source links belong in the paperwork, not on the
 *   product's own front page. The one outbound identity link is the project's
 *   own X account, an icon in the footer where a contact belongs.
 *
 *   facts where links would be. The On-chain column answers "can I check it"
 *   with deployed addresses rather than with a paragraph about how honest we
 *   are, and every footer link resolves to a page that exists.
 */

export const metadata: Metadata = {
  title: { absolute: "Witness: passkey approvals for your agent" },
  description:
    "Approve one exact payment with a passkey. The contract checks the signature before it pays. Monad testnet.",
  openGraph: {
    title: "Witness: passkey approvals for your agent",
    description:
      "One passkey signature, one exact payment, checked by the contract that holds the funds. Monad testnet.",
    type: "website",
  },
};

const TRUST = [
  {
    label: "One approval, one payment",
    text: "A passkey signature covers one amount, one payee and one expiry. It cannot be replayed.",
  },
  {
    label: "Configuration frozen",
    text: "Trust settings were locked at deploy. Nobody can change them later.",
  },
  {
    label: "Agent identity verified",
    text: "The agent is a registered on-chain identity, owned by the executor contract.",
  },
  {
    label: "No wallet needed",
    text: "No extension, no seed phrase, no testnet funds.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "The agent asks",
    body: "It sends one exact payment: amount, payee, expiry. It can describe a payment, never sign one.",
  },
  {
    num: "02",
    title: "You approve",
    body: "Your passkey signs those same fields. One payment, nothing else.",
  },
  {
    num: "03",
    title: "The contract pays",
    body: "It checks the signature, the limit and the expiry. Anything else is refused on-chain.",
  },
];

const FAQ = [
  {
    q: "Where does my key live?",
    a: "On your device. Your fingerprint, face or PIN unlocks it, and Witness never sees it.",
  },
  {
    q: "What does one approval cover?",
    a: "One payment: one amount, one payee, one expiry. It cannot be reused.",
  },
  {
    q: "Do I need a wallet?",
    a: "No. Approvals are passkey signatures and Witness relays the gas.",
  },
  {
    q: "What if the agent asks for more?",
    a: "The contract refuses it on-chain. Only the approved payment moves.",
  },
  {
    q: "Which network does it run on?",
    a: "Monad testnet, chain id 10143.",
  },
  {
    q: "How do I add it to my app?",
    a: "Read the docs. One SDK, four calls, one check on-chain.",
  },
];

/**
 * What the footer is for.
 *
 * Three questions are left after the argument above: where do I go next, how do
 * I build on it, and can I check it myself. Every link here resolves to a page
 * that exists: the two routes of this site and their sections, the project's X
 * account, and the deployed addresses a sceptic can read on the explorer. A
 * footer is the easiest place in a product to invent a Privacy page nobody
 * wrote, so nothing here is invented.
 */
const FOOTER: {
  heading: string;
  links: { label: string; href: string; external?: boolean }[];
}[] = [
  {
    heading: "Product",
    links: [
      { label: "The app", href: "/app" },
      { label: "How it works", href: "#how-it-works" },
      { label: "Questions", href: "#faq" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "The four calls", href: "/docs#calls" },
      { label: "Try the preflight", href: "/docs#preflight" },
    ],
  },
  {
    heading: "On-chain",
    links: [
      {
        label: "WitnessVerifier",
        href: "https://testnet.monadscan.com/address/0x7836f1bDDdBF491c23a285B5015441a5A147D096",
        external: true,
      },
      {
        label: "Intent registry",
        href: "https://testnet.monadscan.com/address/0x84502BA6Bf4A565b84E8eC1747568d54610E71E2",
        external: true,
      },
      {
        label: "Agent identity",
        href: "https://testnet.monadscan.com/address/0x8004A818BFB912233c491871b3d84c89A494BD9e",
        external: true,
      },
      {
        label: "Block explorer",
        href: "https://testnet.monadscan.com",
        external: true,
      },
    ],
  },
];

export default function Landing() {
  return (
    <div className="ln">
      <nav className="ln-nav" aria-label="Main">
        <div className="ln-nav__inner">
          <a className="ln-nav__brand" href="/">
            <img className="mark" src="/logo.png" alt="" width={30} height={30} />
            <span>Witness</span>
          </a>

          <div className="ln-nav__links">
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
            <a href="/docs">Docs</a>
          </div>

          <a className="ln-btn ln-btn--brand ln-btn--nav" href="/app">
            Open the app
            <ArrowRightIcon size={15} />
          </a>
        </div>
      </nav>

      <header className="ln-hero">
        <p className="ln-eyebrow">
          <span className="ln-eyebrow__dot" aria-hidden />
          Passkey authorization for AI agents
        </p>
        {/* Each line is its own clipped track, so the two halves of the sentence
            rise into place one after the other the way a title card does. */}
        <h1 className="ln-hero__title">
          <span className="ln-hero__line">
            <span>Your agent asks.</span>
          </span>
          <span className="ln-hero__line">
            <span>
              You <em>decide.</em>
            </span>
          </span>
        </h1>
        <p className="ln-hero__sub">
          Approve one exact payment with a passkey. The contract checks the signature before it pays.
        </p>
        <div className="ln-hero__actions">
          <a className="ln-btn ln-btn--lg" href="#how-it-works">
            See how it works
          </a>
          <a className="ln-btn ln-btn--lg ln-btn--ghost" href="/docs">
            Read the docs
          </a>
        </div>
      </header>

      <figure className="ln-art">
        <img
          src="/halftone-hands.png"
          alt="Two hands reaching toward each other, drawn in halftone dots."
          width={963}
          height={298}
        />
      </figure>

      <section className="ln-trust" aria-label="What this deployment guarantees">
        <div className="ln-trust__grid">
          {TRUST.map((item) => (
            <div className="ln-trust__cell" key={item.label}>
              <p className="ln-micro">{item.label}</p>
              <p className="ln-trust__text">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="ln-steps" id="how-it-works">
        <div className="ln-steps__intro">
          <p className="ln-eyebrow">
            <span className="ln-eyebrow__dot" aria-hidden />
            How it works
          </p>
          <h2 className="ln-steps__heading">Three steps. The middle one is yours.</h2>
        </div>

        <div className="ln-steps__grid">
          {STEPS.map((step) => (
            <article className="ln-step" key={step.num}>
              <p className="ln-step__num">{step.num}</p>
              <h3 className="ln-step__title">{step.title}</h3>
              <p className="ln-step__body">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ln-faq" id="faq" aria-label="Frequently asked questions">
        <p className="ln-eyebrow">
          <span className="ln-eyebrow__dot" aria-hidden />
          FAQ
        </p>
        <h2 className="ln-faq__heading">Questions, answered.</h2>

        {FAQ.map((item) => (
          <details className="ln-faq__item" key={item.q}>
            <summary className="ln-faq__q">{item.q}</summary>
            <p className="ln-faq__a">{item.a}</p>
          </details>
        ))}
      </section>

      {/* The close says the product's rule, not the hero's sentence twice. */}
      <section className="ln-final">
        <h2 className="ln-final__line">
          Everything else
          <br />
          is <em>refused on-chain.</em>
        </h2>
        <p className="ln-final__note">
          <ShieldCheckIcon size={13} /> One payment per approval.
          <LockIcon size={13} /> Configuration frozen.
          <BotIcon size={13} /> Identity verified.
        </p>
      </section>

      <footer className="ln-footer">
        <div className="ln-footer__inner">
          <div className="ln-footer__brand">
            <a className="ln-nav__brand" href="/">
              <img className="mark" src="/logo.png" alt="" width={26} height={26} />
              <span>Witness</span>
            </a>
            <p className="ln-footer__tag">
              Passkey approvals for AI agents. One signature covers one payment, and the contract
              that holds the funds checks it before anything moves.
            </p>
            <a
              className="ln-footer__x"
              href="https://x.com/witness_agent"
              target="_blank"
              rel="noreferrer"
              aria-label="Witness on X"
            >
              <XBrandIcon size={14} />
            </a>
          </div>

          <nav className="ln-footer__cols" aria-label="Footer">
            {FOOTER.map((col) => (
              <div className="ln-footer__col" key={col.heading}>
                <h2 className="ln-footer__heading">{col.heading}</h2>
                <ul>
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="ln-footer__legal">
          <p>© 2026 Witness. Testnet software, not audited. Do not use with real funds.</p>
        </div>
      </footer>
    </div>
  );
}
