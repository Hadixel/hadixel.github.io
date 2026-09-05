"use client";

import { useState } from "react";
import MobileSearchModal from "./mobile-search-modal";

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/* Mobile search trigger — icon opens the live-results card. Desktop keeps
   its inline input; this is the single search entry on phones. */
export default function MobileSearchButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="جستجو"
        className="flex size-9 items-center justify-center rounded-card text-ink transition-colors hover:bg-plaster md:hidden"
      >
        <SearchIcon />
      </button>
      <MobileSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
