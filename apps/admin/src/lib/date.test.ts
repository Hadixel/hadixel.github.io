// The `datetime-local` adapters, as the price-watch range uses them.
//
// Two properties, and both are load-bearing rather than incidental: a malformed query value must be
// dropped instead of reaching `toISOString()` (whose `Invalid Date` throws and 500s the whole
// screen), and a wall-clock value must land on the instant the operator meant — Tehran — because the
// gateway refuses anything without a zone and a wrong offset silently moves a finding in or out of
// the range being asked for.

import { describe, expect, it } from "vitest";
import { fromDateTimeLocal, toDateTimeLocal, validDateTimeLocal } from "./date";

describe("validDateTimeLocal", () => {
  it("keeps a value the browser's datetime-local produces", () => {
    expect(validDateTimeLocal("2026-10-01T09:30")).toBe("2026-10-01T09:30");
  });

  it.each([
    undefined,
    "",
    "yesterday",
    "2026-10-01",
    "2026-10-01 09:30",
    "2026-13-45T99:99",
    "2026-10-01T09:30:00",
    "<script>alert(1)</script>",
  ])("drops %j rather than throwing on it", (value) => {
    expect(validDateTimeLocal(value)).toBeNull();
  });

  it("is the shape toDateTimeLocal writes, so a round trip survives", () => {
    const value = toDateTimeLocal(new Date("2026-10-01T09:30:00.000Z"));
    expect(validDateTimeLocal(value)).toBe(value);
  });
});

describe("fromDateTimeLocal", () => {
  it("reads a Tehran wall clock as that clock, not the browser's", () => {
    // 00:00 Tehran is 20:30 the day before in UTC. Getting this wrong moves a finding across
    // midnight, which is exactly where a date range's inclusive/exclusive edge lives.
    expect(fromDateTimeLocal("2026-10-02T00:00").toISOString()).toBe("2026-10-01T20:30:00.000Z");
  });

  it("leaves a value that already carries a zone alone", () => {
    expect(fromDateTimeLocal("2026-10-01T09:30:00Z").toISOString()).toBe("2026-10-01T09:30:00.000Z");
  });
});
