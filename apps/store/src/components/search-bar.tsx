"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitListing } from "@/lib/search-nav";
import SearchSuggestions from "./search-suggestions";

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/*
 * SearchBar — Digikala-style prominent search field (desktop ≥ md): opens a
 * suggestion panel below the input (live results / recent / hot / banner).
 * Panel closes on outside click and Escape; Enter submits to the listing.
 */
export default function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative hidden md:block" onMouseDown={() => setOpen(true)}>
      <div className={`flex h-11 w-[420px] lg:w-[480px] items-center gap-2 rounded-card border bg-plaster px-3 transition-colors ${open ? "border-fog bg-canvas" : "border-transparent"}`}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              submitListing(router, q);
              setOpen(false);
            }
          }}
          type="search"
          placeholder="جستجو در همه کالاها"
          aria-label="جستجو در همه کالاها"
          className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ash"
        />
        <button
          type="button"
          aria-label="جستجو"
          onClick={() => { if (q.trim()) { submitListing(router, q); setOpen(false); } }}
          className="flex size-8 items-center justify-center rounded-card text-ink hover:bg-plaster"
        >
          <SearchIcon />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-2 w-[460px] lg:w-[520px] rounded-card border border-plaster bg-canvas p-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
          <SearchSuggestions query={q} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
