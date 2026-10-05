// When the watch is due.
//
// These are pure functions over an explicit `from`, so every case is a fixed instant rather than a
// wait. A schedule rule tested by waiting for the interval has a test that is slow when it passes and
// flaky when the machine is loaded, and neither of those is a fact about the rule.
//
// The daily cases go through `Intl` for the same reason the production code does: Tehran is not at a
// fixed offset from UTC, and an assertion that hardcodes `+03:30` would pass today and be wrong the
// next time Iran moves its clocks. So the expectations are stated as wall clocks and read back the
// same way the code computes them, and the assertions that matter are about *which* wall clock the
// answer lands on, not about the number of hours it is offset.

import { describe, expect, it } from "vitest";
import { computeNextRun, isDue, PRICE_WATCH_TZ } from "../src/price-watch/price-watch.schedule.js";

/** The Tehran wall clock of an instant, as `HH:mm`. The same reader the rule uses, deliberately. */
function wallClock(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRICE_WATCH_TZ,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${String(Number(get("hour")) % 24).padStart(2, "0")}:${get("minute")}`;
}

/** The Tehran calendar day of an instant, as `YYYY-MM-DD`. */
function tehranDay(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRICE_WATCH_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** A fixed instant, written in UTC so the expectation does not itself depend on a zone. */
const at = (iso: string) => new Date(iso);

describe("the interval schedule", () => {
  it("is the configured number of minutes after the run it follows", () => {
    const from = at("2026-10-01T09:00:00Z");
    const next = computeNextRun({ mode: "INTERVAL", intervalMinutes: 360, dailyAt: null }, from);
    expect(next?.toISOString()).toBe("2026-10-01T15:00:00.000Z");
  });

  it("ignores a daily time entirely, because the mode says which of the two it is", () => {
    // A watch switched from DAILY to INTERVAL keeps `dailyAt` in the row so switching back does not
    // lose the operator's value. If the interval mode honoured it, every interval run would happen at
    // whatever hour it was switched away from.
    const from = at("2026-10-01T09:00:00Z");
    const next = computeNextRun(
      { mode: "INTERVAL", intervalMinutes: 60, dailyAt: "23:45" },
      from,
    );
    expect(next?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });

  it("never returns the instant it was asked about, so a short interval is a slow loop rather than a busy one", () => {
    const from = at("2026-10-01T09:00:00Z");
    const next = computeNextRun({ mode: "INTERVAL", intervalMinutes: 60, dailyAt: null }, from);
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
  });

  it("floors a zero or negative interval to a minute rather than scheduling the past", () => {
    // The DTO's own bound is an hour, so this is a caller reaching the service directly. A schedule
    // of zero minutes is not a schedule; it is a run per tick, and a negative one is a next run in
    // the past, which `isDue` would treat as due forever.
    const from = at("2026-10-01T09:00:00Z");
    expect(computeNextRun({ mode: "INTERVAL", intervalMinutes: 0, dailyAt: null }, from)?.toISOString())
      .toBe("2026-10-01T09:01:00.000Z");
    expect(computeNextRun({ mode: "INTERVAL", intervalMinutes: -30, dailyAt: null }, from)?.toISOString())
      .toBe("2026-10-01T09:01:00.000Z");
  });
});

describe("the daily schedule", () => {
  it("lands on the requested Tehran wall clock later the same day", () => {
    // 06:00 UTC is 09:30 Tehran, so 10:15 today is ahead of it and the answer is today.
    const from = at("2026-10-01T06:00:00Z");
    const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "10:15" }, from);
    expect(wallClock(next!)).toBe("10:15");
    expect(tehranDay(next!)).toBe(tehranDay(from));
  });

  it("rolls to tomorrow when the time has already passed today", () => {
    // 06:00 UTC is 09:30 Tehran, so 08:00 is behind it and the answer cannot be today.
    const from = at("2026-10-01T06:00:00Z");
    const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "08:00" }, from);
    expect(wallClock(next!)).toBe("08:00");
    expect(tehranDay(next!)).not.toBe(tehranDay(from));
  });

  // The case that a naive implementation gets wrong, and the reason it is written as a search over
  // a monotone serial rather than "today's midnight plus the offset". Minutes-of-day wraps to zero
  // at midnight, so a comparison against it treats 00:05 as *earlier* than 23:55 and a watch set a
  // few minutes after midnight either fires on the wrong day or skips one entirely.
  it("handles a target just after midnight, where the wall clock has wrapped", () => {
    const from = at("2026-10-01T20:30:00Z"); // 00:00 the next Tehran day
    const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "00:05" }, from);
    expect(wallClock(next!)).toBe("00:05");
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
    // Five minutes later, not five *days* later: the target is ahead of now, so it is today.
    expect((next!.getTime() - from.getTime()) / 60_000).toBe(5);
  });

  it("handles a target just before midnight", () => {
    const from = at("2026-10-01T14:00:00Z"); // 17:30 Tehran
    const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "23:55" }, from);
    expect(wallClock(next!)).toBe("23:55");
    expect(tehranDay(next!)).toBe(tehranDay(from));
  });

  it("is exactly one day later when asked at its own wall clock, never zero", () => {
    // 06:15 UTC is 09:45 Tehran; asking for 09:45 with the clock already there is the ambiguous
    // minute. Firing immediately would make the tick run again the instant it finished, so the
    // answer is tomorrow.
    const from = at("2026-10-01T06:15:00Z");
    const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "09:45" }, from);
    expect(wallClock(next!)).toBe("09:45");
    expect(next!.getTime()).toBeGreaterThan(from.getTime());
    expect(tehranDay(next!)).not.toBe(tehranDay(from));
  });

  it("returns nothing when the daily time was never set, rather than guessing an hour", () => {
    // A daily watch with no time is a configuration nobody filled in. Defaulting it would quietly
    // check prices at an hour nobody chose, and the row would read as though they had.
    expect(computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: null }, at("2026-10-01T09:00:00Z")))
      .toBeNull();
    expect(computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "25:00" }, at("2026-10-01T09:00:00Z")))
      .toBeNull();
    expect(computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "" }, at("2026-10-01T09:00:00Z")))
      .toBeNull();
  });

  it("does not depend on the machine's own timezone", () => {
    // The rule reads Asia/Tehran and nothing else. If it ever fell back to the server's zone, this
    // assertion would hold on a machine set to Tehran and fail on every other one — so the guard is
    // that the answer is a Tehran wall clock whatever TZ says.
    const previous = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const utc = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "10:15" }, at("2026-10-01T06:00:00Z"));
      process.env.TZ = "America/New_York";
      const ny = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt: "10:15" }, at("2026-10-01T06:00:00Z"));
      expect(utc?.toISOString()).toBe(ny?.toISOString());
    } finally {
      process.env.TZ = previous;
    }
  });
});

describe("being due", () => {
  const now = at("2026-10-01T09:00:00Z");

  it("is true at the due instant and after it", () => {
    expect(isDue(new Date("2026-10-01T09:00:00Z"), now)).toBe(true);
    expect(isDue(new Date("2026-10-01T08:59:59Z"), now)).toBe(true);
  });

  it("is false before it", () => {
    expect(isDue(new Date("2026-10-01T09:00:01Z"), now)).toBe(false);
  });

  // A watch that was enabled and has never been scheduled is the case a "null means due" rule gets
  // wrong in the loudest way: every tick from the moment the operator switched it on.
  it("is false when nothing has been scheduled yet", () => {
    expect(isDue(null, now)).toBe(false);
    expect(isDue(undefined, now)).toBe(false);
  });

  it("is false for an unschedulable date rather than treating it as due forever", () => {
    expect(isDue(new Date("not a date"), now)).toBe(false);
  });
});

describe("the two together", () => {
  it("does not return an instant that isDue would refuse", () => {
    // The property that matters and the reason the daily rule verifies its own answer: a schedule
    // that produced a non-date, or one in the past, would be a watch that either never fires or
    // fires on every tick.
    for (const from of ["2026-10-01T00:00:01Z", "2026-10-01T20:30:00Z", "2026-03-21T21:00:00Z"]) {
      for (const dailyAt of ["00:00", "00:05", "09:45", "23:55"]) {
        const start = at(from);
        const next = computeNextRun({ mode: "DAILY", intervalMinutes: 360, dailyAt }, start);
        expect(next).toBeInstanceOf(Date);
        expect(Number.isNaN(next!.getTime())).toBe(false);
        expect(isDue(next, start)).toBe(false);
      }
    }
  });
});
