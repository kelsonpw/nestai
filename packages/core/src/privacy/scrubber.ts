/**
 * PII / corporate scrubber.
 *
 * Deterministic, regex-based tokenization of sensitive values before any text
 * is handed to an LLM provider. Produces `{ scrubbedText, tokenMap }` and an
 * `unscrub()` that restores the original text from a token map.
 *
 * Token placeholders follow the form `[TYPE_n]` (1-indexed per type), e.g.
 * `[ADDRESS_1]`, `[PHONE_2]`. Identical original values reuse the same token so
 * the scrub is stable and round-trips exactly.
 */
import type { PiiToken, PiiTokenType } from '@nestai/contracts';

export interface ScrubResult {
  /** Text safe to hand to an LLM, with sensitive spans replaced by tokens. */
  scrubbedText: string;
  /** Placeholder -> original mapping produced by the scrub. */
  tokenMap: PiiToken[];
}

interface Rule {
  type: PiiTokenType;
  regex: RegExp;
}

/**
 * Ordered scrub rules. Order matters: more specific / structured patterns
 * (SSN, email) run before looser ones (phone, financial) to avoid a greedy
 * pattern swallowing a value another rule should own.
 */
const RULES: Rule[] = [
  // Email: user@host.tld
  {
    type: 'EMAIL',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  // US SSN: 123-45-6789 (also bare 9-digit not adjacent to other digits)
  {
    type: 'SSN',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  // Financial figures: $1,234.56 / $1200 / USD 500
  {
    type: 'FINANCIAL',
    regex: /(?:\$|USD\s?)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g,
  },
  // Phone: +1 (555) 123-4567, 555-123-4567, 555.123.4567, 5551234567
  {
    type: 'PHONE',
    regex:
      /(?<!\d)(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
  },
  // Street address: "123 Main St", "45 Oak Avenue Apt 2"
  {
    type: 'ADDRESS',
    regex:
      /\b\d{1,6}\s+(?:[A-Z][a-zA-Z]*\.?\s){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter)\b(?:\s+(?:Apt|Suite|Ste|Unit|#)\s?\w+)?/g,
  },
  // Corporate markers: well-known corporate suffixes / logo references.
  {
    type: 'CORP_LOGO',
    regex:
      /\b[A-Z][A-Za-z0-9&'-]*(?:\s+[A-Z][A-Za-z0-9&'-]*){0,3}\s+(?:Inc|LLC|Ltd|Corp|Corporation|Co|GmbH|PLC)\b\.?/g,
  },
];

/**
 * Scrub PII and corporate markers from `text`.
 *
 * @param text   Raw inbound text.
 * @param opts.keepOriginals When true (default), the returned token map carries
 *   the `original` value so {@link unscrub} can restore it. Set false to drop
 *   originals for stricter retention policies (round-trip then unavailable).
 */
export function scrub(
  text: string,
  opts: { keepOriginals?: boolean } = {},
): ScrubResult {
  const keepOriginals = opts.keepOriginals ?? true;
  // original-value -> token, so repeats reuse a token deterministically.
  const byOriginal = new Map<string, PiiToken>();
  const counters: Partial<Record<PiiTokenType, number>> = {};
  let out = text;

  for (const rule of RULES) {
    out = out.replace(rule.regex, (match) => {
      const key = `${rule.type}::${match}`;
      const existing = byOriginal.get(key);
      if (existing) return existing.token;
      const n = (counters[rule.type] ?? 0) + 1;
      counters[rule.type] = n;
      const token = `[${rule.type}_${n}]`;
      const entry: PiiToken = keepOriginals
        ? { token, type: rule.type, original: match }
        : { token, type: rule.type };
      byOriginal.set(key, entry);
      return token;
    });
  }

  return { scrubbedText: out, tokenMap: [...byOriginal.values()] };
}

/**
 * Restore original values into `scrubbedText` using a token map. Only tokens
 * whose entries retained an `original` are substituted; others are left as-is.
 *
 * Tokens are replaced longest-first so e.g. `[PHONE_12]` is not partially
 * matched by the `[PHONE_1]` replacement.
 */
export function unscrub(scrubbedText: string, tokenMap: PiiToken[]): string {
  const restorable = tokenMap
    .filter((t): t is PiiToken & { original: string } => t.original != null)
    .sort((a, b) => b.token.length - a.token.length);
  let out = scrubbedText;
  for (const { token, original } of restorable) {
    out = out.split(token).join(original);
  }
  return out;
}
