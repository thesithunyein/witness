import type { Metadata } from "next";

/**
 * The docs page is a client component, so its title lives here.
 * Root template turns this into "Docs · Witness".
 */
export const metadata: Metadata = {
  title: "Docs",
  description:
    "Add passkey approval to a Monad app: four SDK calls and one on-chain check.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
