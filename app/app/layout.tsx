import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two faces, each with one job:
 *
 *   Inter          the interface, labels, body, buttons and every display
 *                  line. One grotesque, weight and tracking carry the
 *                  hierarchy, which is what keeps a security product looking
 *                  like a tool instead of a poster.
 *   JetBrains Mono every figure and identifier: amounts, addresses, hashes,
 *                  countdowns. Tabular, so a ticking number does not reflow.
 *
 * Both are self-hosted by next/font, so there is no third-party request at
 * runtime and no layout shift when they load.
 */
const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  // The tab icon is public/logo.png, the same file the app bar and the README use.
  icons: { icon: "/logo.png" },
  title: "Witness Approvals: your agent asks, you decide",
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
