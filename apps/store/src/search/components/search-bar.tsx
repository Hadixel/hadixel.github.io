"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@heroui/react";
import { submitListing } from "@/search/lib/search-nav";
import SearchSuggestions from "@/search/components/search-suggestions";

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/*
 * SearchBar — a controlled, non-modal suggestion panel. The input remains the
 * only visible trigger; keeping the panel as a sibling avoids nesting an input
 * inside a dialog/pressable primitive and preserves keyboard/outside-press
 * behavior.
 */
export default function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative hidden md:block" ref={wrapRef}>
      <div className="relative flex items-center rounded-card border border-flame-200/70 bg-plaster/70 transition-all focus-within:border-flame-500 focus-within:bg-canvas focus-within:ring-2 focus-within:ring-flame-500/30">
        <Input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onFocus={() => setOpen(true)}
          onMouseDown={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && q.trim()) {
              submitListing(router, q);
              setOpen(false);
            }
          }}
          type="search"
          placeholder="جستجو در همه کالاها"
          aria-label="جستجو در همه کالاها"
          aria-expanded={open}
          className="h-11 w-[420px] rounded-card border-0 bg-transparent pr-4 pl-12 text-sm text-ink shadow-none outline-none ring-0 placeholder:text-ash focus:bg-transparent focus:shadow-none focus:ring-0 lg:w-[480px]"
        />
        <Button
          isIconOnly
          variant="ghost"
          size="sm"
          aria-label="جستجو"
          onPress={() => { if (q.trim()) { submitListing(router, q); setOpen(false); } }}
          className="absolute inset-y-0 left-2 my-auto text-flame-600 transition-colors hover:bg-flame-50 hover:text-flame-700"
        >
          <SearchIcon />
        </Button>
      </div>

      {open && (
        <div ref={panelRef} role="region" aria-label="نتایج جستجو" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 w-full rounded-card border border-flame-200/80 bg-canvas p-4 shadow-[var(--overlay-shadow)]">
          <SearchSuggestions query={q} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
