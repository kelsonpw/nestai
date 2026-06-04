/**
 * Deterministic, dependency-free relative date parsing for the mock LLM
 * provider. Given a reference "now" (ISO string) and a fragment of natural
 * language ("Fri 5pm", "tomorrow", "Saturday", "next week"), produce an ISO
 * datetime. Everything is computed in UTC so output is stable regardless of
 * the host timezone — the mock is a fixture, not a scheduler.
 */

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const WEEKDAY_RE =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i;

/** "5pm", "5:30pm", "17:00", "9 am". Returns {hour, minute} in 24h, or null. */
export function parseClockTime(
  text: string,
): { hour: number; minute: number } | null {
  const m = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m && m[1] && m[3]) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  // 24h "17:00"
  const m24 = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m24 && m24[1] && m24[2]) {
    const hour = parseInt(m24[1], 10);
    const minute = parseInt(m24[2], 10);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

function atTime(base: Date, time: { hour: number; minute: number } | null): Date {
  const d = new Date(base.getTime());
  if (time) {
    d.setUTCHours(time.hour, time.minute, 0, 0);
  } else {
    // Default to 9:00 when no clock time is present.
    d.setUTCHours(9, 0, 0, 0);
  }
  return d;
}

/**
 * Parse a relative date expression against `nowIso`.
 * Returns an ISO-8601 string (UTC, with offset) or null when nothing matched.
 */
export function parseRelativeDate(text: string, nowIso: string): string | null {
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return null;
  const lower = text.toLowerCase();
  const time = parseClockTime(lower);

  if (/\btoday\b/.test(lower)) {
    return atTime(now, time).toISOString();
  }
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
    return atTime(d, time).toISOString();
  }
  if (/\btonight\b/.test(lower)) {
    return atTime(now, time ?? { hour: 19, minute: 0 }).toISOString();
  }

  const wd = lower.match(WEEKDAY_RE);
  if (wd && wd[1]) {
    const target = WEEKDAYS[wd[1].toLowerCase()];
    if (target !== undefined) {
      const isNext = /\bnext\b/.test(lower);
      const current = now.getUTCDay();
      // Days until the upcoming target weekday; 0 means today.
      let delta = (target - current + 7) % 7;
      // "this <weekday>" lands on today when it matches; "next <weekday>"
      // always skips to the following week.
      if (isNext) delta += 7;
      const d = new Date(now.getTime());
      d.setUTCDate(d.getUTCDate() + delta);
      return atTime(d, time).toISOString();
    }
  }

  if (/\bnext week\b/.test(lower)) {
    const d = new Date(now.getTime());
    d.setUTCDate(d.getUTCDate() + 7);
    return atTime(d, time).toISOString();
  }

  // A bare time with no day -> today at that time.
  if (time) {
    return atTime(now, time).toISOString();
  }

  return null;
}
