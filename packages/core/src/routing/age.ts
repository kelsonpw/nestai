/**
 * Age computation helper.
 *
 * Pure and time-injected: computes a whole-year age from a `birthDate`
 * ("YYYY-MM-DD") relative to a supplied `now`.
 */
import { toDate, type Clock } from '../time.js';

/**
 * Whole-year age of someone born on `birthDate` as of `now`.
 *
 * Accepts "YYYY-MM-DD" (interpreted at UTC midnight) or a full ISO string.
 * Returns `undefined` for missing/invalid input. Never negative.
 */
export function computeAge(
  birthDate: string | undefined,
  now: Clock,
): number | undefined {
  if (!birthDate) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
    ? `${birthDate}T00:00:00.000Z`
    : birthDate;
  const born = new Date(iso);
  if (Number.isNaN(born.getTime())) return undefined;
  const ref = toDate(now);

  let age = ref.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = ref.getUTCMonth() - born.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}
