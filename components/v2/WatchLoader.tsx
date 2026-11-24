"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { readWatch, storedQuery } from "./FollowButton";

// /watch without an address: open the list kept in this browser, if any.
export function WatchLoader() {
  const router = useRouter();
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    const q = storedQuery(readWatch());
    if (q) router.replace(`/watch?${q}`);
    else setEmpty(true);
  }, [router]);
  return empty ? (
    <p className="max-w-2xl text-text-2">
      Nothing followed yet. Press Follow on any game, studio or subgenre and it shows up here, with an alert when something changes. The list
      stays in this browser; bookmark this page once it has items, or add its RSS feed to a reader or a Discord or Slack bot.
    </p>
  ) : (
    <p className="text-text-2">Opening your watchlist…</p>
  );
}
