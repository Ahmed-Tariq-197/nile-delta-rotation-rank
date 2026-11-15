import { useEffect, useRef, useState } from "react";

import { prefersReducedMotion } from "@/lib/use-page-motion";

/** A number that counts up to its value when it first appears. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (value - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      {shown.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </>
  );
}

export type HeroStat = { label: string; value: number | string; decimals?: number };

/** A row of glowing figures under a page title. */
export function HeroStats({ items }: { items: HeroStat[] }) {
  return (
    <dl className="hero-stats">
      {items.map((item) => (
        <div className="hero-stat" key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {typeof item.value === "number" ? (
              <CountUp value={item.value} decimals={item.decimals ?? 0} />
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
