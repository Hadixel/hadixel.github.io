"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@heroui/react";
import { useRouter } from "next/navigation";
import { submitListing } from "@/search/lib/search-nav";
import SearchSuggestions from "@/search/components/search-suggestions";

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
    <div className="fixed inset-0 z-50 bg-black/45 md:hidden" onClick={onClose} role="dialog" aria-modal="true" aria-label="جستجو">
      <div className="h-full overflow-y-auto bg-canvas px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Input
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
            className="h-11 min-w-0 flex-1 text-sm"
          />
          <Button isIconOnly variant="ghost" aria-label="بستن" onPress={onClose} className="shrink-0">
            ✕
          </Button>
        </div>
        <div className="mt-5 min-h-[60vh] overflow-y-auto pb-8">
          <SearchSuggestions query={q} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
