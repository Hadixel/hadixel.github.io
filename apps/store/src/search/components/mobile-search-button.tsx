"use client";

import { useState } from "react";
import MobileSearchModal from "@/search/components/mobile-search-modal";

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/* Mobile search trigger — icon opens the live-results card. Desktop keeps
   its inline input; this is the single search entry on phones. Hand-rolled
   like the account/cart triggers beside it: inside a HeroUI Button the
   `.button svg` rule shrank the icon to 20px while its 36px neighbours kept
   24px, so the row read uneven. Same box, same icon size, same classes. */
export default function MobileSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="جستجو"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster md:hidden"
      >
        <SearchIcon />
      </button>
      <MobileSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
