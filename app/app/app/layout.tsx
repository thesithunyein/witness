import type { Metadata } from "next";

/**
 * The approvals app is a client component, so its title lives here.
 * Root template turns this into "Approvals · Witness".
 */
export const metadata: Metadata = {
  title: "Approvals",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
