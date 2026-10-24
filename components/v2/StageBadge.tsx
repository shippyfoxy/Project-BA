import type { Stage } from "@/lib/trends/stage";

const STAGE_UI: Record<Stage, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  breakout: {
    label: "Breakout",
    color: "#e5b13a",
    bg: "rgba(229,177,58,0.16)",
    icon: <polygon points="6,0.8 7.6,4.3 11.4,4.6 8.5,7.1 9.4,10.9 6,8.9 2.6,10.9 3.5,7.1 0.6,4.6 4.4,4.3" fill="currentColor" />,
  },
  rising: {
    label: "Rising",
    color: "#4a8be8",
    bg: "rgba(74,139,232,0.16)",
    icon: <path d="M2 10 L10 2 M4.5 2 H10 V7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  peaking: {
    label: "Peaking",
    color: "#9085e9",
    bg: "rgba(144,133,233,0.16)",
    icon: <path d="M0.5 10.5 L4.5 3.5 L7 7.5 L8.5 5.5 L11.5 10.5 Z" fill="currentColor" />,
  },
  cooling: {
    label: "Cooling",
    color: "#4fb6c9",
    bg: "rgba(79,182,201,0.16)",
    icon: <path d="M6 1 V11 M1.7 3.5 L10.3 8.5 M1.7 8.5 L10.3 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  },
  fading: {
    label: "Fading",
    color: "#d9732c",
    bg: "rgba(217,115,44,0.16)",
    icon: <path d="M2 2 L10 10 M4.5 10 H10 V4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  },
  evergreen: {
    label: "Evergreen",
    color: "#3fa34d",
    bg: "rgba(63,163,77,0.16)",
    icon: <path d="M1.5 10.5 C1.5 4.5 5.5 1.5 10.5 1.5 C10.5 6.5 7.5 10.5 1.5 10.5 Z M1.5 10.5 L6.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
  },
  steady: {
    label: "Steady",
    color: "#8c95a3",
    bg: "rgba(140,149,163,0.16)",
    icon: <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  },
};

export const stageLabel = (s: Stage) => STAGE_UI[s].label;

export function StageBadge({ stage }: { stage: Stage }) {
  const ui = STAGE_UI[stage];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold text-foreground"
      style={{ background: ui.bg }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ color: ui.color }}>
        {ui.icon}
      </svg>
      {ui.label}
    </span>
  );
}
