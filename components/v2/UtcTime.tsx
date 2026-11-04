"use client";

import { useEffect, useState } from "react";
import { fmtTimeUtc } from "@/lib/format";

// A time shown in UTC, with the reader's own time beside it and in the tooltip.
// The server cannot know the reader's zone, so the local part appears after
// hydration; readers already on UTC see nothing extra.
// `compact` keeps the reader's time to the tooltip, for tight spots like the header.
export function UtcTime({ ms, compact = false }: { ms: number; compact?: boolean }) {
  const [local, setLocal] = useState<{ short: string; full: string } | null>(null);

  useEffect(() => {
    const d = new Date(ms);
    if (d.getTimezoneOffset() === 0) return;
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const sameDay = d.getDate() === d.getUTCDate();
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setLocal({
      short: sameDay ? time : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`,
      full: `${d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} your time (${zone})`,
    });
  }, [ms]);

  return (
    <time dateTime={new Date(ms).toISOString()} title={local?.full} className="whitespace-nowrap">
      {fmtTimeUtc(ms)}
      {local && !compact ? <span className="opacity-75"> ({local.short} your time)</span> : null}
    </time>
  );
}
