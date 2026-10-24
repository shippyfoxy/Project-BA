import Image from "next/image";

interface Props {
  url: string | undefined;
  name: string;
  size: number;
  ring?: string;
}

// Icons are decorative (the name is always shown beside them), so alt is empty.
// unoptimized: Roblox already serves small PNGs, and it keeps the site clear of
// Vercel's image-optimisation quota.
export function GameIcon({ url, name, size, ring }: Props) {
  const style = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.22),
    boxShadow: ring ? `0 0 0 3px ${ring}` : undefined,
  };
  if (!url) {
    return (
      <span
        aria-hidden="true"
        className="inline-flex shrink-0 items-center justify-center bg-secondary font-heading font-bold text-text-2"
        style={{ ...style, fontSize: Math.round(size * 0.42) }}
      >
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return <Image src={url} alt="" width={size} height={size} unoptimized className="shrink-0 object-cover" style={style} />;
}
