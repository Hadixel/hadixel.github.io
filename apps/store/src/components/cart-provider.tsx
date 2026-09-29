"use client";


// 011 device cart: localStorage + mirrored into the kmodern_cart cookie for
// server reads at checkout. Items: {variantId, qty}.
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
export interface CartLine {
  variantId: string;
  qty: number;
}

interface CartCtx {
  lines: CartLine[];
  count: number;
  add: (variantId: string, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
}

const Ctx = createContext<CartCtx>({
  lines: [],
  count: 0,
  add: () => {},
  setQty: () => {},
  remove: () => {},
  clear: () => {},
});

const KEY = "kmodern_cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  // persist only after the stored cart is loaded (state, so it batches with
  // the loaded lines — a ref would flip before setLines applies)
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setLines(parsed.filter((l) => l && l.variantId && l.qty > 0));
      }
    } catch {
      /* ignore corrupt cart */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
      document.cookie = `kmodern_cart=${encodeURIComponent(JSON.stringify(lines))};path=/;max-age=2592000;samesite=lax`;
    } catch {
      /* storage full/blocked — cart still works in memory */
    }
  }, [lines, hydrated]);

  const add = useCallback((variantId: string, qty = 1) => {
    setLines((prev) => {
      const found = prev.find((l) => l.variantId === variantId);
      if (found) return prev.map((l) => (l.variantId === variantId ? { ...l, qty: l.qty + qty } : l));
      return [...prev, { variantId, qty }];
    });
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => {
    setLines((prev) => (qty <= 0 ? prev.filter((l) => l.variantId !== variantId) : prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l))));
  }, []);

  const remove = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((l) => l.variantId !== variantId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  return <Ctx.Provider value={{ lines, count, add, setQty, remove, clear }}>{children}</Ctx.Provider>;
}

export function useCart() {
  return useContext(Ctx);
}