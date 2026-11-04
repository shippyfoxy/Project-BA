"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ProStar } from "@/components/pro/Pro";

const NAV = [
  { href: "/", label: "Trends" },
  { href: "/explore", label: "Explore" },
  { href: "/revenue", label: "Revenue", pro: true },
  { href: "/compare", label: "Compare" },
  { href: "/launches", label: "Launches" },
  { href: "/ideas", label: "Ideas" },
  { href: "/genres", label: "Genres" },
  { href: "/updates", label: "Updates" },
  { href: "/api", label: "API" },
];

export function MainNav() {
  const path = usePathname();
  // Game and stage pages sit under Trends.
  const ref = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/games") || path.startsWith("/stages") : path.startsWith(href));
  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-2 text-sm font-medium md:-mx-6 md:w-[calc(100%+3rem)] md:px-6 lg:mx-0 lg:w-auto lg:min-w-0 lg:flex-1 lg:justify-center lg:px-0 lg:pb-0"
    >
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? "page" : undefined}
          className={`shrink-0 whitespace-nowrap rounded-[10px] px-3 py-2 lg:px-2.5 xl:px-3 ${active(n.href) ? "bg-secondary text-foreground" : "text-text-2 hover:bg-secondary hover:text-foreground"}`}
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
