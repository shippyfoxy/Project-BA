import { genreStyle } from "@/lib/trends/genres";

export function GenreChip({ genre }: { genre: string }) {
  const g = genreStyle(genre);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `${g.color}29` }}
    >
      <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: g.color }} />
      {g.short}
    </span>
  );
}
