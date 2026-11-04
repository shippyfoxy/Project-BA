import { fmtCompact, fmtInt, fmtPct } from "@/lib/format";
import { displayName } from "@/lib/trends/names";
import { escapeXml, type WidgetGame } from "@/lib/trends/widget";

export const SITE = "https://pulse.shipfox.me";

const STAGE_LABEL: Record<string, string> = {
  breakout: "Breakout",
  rising: "Rising",
  peaking: "Peaking",
  cooling: "Cooling",
  fading: "Fading",
  evergreen: "Evergreen",
  steady: "Steady",
};

// ---------- Badge ----------

export const BADGE_METRICS = ["players", "now", "trend"] as const;
export type BadgeMetric = (typeof BADGE_METRICS)[number];

// Rough Verdana 11px advance widths, as badges elsewhere use, so the text
// fits its box without measuring it in a browser.
function textWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    if (/[iljI.,:;|!'’ ]/.test(c)) w += c === " " ? 3.9 : 3.5;
    else if (/[mwMW]/.test(c)) w += 10.5;
    else if (/[A-Z0-9%+−-]/.test(c)) w += 7.4;
    else w += 6.6;
  }
  return Math.ceil(w);
}

export function badgeValue(g: WidgetGame | null, metric: BadgeMetric): { text: string; color: string } {
  if (!g) return { text: "not tracked", color: "#6b7484" };
  if (metric === "now") return g.now === null ? { text: "no reading", color: "#6b7484" } : { text: `${fmtCompact(g.now, 1)} playing`, color: "#2f6bd1" };
  if (metric === "trend") {
    if (g.wowPct === null) return { text: "new", color: "#6b7484" };
    return { text: `${fmtPct(g.wowPct)} this week`, color: g.wowPct >= 0 ? "#2f6bd1" : "#b35514" };
  }
  return g.cur7 === null ? { text: "no readings", color: "#6b7484" } : { text: `${fmtCompact(g.cur7, 1)} players`, color: "#2f6bd1" };
}

export function renderBadge(label: string, value: { text: string; color: string }): string {
  const pad = 6;
  const lw = textWidth(label) + pad * 2;
  const vw = textWidth(value.text) + pad * 2;
  const w = lw + vw;
  const l = escapeXml(label);
  const v = escapeXml(value.text);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${v}"><title>${l}: ${v}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#2b313b"/><rect x="${lw}" width="${vw}" height="20" fill="${value.color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${l}</text><text x="${lw / 2}" y="14">${l}</text>
<text x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${v}</text><text x="${lw + vw / 2}" y="14">${v}</text></g></svg>`;
}

// ---------- Card ----------

export type CardTheme = "light" | "dark" | "auto";

const LIGHT = "--bg:#ffffff;--fg:#12151a;--muted:#5b6472;--line:#dfe3e9;--grid:#eef1f5;--rise:#2f6bd1;--fall:#b35514";
const DARK = "--bg:#111418;--fg:#e7eaf0;--muted:#8c95a3;--line:#232833;--grid:#1f242d;--rise:#4a8be8;--fall:#d9732c";

function sparkline(days: [number, number][]): string {
  if (days.length < 2) return "";
  const W = 320;
  const H = 56;
  const max = Math.max(...days.map((d) => d[1]), 1);
  const t0 = days[0][0];
  const span = Math.max(days[days.length - 1][0] - t0, 1);
  const pts = days.map(([t, v]) => `${(((t - t0) / span) * (W - 4) + 2).toFixed(1)},${(H - 3 - (v / max) * (H - 8)).toFixed(1)}`);
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")} ${W - 2},${H} 2,${H}" fill="var(--rise)" fill-opacity=".12" stroke="none"/><polyline points="${pts.join(" ")}" fill="none" stroke="var(--rise)" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

export function renderCard(g: WidgetGame | null, theme: CardTheme, iconUrl: string | null): string {
  const vars = theme === "light" ? `:root{${LIGHT}}` : theme === "dark" ? `:root{${DARK}}` : `:root{${LIGHT}}@media (prefers-color-scheme: dark){:root{${DARK}}}`;
  const body = !g
    ? `<p class="muted">This game isn&#39;t tracked by Roblox Pulse yet.</p>`
    : (() => {
        const name = escapeXml(displayName(g.name));
        const href = `${SITE}/games/${g.universeId}?ref=embed`;
        const wow =
          g.wowPct === null ? "" : `<span class="${g.wowPct >= 0 ? "up" : "down"}">${escapeXml(fmtPct(g.wowPct))} on last week</span>`;
        return `<a class="head" href="${href}" target="_blank" rel="noopener">
${iconUrl ? `<img src="${escapeXml(iconUrl)}" alt="" width="40" height="40">` : `<span class="ph"></span>`}
<span class="title"><strong>${name}</strong><span class="muted">${escapeXml(g.genre)}${g.stage ? ` · ${STAGE_LABEL[g.stage]}` : ""}</span></span></a>
<div class="stats"><div><span class="big">${g.cur7 === null ? "—" : escapeXml(fmtInt(g.cur7))}</span><span class="muted">7-day average players</span></div>
<div><span class="big">${g.now === null ? "—" : escapeXml(fmtInt(g.now))}</span><span class="muted">latest reading</span></div></div>
<div class="spark">${sparkline(g.days)}</div>
<div class="foot">${wow}<span class="muted">last 30 days</span></div>`;
      })();
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${g ? escapeXml(displayName(g.name)) : "Game"}: Roblox Pulse</title>
<style>${vars}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg);background:var(--bg);display:flex}
.card{flex:1;display:flex;flex-direction:column;gap:10px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;min-width:0}
a{color:inherit;text-decoration:none}.head{display:flex;gap:10px;align-items:center;min-width:0}
.head img,.ph{width:40px;height:40px;border-radius:9px;flex:none;background:var(--grid)}
.title{display:flex;flex-direction:column;min-width:0}.title strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px}
.head:hover strong{text-decoration:underline}.muted{color:var(--muted);font-size:12px}
.stats{display:flex;gap:20px}.stats div{display:flex;flex-direction:column}.big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.spark{height:56px}.spark svg{display:block;width:100%;height:100%}
.foot{display:flex;justify-content:space-between;gap:8px;font-size:12px}.up{color:var(--rise);font-weight:600}.down{color:var(--fall);font-weight:600}
.brand{margin-left:auto;color:var(--muted);font-size:11px}.brand:hover{color:var(--fg)}
</style></head><body><div class="card">${body}
<a class="brand" href="${SITE}/?ref=embed" target="_blank" rel="noopener">Roblox Pulse · estimates from public data</a></div></body></html>`;
}
