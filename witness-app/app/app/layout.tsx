import type { Metadata } from "next";

/**
 * The approvals screen has its own title so a shared link reads as the app, not
 * as the landing page. The root layout carries the marketing metadata.
 */
export const metadata: Metadata = {
  title: "Witness Approvals: your agent asks, you decide",
  description:
    "Approve one exact payment with a passkey. The contract that holds the funds checks the signature before anything moves.",
};

export default function ApprovalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
