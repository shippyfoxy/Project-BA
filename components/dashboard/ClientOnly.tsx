"use client";

import { useEffect, useState, type ReactNode } from "react";

// Recharts measures its parent on mount; rendering it during SSR produces
// width(-1) warnings and throws away the first paint anyway. Gate it.
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <>{fallback}</>;
}
