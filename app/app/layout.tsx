import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Witness — proof-of-intent for AI agents",
  description:
    "An AI agent can prove who it is with ERC-8004. Witness proves what the human actually authorized.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
