"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProStar } from "@/components/pro/Pro";

const NAV = [
  { href: "/", label: "Trends" },
  { href: "/explore", label: "Explore" },
  { href: "/revenue", label: "Revenue", pro: true },
  { href: "/compare", label: "Compare" },
  { href: "/genres", label: "Genres" },
  { href: "/api", label: "API" },
];

export function MainNav() {
  const path = usePathname();
  // Game and stage pages sit under Trends.
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/games") || path.startsWith("/stages") : path.startsWith(href));
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1 text-sm font-medium">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={`rounded-[10px] px-3 py-2 ${active(n.href) ? "bg-secondary text-foreground" : "text-text-2 hover:bg-secondary hover:text-foreground"}`}
        >
          <span className="inline-flex items-center gap-1.5">
            {n.label}
            {"pro" in n ? <ProStar /> : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}
