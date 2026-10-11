import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Three faces, each with one job:
 *
 *   Inter           the interface — labels, body, buttons
 *   Space Grotesk   display lines: the dashboard title, the permission
 *                   sentence, the verdict. Geometric, not decorative.
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

const display = Space_Grotesk({
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
  title: "Witness Approvals — your agent asks, you decide",
  description:
    "Before an AI agent spends your money, you approve that exact action with a passkey. Enforced on Monad.",
  openGraph: {
    title: "Witness Approvals — your agent asks, you decide",
    description:
      "A passkey-signed, one-time permission for one exact action, checked by the contract that holds the funds. Monad testnet.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
