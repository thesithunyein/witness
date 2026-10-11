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
  title: "Witness — proof-of-intent for AI agents",
  description:
    "An AI agent can prove who it is with ERC-8004. Witness proves what the human actually authorized.",
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
