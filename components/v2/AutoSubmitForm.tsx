"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type FormEvent } from "react";

// A GET form that resubmits whenever one of its fields changes, including
// fields placed elsewhere on the page with a `form` attribute. Without
// JavaScript it is an ordinary form with an Apply button.
export function AutoSubmitForm({ action, ...props }: ComponentProps<"form"> & { action: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | HTMLSelectElement | null;
      if (t?.form === ref.current && t.type !== "search" && t.type !== "text") ref.current?.requestSubmit();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  // Empty fields are left out so shared links stay short.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) if (typeof v === "string" && v !== "") params.append(k, v);
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action, { scroll: false });
  };
  return <form ref={ref} action={action} onSubmit={onSubmit} {...props} />;
}

// Only needed without JavaScript; hidden once the form submits itself.
export function ApplyButton() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (hydrated) return null;
  return (
    <button type="submit" className="h-10 w-full rounded-[10px] bg-rise font-bold text-background">
      Apply
    </button>
  );
}
