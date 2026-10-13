import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * One family, everywhere.
 *
 *   Geist        every word on every screen: the landing headline, the app's
 *                labels, the request sentence, the numbers. A neo-grotesque with
 *                squared curves and a straight-tailed y, so a 64px display line
 *                and a 13px nav label read as the same voice at two sizes.
 *   Geist Mono   addresses, hashes, amounts and countdowns. Tabular, so a
 *                ticking number does not reflow the row it sits in.
 *
 * Both are self-hosted by next/font, so there is no third-party request at
 * runtime and no layout shift when they load.
 */
const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = Geist_Mono({
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
