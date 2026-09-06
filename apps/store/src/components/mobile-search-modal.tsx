"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitListing } from "@/lib/search-nav";
import SearchSuggestions from "./search-suggestions";

/*
 * Mobile search — icon opens an overlay card with the shared suggestion
 * panel (live results / recent / hot / banner). Autofocused input; Enter
 * submits to the listing; Escape and backdrop close.
 */
export default function MobileSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setQ("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={onClose} role="dialog" aria-modal="true" aria-label="جستجو">
      <div className="mx-4 mt-4 rounded-card border border-plaster bg-canvas p-4 shadow-[0_8px_24px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) {
                submitListing(router, q);
                onClose();
              }
            }}
            type="search"
            placeholder="جستجو در همه کالاها"
            aria-label="جستجو در همه کالاها"
            className="h-11 flex-1 rounded-card border border-transparent bg-plaster px-4 text-sm text-ink outline-none placeholder:text-ash focus:border-fog focus:bg-canvas"
          />
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-card p-2 text-ash hover:bg-plaster hover:text-ink">✕</button>
        </div>
        <div className="mt-3 max-h-[65vh] overflow-y-auto">
          <SearchSuggestions query={q} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
