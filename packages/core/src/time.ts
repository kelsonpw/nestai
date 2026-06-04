/**
 * Shared time helpers.
 *
 * Everything in @nestai/core is deterministic and time-injectable: callers
 * pass `now` (a `Date` or ISO string) rather than the logic reaching for
 * `Date.now()`. These helpers normalize that input and provide a handful of
 * small, pure date utilities used across modules.
 */

/** A point in time accepted by core functions: a `Date` or an ISO-8601 string. */
export type Clock = Date | string;

/** Coerce a {@link Clock} into a `Date`, throwing on invalid input. */
export function toDate(clock: Clock): Date {
  const d = typeof clock === 'string' ? new Date(clock) : clock;
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date input: ${String(clock)}`);
  }
  return d;
}

/** Coerce a {@link Clock} into an ISO-8601 string. */
export function toIso(clock: Clock): string {
  return toDate(clock).toISOString();
}

/** Add (or subtract, with a negative value) whole minutes to a clock. */
export function addMinutes(clock: Clock, minutes: number): Date {
  return new Date(toDate(clock).getTime() + minutes * 60_000);
}

/** Add (or subtract) whole days to a clock. */
export function addDays(clock: Clock, days: number): Date {
  return new Date(toDate(clock).getTime() + days * 86_400_000);
}

/** Difference, `a - b`, expressed in whole (floored) minutes. */
export function diffMinutes(a: Clock, b: Clock): number {
  return Math.floor((toDate(a).getTime() - toDate(b).getTime()) / 60_000);
}

/** True when `t` is within the inclusive `[start, end]` window. */
export function isWithin(t: Clock, start: Clock, end: Clock): boolean {
  const ms = toDate(t).getTime();
  return ms >= toDate(start).getTime() && ms <= toDate(end).getTime();
}

/** True when windows `[aStart,aEnd]` and `[bStart,bEnd]` overlap at all. */
export function windowsOverlap(
  aStart: Clock,
  aEnd: Clock,
  bStart: Clock,
  bEnd: Clock,
): boolean {
  return (
    toDate(aStart).getTime() < toDate(bEnd).getTime() &&
    toDate(bStart).getTime() < toDate(aEnd).getTime()
  );
}

/** Clamp a number to the inclusive `[lo, hi]` range. */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
