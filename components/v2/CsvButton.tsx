"use client";

// Downloads the table with id `table` as it is shown, so every export matches the
// page exactly. Screen-reader-only text and buttons are left out.
export function CsvButton({ table, file }: { table: string; file: string }) {
  function download() {
    const el = document.getElementById(table);
    if (!el) return;
    const cell = (c: Element) => {
      const copy = c.cloneNode(true) as Element;
      copy.querySelectorAll(".sr-only, button, svg").forEach((x) => x.remove());
      const t = (copy.textContent ?? "").replace(/\s+/g, " ").trim().replace(/−/g, "-");
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lines = [...el.querySelectorAll("tr")].map((r) => [...r.children].map(cell).join(","));
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${file}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={download} className="text-[13px] text-link hover:underline">
      Download CSV
    </button>
  );
}
