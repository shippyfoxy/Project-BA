"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ProStar } from "@/components/pro/Pro";

interface Item {
  href: string;
  label: string;
  pro?: boolean;
  children?: { href: string; label: string }[];
}

// Six sections; Build and Data open a second row with their pages. Every
// page keeps its own address, so links from elsewhere never break.
const NAV: Item[] = [
  { href: "/", label: "Trends" },
  { href: "/explore", label: "Explore" },
  { href: "/genres", label: "Genres" },
  { href: "/revenue", label: "Revenue", pro: true },
  {
    href: "/ideas",
    label: "Build",
    children: [
      { href: "/ideas", label: "Ideas" },
      { href: "/launches", label: "Launches" },
      { href: "/updates", label: "Updates" },
      { href: "/compare", label: "Compare" },
      { href: "/studios", label: "Studios" },
      { href: "/passes", label: "Game passes" },
      { href: "/watch", label: "Watchlist" },
    ],
  },
  {
    href: "/api",
    label: "Data",
    children: [
      { href: "/api", label: "API" },
      { href: "/widgets", label: "Widgets and RSS" },
      { href: "/methodology", label: "How we measure" },
    ],
  },
];

const on = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

// Game and stage pages sit under Trends.
function sectionOf(path: string): Item | undefined {
  if (path.startsWith("/games") || path.startsWith("/stages")) return NAV[0];
  return NAV.find((n) => (n.children ? n.children.some((c) => on(path, c.href)) : on(path, n.href)));
}

function useKeepCurrentInView(path: string) {
  const ref = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways; keep the current one in view.
  useEffect(() => {
    ref.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);
  return ref;
}

const tab = (current: boolean) =>
  `shrink-0 whitespace-nowrap rounded-[10px] px-3 py-2 ${current ? "bg-secondary text-foreground" : "text-text-2 hover:bg-secondary hover:text-foreground"}`;

export function MainNav() {
  const path = usePathname();
  const ref = useKeepCurrentInView(path);
  const section = sectionOf(path);
  return (
    <nav
      ref={ref}
      aria-label="Main"
      className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-4 pb-2 text-sm font-medium md:-mx-6 md:w-[calc(100%+3rem)] md:px-6 lg:mx-0 lg:w-auto lg:min-w-0 lg:flex-1 lg:justify-center lg:px-0 lg:pb-0"
    >
      {NAV.map((n) => (
        <Link key={n.label} href={n.href} aria-current={section === n ? "page" : undefined} className={tab(section === n)}>
          <span className="inline-flex items-center gap-1.5">
            {n.label}
            {n.pro ? <ProStar /> : null}
          </span>
        </Link>
      ))}
    </nav>
  );
}

// The pages of the current section, under the header, for sections that have several.
export function SectionNav() {
  const path = usePathname();
  const ref = useKeepCurrentInView(path);
  const section = sectionOf(path);
  if (!section?.children) return null;
  return (
    <div className="border-t border-border">
      <nav
        ref={ref}
        aria-label={section.label}
        className="no-scrollbar mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-1.5 text-[13px] font-medium md:px-6"
      >
        {section.children.map((c) => (
          <Link key={c.href} href={c.href} aria-current={on(path, c.href) ? "page" : undefined} className={tab(on(path, c.href)).replace("py-2", "py-1.5")}>
            {c.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
