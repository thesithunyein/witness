/**
 * Static entry for the deployed build.
 *
 * The deployed site is NOT a Next.js server: it is a static bundle plus a small
 * Cloudflare Worker that owns /api/*. This file mounts the exact same page
 * components the Next dev server renders, so there is one UI, not two:
 *
 *   /           → the landing page (the editorial front door)
 *   /app        → the approvals app
 *   /integrate  → the integration guide for developers
 *
 * The three are not three files: the bundle is one index.html whose entry
 * component reads the path, and the Worker serves that same shell for each. The
 * landing's navigation and footer both link to /integrate, and a route this file
 * did not mount landed a reader on the front page instead of on the guide.
 *
 * globals.css is loaded by static/index.html (as /styles.css) rather than
 * imported here, so the bundler emits only JavaScript and the pipeline stays
 * predictable.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Landing from "../app/page";
import Approvals from "../app/app/page";
import Integrate from "../app/integrate/page";

const path = window.location.pathname;
const atApprovals = path === "/app" || path.startsWith("/app/");
const atIntegrate = path === "/integrate" || path.startsWith("/integrate/");

if (atApprovals) {
  document.title = "Witness Approvals: your agent asks, you decide";
} else if (atIntegrate) {
  document.title = "Integrate · Witness";
}

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>{atApprovals ? <Approvals /> : atIntegrate ? <Integrate /> : <Landing />}</StrictMode>
);
