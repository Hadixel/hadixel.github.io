"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Popover } from "@heroui/react";
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
 * SearchBar — Digikala-style prominent search field (desktop ≥ md): a HeroUI
 * Input whose suggestion panel is hosted in a controlled HeroUI Popover
 * anchored to the field wrapper (live results / recent / hot / banner).
 *
 * The Popover runs non-modal (HeroUI's own ComboBox does the same): no veil,
 * no focus move, no scroll lock — typing keeps working and the already-focused
 * field reopens the panel on press (d3d640f). React Aria disables interact-
 * outside dismissal for non-modal popovers, so outside press and Escape are
 * wired here: mousedown outside the field and the portalled panel closes it;
 * Escape closes from the input (its keydown never reaches the popover).
 */
export default function SearchBar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (wrapRef.current?.contains(el) || panelRef.current?.contains(el)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="relative hidden md:block" ref={wrapRef}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onMouseDown={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && q.trim()) {
            submitListing(router, q);
            setOpen(false);
          }
        }}
        type="search"
        placeholder="جستجو در همه کالاها"
        aria-label="جستجو در همه کالاها"
        className="h-11 w-[420px] rounded-card border border-transparent bg-plaster pr-4 pl-12 text-sm text-ink shadow-none outline-none placeholder:text-ash focus:border-fog focus:bg-canvas focus:shadow-none lg:w-[480px]"
      />
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        aria-label="جستجو"
        onPress={() => { if (q.trim()) { submitListing(router, q); setOpen(false); } }}
        className="absolute inset-y-0 left-2 my-auto"
      >
        <SearchIcon />
      </Button>

      <Popover isOpen={open} onOpenChange={setOpen}>
        <Popover.Content
          ref={panelRef}
          triggerRef={wrapRef}
          isNonModal
          placement="bottom end"
          offset={8}
          className="w-[460px] rounded-card p-4 lg:w-[520px]"
        >
          <SearchSuggestions query={q} onNavigate={() => setOpen(false)} />
        </Popover.Content>
      </Popover>
    </div>
  );
}
