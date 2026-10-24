interface Props {
  values: number[];
  tone: "rise" | "fall";
  label: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, tone, label, width = 96, height = 28 }: Props) {
  if (values.length < 2) {
    return <span className="text-xs text-muted-foreground">new</span>;
  }
  const max = Math.max(...values);
  const pad = 2;
  const pts = values
    .map((v, i) => {
      const x = (i * width) / (values.length - 1);
      const y = height - pad - (max > 0 ? (v / max) * (height - 2 * pad) : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={tone === "rise" ? "var(--rise)" : "var(--fall)"}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
