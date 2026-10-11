import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

/**
 * Two faces, in the poster's discipline: one high-contrast display serif used
 * exactly once (the wordmark, the permission sentence, the verdict) and one
 * neutral grotesque for everything functional. Self-hosted by next/font, so
 * there is no third-party request at runtime and no layout shift.
 */
const sans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Witness Approvals — your agent asks, you decide",
  description:
    "Before an AI agent spends your money, you approve that exact action with a passkey. Enforced on Monad.",
};

export const viewport: Viewport = {
  themeColor: "#161616",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
