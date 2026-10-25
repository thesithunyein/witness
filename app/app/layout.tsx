import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

/**
 * Three faces, each with one job:
 *
 *   Inter           the interface, labels, body, buttons
 *   Newsreader      display lines only: the wordmark, the statement, the page
 *                   title, the request, the verdict. A reading serif, so the few
 *                   lines that are statements carry weight without a bold weight.
 *   JetBrains Mono  every figure and identifier: amounts, addresses, hashes,
 *                   countdowns. Tabular, so a ticking number does not reflow.
 *
 * All three are self-hosted by next/font, so there is no third-party request at
 * runtime and no layout shift when they load.
 */
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// The serif is used at 400 and 500 only. Its real weights matter: a synthesised
// bold serif is what makes a display line look borrowed from a template.
const display = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  // The tab icon is public/logo.png, the same file the app bar and the README use.
  icons: { icon: "/logo.png" },
  title: "Witness: passkey approvals for AI agents",
  description:
    "Before an AI agent spends your money, you approve that exact action with a passkey, and the contract holding the funds verifies it on-chain. Live on Mezo testnet with MUSD.",
  openGraph: {
    title: "Witness: passkey approvals for AI agents",
    description:
      "A passkey-signed, one-time permission for one exact action, checked by the contract that holds the funds. Live on Mezo testnet, chain 31611.",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Matches the page background so the browser chrome does not band against it.
  themeColor: "#f7f5f1",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
