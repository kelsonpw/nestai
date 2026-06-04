/**
 * Household Matrix — a weekly unified calendar, color-coded by member,
 * overlaying Events + assigned Tasks, with the week's maintenance checklist
 * and a wellness "soft layer" (WellnessWindows shown as tentative blocks).
 */
import { useMemo } from 'react';
import type {
  Event,
  Member,
  Task,
  WellnessWindow,
} from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Button, Card, EmptyState } from '../components/ui';
import {
  formatTime,
  memberColorMap,
  memberName,
  NEUTRAL_COLOR,
  type MemberColor,
} from '../lib/format';
import { useClaimWindow } from '../lib/queries';
import { WEEK_START } from '../mocks/fixtures';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dayIndex(iso: string): number {
  const d = new Date(iso);
  const diffMs = d.getTime() - WEEK_START.getTime();
  const idx = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return idx;
}

type Entry =
  | { kind: 'event'; data: Event; color: MemberColor }
  | { kind: 'task'; data: Task; color: MemberColor }
  | { kind: 'wellness'; data: WellnessWindow; color: MemberColor };

function sortByTime(a: Entry, b: Entry): number {
  const ta =
    a.kind === 'event'
      ? a.data.startsAt
      : a.kind === 'wellness'
        ? a.data.startsAt
        : (a.data.dueAt ?? '');
  const tb =
    b.kind === 'event'
      ? b.data.startsAt
      : b.kind === 'wellness'
        ? b.data.startsAt
        : (b.data.dueAt ?? '');
  return ta.localeCompare(tb);
}

