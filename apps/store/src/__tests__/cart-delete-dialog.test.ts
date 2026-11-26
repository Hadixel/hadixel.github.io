import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("cart product delete confirmation dialog", () => {
  it("verifies the cart page source wires confirmation dialog components and safety controls", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../app/cart/page.tsx", import.meta.url)),
      "utf8",
    );

    // 1. Imports Radix Dialog primitives from @kmodern/ui
    expect(source).toContain('from "@kmodern/ui"');
    expect(source).toContain("Dialog,");
    expect(source).toContain("DialogContent,");
    expect(source).toContain("DialogHeader,");
    expect(source).toContain("DialogTitle,");
    expect(source).toContain("DialogDescription,");
    expect(source).toContain("DialogClose,");

    // 2. State management for pending deletion
    expect(source).toMatch(/const\s*\[pendingDeleteLine,\s*setPendingDeleteLine\]\s*=\s*useState<Line\s*\|\s*null>\(null\);/);

    // 3. Trash button triggers setPendingDeleteLine(line) instead of immediate delete
    expect(source).toContain("setPendingDeleteLine(line)");

    // 4. Dialog binding
    expect(source).toContain("open={Boolean(pendingDeleteLine)}");
    expect(source).toContain("onOpenChange={(open) => {");
    expect(source).toContain("if (!open) setPendingDeleteLine(null);");

    // 5. Header title and description
    expect(source).toContain("<DialogTitle>حذف کالا از سبد خرید</DialogTitle>");
    expect(source).toContain("آیا از حذف «{pendingDeleteLine?.productName}» از سبد خرید مطمئن هستید؟");

    // 6. Preview and action buttons
    expect(source).toContain("انصراف");
    expect(source).toContain("حذف از سبد خرید");
    expect(source).toContain("bg-red-600 hover:bg-red-700 text-white font-bold rounded-card px-4 py-2.5 transition-colors");

    // 7. Undo snackbar persists
    expect(source).toContain("lastRemoved");
    expect(source).toContain("بازگرداندن");
  });
});
