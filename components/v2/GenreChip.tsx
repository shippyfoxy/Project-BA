import Link from "next/link";
import { genreColor } from "@/lib/trends/genres";

export const genreHref = (genre: string) => `/genres/${encodeURIComponent(genre)}`;

// `link` makes the chip open the genre's page; leave it off where the chip
// already sits inside another link, such as a whole game row.
export function GenreChip({ genre, link = false }: { genre: string; link?: boolean }) {
  const color = genreColor(genre);
  const className = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";
  const body = (
    <>
      <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ background: color }} />
      {genre}
    </>
  );
  return link && genre !== "Other" ? (
    <Link href={genreHref(genre)} className={`${className} hover:underline`} style={{ background: `${color}29` }}>
      {body}
    </Link>
  ) : (
    <span className={className} style={{ background: `${color}29` }}>
      {body}
    </span>
  );
}
