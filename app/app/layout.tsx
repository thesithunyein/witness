import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three faces, each with one job:
 *
 *   Inter            the interface, labels, body, buttons and every display
 *                    line inside the app. One grotesque, weight and tracking
 *                    carry the hierarchy.
 *   Instrument Serif the landing page only: the one editorial voice that makes
 *                    the first screen read like a printed argument rather than
 *                    a dashboard. Italic for the single word that carries the
 *                    decision.
 *   JetBrains Mono   every figure and identifier: amounts, addresses, hashes,
 *                    countdowns. Tabular, so a ticking number does not reflow.
 *
 * All three are self-hosted by next/font, so there is no third-party request at
 * runtime and no layout shift when they load.
 */
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-serif",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  // The tab icon is public/logo.png, the same file the app bar and the README use.
  icons: { icon: "/logo.png" },
  title: {
    default: "Witness: passkey approvals for AI agents",
    template: "%s · Witness",
  },
  description:
    "Before an AI agent spends your money, you approve that exact action with a passkey. Enforced on Monad.",
  openGraph: {
    title: "Witness Approvals: your agent asks, you decide",
    description:
      "A passkey-signed, one-time permission for one exact action, checked by the contract that holds the funds. Monad testnet.",
    type: "website",
  },
};

export const viewport: Viewport = {
  // Matches the page background so the browser chrome does not band against it.
  themeColor: "#f6f7f9",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
