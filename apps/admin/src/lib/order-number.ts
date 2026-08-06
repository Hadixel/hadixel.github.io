import { db } from "@kmodern/db";
import { jalaliYear } from "@kmodern/schema";

// 009: per-Persian-year order numbering — "1404-000123". Counter row is
// upserted per jalaliYear so the sequence resets each Persian New Year.

export async function nextOrderNumber(): Promise<string> {
  const year = jalaliYear();
  const counter = await db().orderNumberCounter.upsert({
    where: { jalaliYear: year },
    update: { lastNumber: { increment: 1 } },
    create: { jalaliYear: year, lastNumber: 1 },
  });
  return `${year}-${String(counter.lastNumber).padStart(6, "0")}`;
}
