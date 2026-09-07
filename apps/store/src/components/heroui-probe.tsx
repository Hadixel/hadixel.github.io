"use client";

// TEMPORARY Phase-0 probe — proves HeroUI mounts and the Showcase theme maps
// (primary button background must resolve to flame #1d4ed8). Removed in
// Phase 1; not part of any surface.
import { useState } from "react";
import { Button } from "@heroui/react";

export function HeroProbe() {
  const [clicked, setClicked] = useState(false);
  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-4" data-testid="heroui-probe">
      <Button onPress={() => setClicked(true)}>
        {clicked ? "HeroUI وصل است ✓" : "بررسی HeroUI"}
      </Button>
    </div>
  );
}
