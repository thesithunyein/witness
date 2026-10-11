/**
 * Static entry for the deployed build.
 *
 * The deployed site is NOT a Next.js server: it is a static bundle plus a small
 * Cloudflare Worker that owns /api/*. This file mounts the exact same page
 * component the Next dev server renders, so there is one UI, not two.
 *
 * globals.css is loaded by static/index.html (as /styles.css) rather than
 * imported here, so the bundler emits only JavaScript and the pipeline stays
 * predictable.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Page from "../app/page";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>
);
