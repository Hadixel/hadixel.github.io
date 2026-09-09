"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import MobileSearchModal from "./mobile-search-modal";

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
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
      <Button
        isIconOnly
        variant="ghost"
        aria-label="جستجو"
        onPress={() => setOpen(true)}
        className="md:hidden"
      >
        <SearchIcon />
      </Button>
      <MobileSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
