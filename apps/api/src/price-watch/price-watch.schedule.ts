// When the watch is due, and when it will next be due.
//
// Split out of the service and free of any clock, so the two questions can be asked at a fixed
// instant in a test. The scheduler's whole job is calling them on a timer, and a rule that can only
// be exercised by waiting for a real interval is a rule that is never exercised.
//
// The interesting part is `DAILY`. A time of day is a wall clock in Tehran, and Tehran is not at a
// fixed offset from UTC: it has moved twice in the last six decades and is scheduled to move
// again. So no offset is stored anywhere and none is a constant here — `Intl.DateTimeFormat` is
// asked what the local time in Asia/Tehran is, and the answer is what is compared. That is also why
// `dailyAt` is a string rather than a `DateTime`: a `DateTime` would have to name an instant, and
// an instant is exactly what a daily schedule is not.

/** The wall clock the daily mode means. Never derived from the server's own timezone. */
export const PRICE_WATCH_TZ = "Asia/Tehran";

/** A `HH:mm` time of day, Tehran. */
export type DailyAt = string;

export interface PriceWatchSchedule {
  mode: "INTERVAL" | "DAILY";
  intervalMinutes: number;
  dailyAt: DailyAt | null;
}

const MINUTES_PER_DAY = 24 * 60;
/** Long enough to cover any day, short enough that the bisection below stays cheap. */
const SEARCH_WINDOW_MS = 30 * 60 * 60 * 1000;

/** Is this a well-formed `HH:mm`? A rule the DTO enforces, repeated so a direct caller is refused too. */
export function isDailyAt(value: unknown): value is DailyAt {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Minutes since the Tehran day began, plus that day's serial number.
 *
 * The serial is what makes the number monotone: minutes-of-day alone wraps to zero at midnight, so
 * a search over it would treat the instant after 23:59 as earlier than the instant before, and a
 * daily schedule set to 00:05 would then find its occurrence "already past" and skip a day. The
 * two together increase with time (barring a backward transition, which is checked for below), so
 * a bisection over them answers "the first instant at or after this one whose wall clock is at
 * least the target".
 */
function tehranSerial(at: Date): { day: number; minutes: number; serial: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRICE_WATCH_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  // `hour12: false` renders midnight as "24" in some ICU versions, and 24:00 is not an hour this
  // can do arithmetic with. Folded here rather than trusted, because the alternative is a daily
  // schedule that silently never fires on the one day it should.
  const hour = Number(get("hour")) % 24;
  const day = Math.floor(
    Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))) / 86_400_000,
  );
  const minutes = hour * 60 + Number(get("minute"));
  return { day, minutes, serial: day * MINUTES_PER_DAY + minutes };
}

/**
 * The first instant in `[from, from + SEARCH_WINDOW_MS]` at or after which `serial` reaches
 * `target`, by bisection.
 *
 * Assumes the serial is non-decreasing, which it is except across a backward transition, and the
 * caller verifies the answer's wall clock anyway — so a transition produces a rejected candidate
 * and the next day is tried, rather than a plausible wrong instant.
 */
function firstAtOrAfter(from: Date, target: number): Date {
  let low = from.getTime();
  let high = low + SEARCH_WINDOW_MS;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (tehranSerial(new Date(middle)).serial >= target) high = middle;
    else low = middle + 1;
  }
  return new Date(low);
}

/** Midnight of the Tehran day after the one `at` falls in. */
function startOfNextTehranDay(at: Date): Date {
  const { serial } = tehranSerial(at);
  return firstAtOrAfter(at, (serial - (serial % MINUTES_PER_DAY)) + MINUTES_PER_DAY);
}

/**
 * The next instant a schedule is due, strictly after `from`, or nothing when it cannot say.
 *
 * `null` is the answer for a DAILY schedule with no time set. That is a configuration nobody has
 * filled in rather than one that is off, and the caller treats it as "no run to schedule" — which
 * is the only safe reading, because a daily watch with an unknown time that fired on a default
 * would quietly check prices at an hour nobody chose.
 */
export function computeNextRun(schedule: PriceWatchSchedule, from: Date): Date | null {
  if (schedule.mode === "INTERVAL") {
    // A one-minute floor rather than a refusal: the DTO's own bound is an hour, so a schedule
    // reaching here with less is a caller reaching the service directly, and a watch that fires
    // every zero minutes is a busy loop rather than a schedule.
    const minutes = Math.max(1, Math.floor(schedule.intervalMinutes));
    return new Date(from.getTime() + minutes * 60_000);
  }

  if (!isDailyAt(schedule.dailyAt)) return null;

  const [hours, minutes] = schedule.dailyAt.split(":").map(Number) as [number, number];
  const target = hours * 60 + minutes;
  const now = tehranSerial(from);

  // Up to three Tehran days: today if the time is still ahead, then tomorrow, then the day after.
  // Two would do on an ordinary day; the third is what makes a schedule survive a day on which the
  // target wall clock does not exist because the clocks went forward over it.
  for (let ahead = 0; ahead <= 2; ahead += 1) {
    const dayStart =
      ahead === 0 ? from : startOfNextTehranDay(advanceDays(from, ahead - 1));
    if (ahead === 0 && now.minutes >= target) continue;
    const day = tehranSerial(dayStart).day;
    const candidate = firstAtOrAfter(dayStart, day * MINUTES_PER_DAY + target);
    const found = tehranSerial(candidate);
    // The wall clock is re-read rather than assumed: the bisection bounds the instant, and only this
    // says the instant is the one that was asked for.
    if (found.day === day && found.minutes === target) return candidate;
  }
  return null;
}

/** The `at`-th Tehran day boundary after the one `at` falls in, one boundary at a time. */
function advanceDays(at: Date, times: number): Date {
  let day = at;
  for (let step = 0; step < times; step += 1) day = startOfNextTehranDay(day);
  return day;
}

/**
 * Is a schedule due at `at`?
 *
 * A watch with no `nextRunAt` has never been scheduled, so it is not due: the first run is
 * `lastRunAt + interval` (or the next daily occurrence), and a watch enabled at three in the
 * afternoon with an empty schedule must not launch a fetch the moment it is switched on. The
 * scheduler writes `nextRunAt` when the configuration is saved and after every run, and this reads
 * it — so a row that was written by hand, or by an older version, simply does not fire rather than
 * firing on every tick.
 */
export function isDue(nextRunAt: Date | null | undefined, at: Date): boolean {
  return nextRunAt instanceof Date && Number.isFinite(nextRunAt.getTime()) && nextRunAt.getTime() <= at.getTime();
}
