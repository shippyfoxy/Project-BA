"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The watchlist is kept in this browser only: no account, nothing sent anywhere
// until the watchlist page puts it in its address.
export const WATCH_KEY = "pulse-watch";
export type WatchKind = "g" | "s" | "sub";
export type Stored = Record<WatchKind, string[]>;

export function readWatch(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(WATCH_KEY) ?? "{}");
    return { g: v.g ?? [], s: v.s ?? [], sub: v.sub ?? [] };
  } catch {
    return { g: [], s: [], sub: [] };
  }
}

export function storedQuery(w: Stored): string {
  const q = new URLSearchParams();
  for (const k of ["g", "s", "sub"] as const) if (w[k].length) q.set(k, w[k].join(","));
  return q.toString();
}

// `value` is the item as it appears in the watchlist address: a universe id,
// "group:123", or "Simulation|Tycoon".
export function FollowButton({ kind, value, label, compact = false }: { kind: WatchKind; value: string; label: string; compact?: boolean }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => setOn(readWatch()[kind].includes(value)), [kind, value]);

  function toggle() {
    const w = readWatch();
    const next = !w[kind].includes(value);
    w[kind] = next ? [...w[kind], value] : w[kind].filter((x) => x !== value);
    try {
      localStorage.setItem(WATCH_KEY, JSON.stringify(w));
    } catch {}
    setOn(next);
    // The watchlist page renders from its address, so rebuild the address.
    if (window.location.pathname === "/watch") window.location.replace(`/watch?${storedQuery(w)}`);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on ?? false}
        aria-label={`${on ? "Unfollow" : "Follow"} ${label}`}
        title={on ? "Following: click to stop" : "Add to your watchlist"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium ${
          on ? "border-rise/50 bg-rise/15 text-rise" : "border-input bg-card text-text-2 hover:bg-secondary hover:text-foreground"
        } ${compact ? "px-2 py-0.5 text-xs" : ""}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <polygon
            points="6,0.8 7.6,4.3 11.4,4.6 8.5,7.1 9.4,10.9 6,8.9 2.6,10.9 3.5,7.1 0.6,4.6 4.4,4.3"
            fill={on ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        {compact ? null : on ? "Following" : "Follow"}
      </button>
      {on && !compact ? (
        <Link href="/watch" className="text-[13px] text-link hover:underline">
          Watchlist
        </Link>
      ) : null}
    </span>
  );
}
