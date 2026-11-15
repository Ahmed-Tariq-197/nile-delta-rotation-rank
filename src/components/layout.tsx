import { useEffect, type ReactNode } from "react";

import { usePageMotion } from "@/lib/use-page-motion";
import { NAVIGATION_ITEMS } from "@/lib/app-content";

/** The official Nile Orbit Lab badge, served from size-matched copies of the original file. */
export function BrandBadge({
  size,
  className,
  eager = false,
}: {
  size: number;
  className?: string;
  eager?: boolean;
}) {
  const small = size <= 64;
  return (
    <img
      className={className}
      src={small ? "/brand/badge-128.webp" : "/brand/badge-640.webp"}
      srcSet={
        small
          ? "/brand/badge-128.webp 128w, /brand/badge-256.webp 256w"
          : "/brand/badge-640.webp 640w, /brand/badge-1200.webp 1200w"
      }
      sizes={`${size}px`}
      alt="Nile Orbit Lab"
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}

/** Gold orbit carried over from the badge; a satellite glint travels along it. */
function OrbitArc() {
  return (
    <svg className="orbit-arc" viewBox="0 0 1440 420" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="orbit-stroke" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0" />
          <stop offset="0.35" stopColor="var(--gold)" stopOpacity="0.55" />
          <stop offset="0.78" stopColor="var(--gold-bright)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id="orbit-glint">
          <stop offset="0" stopColor="var(--on-dark)" />
          <stop offset="0.4" stopColor="var(--gold-bright)" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        id="orbit-path"
        className="orbit-path"
        d="M -40 360 C 380 300, 820 150, 1180 120 S 1520 170, 1480 230"
        stroke="url(#orbit-stroke)"
      />
      <circle className="orbit-satellite" r="7" fill="url(#orbit-glint)">
        <animateMotion dur="22s" repeatCount="indefinite" rotate="auto">
          <mpath href="#orbit-path" />
        </animateMotion>
      </circle>
    </svg>
  );
}

/** Night-side hero shared by every page; it ends on the Earth's limb, where the daylight content begins. */
export function PageHero({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="hero">
      <OrbitArc />
      <div className="hero-inner">
        <div className="hero-copy">
          <h1 id="view-heading">{title}</h1>
          {children}
        </div>
        <div className="hero-badge">
          <BrandBadge size={208} eager />
        </div>
      </div>
    </header>
  );
}

export function Header({ section }: { section: string }) {
  return (
    <header className="site-header">
      <a className="brand-link" href="#/" aria-label="RotaNile planner">
        <BrandBadge size={44} className="brand-logo" eager />
        <span className="brand-text">
          <span className="brand-word">RotaNile</span>
          <span className="brand-by">by Nile Orbit Lab</span>
        </span>
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
      <span className="scroll-progress" aria-hidden="true" />
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

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  usePageMotion(section);
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
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <Header section={section} />
      <LiveRegions />
      <main className="main-content" id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <BrandBadge size={36} className="footer-badge" />
        <p>
          <strong>RotaNile</strong> by Nile Orbit Lab. Planning support, not a forecast.
        </p>
      </footer>
    </div>
  );
}