export function HouseholdMatrix({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { members, events, tasks, wellnessWindows } = snapshot;
  const colors = useMemo(() => memberColorMap(members), [members]);
  const claimWindow = useClaimWindow();

  const colorFor = (memberId?: string): MemberColor =>
    (memberId && colors[memberId]) || NEUTRAL_COLOR;

  const byDay = useMemo(() => {
    const buckets: Entry[][] = Array.from({ length: 7 }, () => []);
    const push = (idx: number, e: Entry) => {
      if (idx >= 0 && idx < 7) buckets[idx]!.push(e);
    };
    events.forEach((ev) =>
      push(dayIndex(ev.startsAt), {
        kind: 'event',
        data: ev,
        color: colorFor(ev.ownerMemberId),
      }),
    );
    tasks
      .filter((t) => t.dueAt && t.status !== 'DONE' && t.status !== 'DROPPED')
      .forEach((t) =>
        push(dayIndex(t.dueAt!), {
          kind: 'task',
          data: t,
          color: colorFor(t.assignedMemberId),
        }),
      );
    wellnessWindows.forEach((w) =>
      push(dayIndex(w.startsAt), {
        kind: 'wellness',
        data: w,
        color: colorFor(w.memberId),
      }),
    );
    buckets.forEach((b) => b.sort(sortByTime));
    return buckets;
  }, [events, tasks, wellnessWindows, colors]);

  const maintenance = tasks.filter((t) => t.category === 'MAINTENANCE');

  return (
    <div className="space-y-6">
      <Card
        title="Household Matrix"
        subtitle="Unified weekly calendar — events and assigned tasks, color-coded by member, with a wellness soft layer."
        actions={<MemberLegend members={members} colors={colors} />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          {DAY_LABELS.map((label, i) => {
            const date = new Date(WEEK_START);
            date.setDate(date.getDate() + i);
            return (
              <div
                key={label}
                className="rounded-lg border border-slate-200 bg-canvas"
              >
                <div className="flex items-baseline justify-between border-b border-slate-100 px-2 py-1.5">
                  <span className="text-xs font-semibold text-ink">{label}</span>
                  <span className="text-[10px] text-slate-400">
                    {date.getMonth() + 1}/{date.getDate()}
                  </span>
                </div>
                <div className="space-y-1.5 p-2">
                  {byDay[i]!.length === 0 && (
                    <p className="py-2 text-center text-[10px] text-slate-300">
                      —
                    </p>
                  )}
                  {byDay[i]!.map((entry) => (
                    <MatrixEntry
                      key={`${entry.kind}-${entry.data.id}`}
                      entry={entry}
                      members={members}
                      onClaimWindow={(id, memberId) =>
                        claimWindow.mutate({ windowId: id, memberId })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Weekly maintenance checklist"
          subtitle="Recurring upkeep tasks for the household."
        >
          {maintenance.length === 0 ? (
            <EmptyState>No maintenance items this week.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {maintenance.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      readOnly
                      checked={t.status === 'DONE'}
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label={`${t.title} done`}
                    />
                    <span
                      className={
                        t.status === 'DONE'
                          ? 'text-slate-400 line-through'
                          : 'text-ink'
                      }
                    >
                      {t.title}
                    </span>
                  </span>
                  <Badge
                    tone={
                      t.status === 'DONE'
                        ? 'green'
                        : t.status === 'OPEN'
                          ? 'amber'
                          : 'slate'
                    }
                  >
                    {t.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Wellness soft layer"
          subtitle="Tentative windows protecting personal goals — claim to lock them in."
        >
          {wellnessWindows.length === 0 ? (
            <EmptyState>No wellness windows suggested.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {wellnessWindows.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-md border border-dashed border-slate-300 px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="font-medium text-ink">
                      {memberName(members, w.memberId)}
                    </span>
                    <span className="text-slate-500">
                      {' '}
                      · {formatTime(w.startsAt)}–{formatTime(w.endsAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={w.status === 'CLAIMED' ? 'green' : 'violet'}>
                      {w.status}
                    </Badge>
                    {w.status === 'SUGGESTED' && (
                      <Button
                        variant="primary"
                        onClick={() =>
                          claimWindow.mutate({
                            windowId: w.id,
                            memberId: w.memberId,
                          })
                        }
                      >
                        Claim This Window
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MemberLegend({
  members,
  colors,
}: {
  members: Member[];
  colors: Record<string, MemberColor>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => (
        <span key={m.id} className="flex items-center gap-1 text-xs text-slate-600">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              (colors[m.id] ?? NEUTRAL_COLOR).dot
            }`}
          />
          {m.displayName.split(' ')[0]}
        </span>
      ))}
    </div>
  );
}

function MatrixEntry({
  entry,
  members,
  onClaimWindow,
}: {
  entry: Entry;
  members: Member[];
  onClaimWindow: (windowId: string, memberId: string) => void;
}) {
  const { color } = entry;
  if (entry.kind === 'wellness') {
    const w = entry.data;
    return (
      <div
        className={`rounded-md border border-dashed px-2 py-1 ${color.bg} ${color.text} opacity-90`}
        title="Wellness window (tentative)"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium">Wellness</span>
          <span className="text-[10px]">{formatTime(w.startsAt)}</span>
        </div>
        {w.status === 'SUGGESTED' && (
          <button
            type="button"
            onClick={() => onClaimWindow(w.id, w.memberId)}
            className="mt-1 w-full rounded bg-white/70 py-0.5 text-[10px] font-medium hover:bg-white"
          >
            Claim
          </button>
        )}
      </div>
    );
  }

  if (entry.kind === 'event') {
    const ev = entry.data;
    return (
      <div className={`rounded-md px-2 py-1 ${color.bg} ${color.text}`}>
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[11px] font-semibold">{ev.title}</span>
          <span className="shrink-0 text-[10px]">{formatTime(ev.startsAt)}</span>
        </div>
        {ev.ownerMemberId && (
          <span className="text-[10px] opacity-80">
            {memberName(members, ev.ownerMemberId).split(' ')[0]}
          </span>
        )}
      </div>
    );
  }

  const t = entry.data;
  return (
    <div
      className={`rounded-md border-l-2 border-slate-400 px-2 py-1 ${color.bg} ${color.text}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px]">📋 {t.title}</span>
        <span className="shrink-0 text-[10px]">{formatTime(t.dueAt)}</span>
      </div>
      <span className="text-[10px] opacity-80">
        {memberName(members, t.assignedMemberId).split(' ')[0]} · {t.urgency}
      </span>
    </div>
  );
}
