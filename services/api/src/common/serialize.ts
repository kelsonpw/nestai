/**
 * Helpers to bridge Prisma rows (Date objects, Decimal, etc.) and the
 * `@nestai/contracts` entity shapes the core engines consume (ISO strings).
 *
 * Core engines are isomorphic and time-injectable: they accept `Clock` (Date |
 * string) in most places, but entity fields like `Member.birthDate` /
 * `availabilityState` are read directly, so we normalize dates to ISO strings.
 */

/** Recursively convert Date instances to ISO strings (shallow-ish, JSON-safe). */
export function isoify<T>(value: T): T {
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => isoify(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isoify(v);
    }
    return out as T;
  }
  return value;
}
