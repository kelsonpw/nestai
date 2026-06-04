/** Small presentation helpers shared across views. */
import type { Member } from '@nestai/contracts';

/** Compute integer age from a "YYYY-MM-DD" birth date. */
export function ageFromBirthDate(birthDate?: string): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export interface MemberColor {
  bg: string;
  text: string;
  ring: string;
  dot: string;
}

/** A stable, color-coded palette keyed by member id (deterministic order). */
const PALETTE: MemberColor[] = [
  { bg: 'bg-blue-100', text: 'text-blue-800', ring: 'ring-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-violet-100', text: 'text-violet-800', ring: 'ring-violet-400', dot: 'bg-violet-500' },
  { bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-400', dot: 'bg-green-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', ring: 'ring-amber-400', dot: 'bg-amber-500' },
  { bg: 'bg-rose-100', text: 'text-rose-800', ring: 'ring-rose-400', dot: 'bg-rose-500' },
  { bg: 'bg-teal-100', text: 'text-teal-800', ring: 'ring-teal-400', dot: 'bg-teal-500' },
];

export function memberColorMap(members: Member[]): Record<string, MemberColor> {
  const map: Record<string, MemberColor> = {};
  members.forEach((m, i) => {
    map[m.id] = PALETTE[i % PALETTE.length]!;
  });
  return map;
}

export const NEUTRAL_COLOR: MemberColor = {
  bg: 'bg-slate-100',
  text: 'text-slate-700',
  ring: 'ring-slate-300',
  dot: 'bg-slate-400',
};

export function memberName(members: Member[], id?: string): string {
  if (!id) return 'Unassigned';
  return members.find((m) => m.id === id)?.displayName ?? 'Unknown';
}

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

export function formatTime(iso?: string): string {
  if (!iso) return '';
  return TIME_FMT.format(new Date(iso));
}

export function formatDay(iso?: string): string {
  if (!iso) return '';
  return DAY_FMT.format(new Date(iso));
}

export function formatDayTime(iso?: string): string {
  if (!iso) return '';
  return `${formatDay(iso)}, ${formatTime(iso)}`;
}

export function currency(amount?: number): string {
  if (amount == null) return '';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}
