import { useEffect } from "react";

const REVEAL_SELECTOR =
  ".content-section, .chart-wrap, .limits-strip, .feature-card, .stat-tile, .tree-line, .card-grid > *";

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Page-wide motion: scroll reveal, pointer glow on cards, compact header after scrolling. */
export function usePageMotion(key: string) {
  useEffect(() => {
    const root = document.documentElement;
    const main = document.getElementById("main");
    if (!main) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      root.classList.remove("motion-ready");
      return;
    }
    root.classList.add("motion-ready");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );
    const watch = () => {
      main.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
        if (el.dataset["reveal"]) return;
        el.dataset["reveal"] = "1";
        io.observe(el);
      });
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [key]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const onMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        ".plan-card, .content-section, .feature-card, .stat-tile, .point-choice",
      );
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      target.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };
    const onScroll = () => {
      document.documentElement.classList.toggle("is-scrolled", window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty(
        "--scroll-progress",
        String(max > 0 ? Math.min(1, window.scrollY / max) : 0),
      );
    };
    onScroll();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
}
