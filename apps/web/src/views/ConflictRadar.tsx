/**
 * Conflict Radar — lists Conflicts (SOLE_DRIVER / RIPPLE_SHIFT /
 * BUFFER_SQUEEZE) with severity and suggested mitigation.
 */
import type { Conflict } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Card, EmptyState } from '../components/ui';
import { formatDayTime } from '../lib/format';

const TYPE_LABEL: Record<string, string> = {
  SOLE_DRIVER: 'Sole driver',
  RIPPLE_SHIFT: 'Ripple shift',
  BUFFER_SQUEEZE: 'Buffer squeeze',
};

const SEVERITY_TONE: Record<string, string> = {
  HIGH: 'red',
  MEDIUM: 'amber',
  LOW: 'slate',
};

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function ConflictRadar({ snapshot }: { snapshot: DashboardSnapshot }) {
  const conflicts = [...snapshot.conflicts].sort(
    (a, b) => SEVERITY_ORDER[a.severity]! - SEVERITY_ORDER[b.severity]!,
  );

  return (
    <Card
      title="Conflict radar"
      subtitle="Scheduling conflicts detected by the planner, with suggested fixes."
    >
      {conflicts.length === 0 ? (
        <EmptyState>No conflicts detected this week.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {conflicts.map((c) => (
            <ConflictRow key={c.id} conflict={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ConflictRow({ conflict: c }: { conflict: Conflict }) {
  const accent =
    c.severity === 'HIGH'
      ? 'border-l-red-500'
      : c.severity === 'MEDIUM'
        ? 'border-l-amber-500'
        : 'border-l-slate-300';
  return (
    <li className={`rounded-lg border border-slate-100 border-l-4 ${accent} p-3`}>
      <div className="flex items-center gap-2">
        <Badge tone={SEVERITY_TONE[c.severity] ?? 'slate'}>{c.severity}</Badge>
        <span className="text-sm font-semibold text-ink">
          {TYPE_LABEL[c.type] ?? c.type}
        </span>
        {c.windowStart && (
          <span className="text-xs text-slate-400">
            {formatDayTime(c.windowStart)}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-slate-700">{c.description}</p>
      <p className="mt-1 text-sm text-slate-500">
        <span className="font-medium text-slate-600">Mitigation:</span>{' '}
        {c.mitigation}
      </p>
    </li>
  );
}
