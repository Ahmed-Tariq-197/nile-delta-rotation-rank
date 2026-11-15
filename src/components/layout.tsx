import { useEffect } from "react";

import { NAVIGATION_ITEMS } from "@/lib/app-content";

export function OrbitMark() {
  return (
    <svg className="orbit-mark" viewBox="0 0 42 42" role="img" aria-label="Nile Orbit Lab orbit mark">
      <ellipse cx="21" cy="21" rx="15" ry="6" transform="rotate(-18 21 21)" fill="none" stroke="var(--gold)" strokeWidth="1" />
      <circle cx="33" cy="19" r="2" fill="var(--ivory)" />
    </svg>
  );
}

export function Header({ section }: { section: string }) {
  return (
    <header className="site-header">
      <a className="brand-link" href="#/" aria-label="RotaNile planner">
        <OrbitMark />
        <span className="brand-word">RotaNile</span>
      </a>
      <nav className="primary-nav" aria-label="Primary">
        {NAVIGATION_ITEMS.map((item) => (
          <a
            key={item.path}
            href={item.path === "/" ? "#/" : `#${item.path}`}
            aria-current={section === item.path ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function LiveRegions() {
  return (
    <>
      <div className="live-region" aria-live="polite" aria-atomic="true" id="polite-status" />
      <div className="live-region" aria-live="assertive" aria-atomic="true" id="assertive-status" />
    </>
  );
}

export function Shell({ section, children }: { section: string; children: React.ReactNode }) {
  useEffect(() => {
    const label = NAVIGATION_ITEMS.find((item) => item.path === section)?.label ?? "Planner";
    document.title = `${label} | RotaNile`;
    const heading = document.getElementById("view-heading");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    const region = document.getElementById("polite-status");
    if (region) region.textContent = `${label} page`;
  }, [section]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main">Skip to main content</a>
      <Header section={section} />
      <LiveRegions />
      <main className="main-content" id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>RotaNile by Nile Orbit Lab.</p>
        <p>Latest available data through date not provided.</p>
        <p>Planning support, not a forecast.</p>
      </footer>
    </div>
  );
}