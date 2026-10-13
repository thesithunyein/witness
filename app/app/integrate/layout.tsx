import type { Metadata } from "next";

/**
 * The integrator page is a client component, so its title lives here.
 * Root template turns this into "Integrate · Witness".
 */
export const metadata: Metadata = {
  title: "Integrate",
  description:
    "Add passkey approval to a Monad app. One SDK, one contract check, three steps.",
};

export default function IntegrateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
