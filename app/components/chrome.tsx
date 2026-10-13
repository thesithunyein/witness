/*
 * Chrome shared by every screen.
 *
 * Two rules, both learned from operating this thing:
 *
 *   the brand goes home. A mark in the corner that goes to the screen you are
 *   already on is decoration. This one points at /, the same place the browser's
 *   back button should mean, and the explicit Home link beside it exists because
 *   a logo is not a label: on a phone, a reader who has never seen the mark
 *   cannot tell where it goes.
 *
 *   the bar says one thing per element. The mark carries the name and nothing
 *   under it, and the chain readout is gone: the chain id is a setting, not
 *   navigation, and it already has its own row in Settings. A bar with a brand,
 *   one way home and the screen's own action reads as a bar; a bar with a second
 *   line of small caps under the logo reads as a business card.
 *
 * Section navigation is not in here. The app's sections are a rail on a desktop
 * and a bar at the bottom of a phone, so they belong to the app's own frame, not
 * to a component the developer page also renders.
 */
import type { ReactNode } from "react";
import { HomeIcon } from "@/components/icons";

/**
 * The mark: the logo file itself, not a redrawing of it.
 *
 * public/logo.png is the same file the tab icon (`icons.icon` in layout.tsx),
 * the static bundle and the README all point at, so the tab, the bar and the
 * README cannot drift apart.
 */
export function Mark() {
  return <img className="mark" src="/logo.png" alt="" width={30} height={30} />;
}

export function AppBar({
  actions,
}: {
  /** Right-hand controls, after Home. The screen's own verb, nothing else. */
  actions?: ReactNode;
}) {
  return (
    <header className="appbar">
      <div className="appbar__top">
        <a className="brand" href="/">
          <Mark />
          <span className="brand-name">Witness</span>
        </a>

        <div className="masthead-right">
          <a className="micro micro--icon home-link" href="/">
            <HomeIcon size={13} />
            <span>Home</span>
          </a>
          {actions}
        </div>
      </div>
    </header>
  );
}
