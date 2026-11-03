"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { estMonthlyDevEx, fmtUsdEstimate } from "@/lib/trends/revenue";
import { paywallOn } from "@/lib/paywall";

// Cached pages never carry dollar figures. After the server confirms the
// visitor's licence (/api/pro/status), these components work them out from
// the free Top Earning ranks; everyone else sees a Pro badge.

const ProContext = createContext<boolean>(false);

export function ProProvider({ children }: { children: ReactNode }) {
  // Paywall off: figures render straight away, with no check and no badges.
  const [pro, setPro] = useState(!paywallOn());
  useEffect(() => {
    if (!paywallOn()) return;
    let live = true;
    fetch("/api/pro/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pro: false }))
      .then((d: { pro?: boolean }) => live && setPro(Boolean(d.pro)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return <ProContext.Provider value={pro}>{children}</ProContext.Provider>;
}

export const usePro = () => useContext(ProContext);

export function ProStar({ className = "" }: { className?: string }) {
  if (!paywallOn()) return null;
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <polygon points="6,0.8 7.6,4.3 11.4,4.6 8.5,7.1 9.4,10.9 6,8.9 2.6,10.9 3.5,7.1 0.6,4.6 4.4,4.3" fill="var(--gold)" />
    </svg>
  );
}

// Stands in for a Pro-only figure.
export function ProLock({ label = "Pro" }: { label?: string }) {
  return (
    <Link
      href="/pro"
      title="Estimated revenue is part of Roblox Pulse Pro"
      className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold hover:bg-gold/18"
    >
      <ProStar />
      {label}
    </Link>
  );
}

// A modelled payout for one Top Earning rank.
export function Usd({ rank, kind = "mid", prefix = "", suffix = "" }: { rank: number | null; kind?: "mid" | "range"; prefix?: string; suffix?: string }) {
  const pro = usePro();
  const est = estMonthlyDevEx(rank);
  if (!est) return <span className="text-muted-foreground">—</span>;
  if (!pro) return <ProLock />;
  return (
    <>
      {prefix}
      {kind === "range" ? `${fmtUsdEstimate(est.low)} to ${fmtUsdEstimate(est.high)}` : fmtUsdEstimate(est.mid)}
      {suffix}
    </>
  );
}

// Modelled payouts summed over several ranks (a genre, a group).
export function UsdSum({ ranks, suffix = "" }: { ranks: number[]; suffix?: string }) {
  const pro = usePro();
  if (!pro) return <ProLock />;
  const total = ranks.reduce((a, r) => a + (estMonthlyDevEx(r)?.mid ?? 0), 0);
  return (
    <>
      {fmtUsdEstimate(total)}
      {suffix}
    </>
  );
}

const perPlayer = (v: number) => (v < 1 ? "under $1" : `$${Math.round(v).toLocaleString("en-GB")}`);

// Modelled monthly payout per average concurrent player.
export function UsdPerPlayer({ rank, players, prefix = "" }: { rank: number; players: number; prefix?: string }) {
  const pro = usePro();
  const est = estMonthlyDevEx(rank);
  if (!est || !players) return <span className="text-muted-foreground">—</span>;
  if (!pro) return <ProLock />;
  return (
    <>
      {prefix}
      {perPlayer(est.mid / players)}
    </>
  );
}

// Anything else that is Pro only, such as a download link.
export function ProOnly({ children, label = "Pro" }: { children: ReactNode; label?: string }) {
  return usePro() ? <>{children}</> : <ProLock label={label} />;
}
