/**
 * Quick actions — one-tap Claim This Window, Drop Task, and Claim (task)
 * buttons wired to the mock client with optimistic updates.
 */
import type { DashboardSnapshot } from '../api';
import { Badge, Button, Card, EmptyState } from '../components/ui';
import { formatDayTime, memberName } from '../lib/format';
import {
  useClaimTask,
  useClaimWindow,
  useDropTask,
} from '../lib/queries';

export function QuickActions({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { tasks, wellnessWindows, members } = snapshot;
  const claimTask = useClaimTask();
  const dropTask = useDropTask();
  const claimWindow = useClaimWindow();

  // A demo "current member" performing the actions — first head of household.
  const meId = members.find((m) => m.role === 'HEAD')?.id ?? members[0]?.id ?? '';

  const openTasks = tasks.filter((t) => t.status === 'OPEN');
  const myTasks = tasks.filter(
    (t) => t.status === 'ASSIGNED' || t.status === 'CLAIMED',
  );
  const suggestedWindows = wellnessWindows.filter(
    (w) => w.status === 'SUGGESTED',
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title="Claim an open task" subtitle="One-tap claim (optimistic).">
        {openTasks.length === 0 ? (
          <EmptyState>No open tasks to claim.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {openTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-ink">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {t.urgency}
                    {t.dueAt && ` · ${formatDayTime(t.dueAt)}`}
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={() =>
                    claimTask.mutate({ taskId: t.id, memberId: meId })
                  }
                >
                  Claim
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Drop a task" subtitle="Decline / un-assign your tasks.">
        {myTasks.length === 0 ? (
          <EmptyState>You have no assigned tasks.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {myTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-ink">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {memberName(members, t.assignedMemberId)} ·{' '}
                    <Badge tone="blue">{t.status}</Badge>
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() =>
                    dropTask.mutate({
                      taskId: t.id,
                      memberId: t.assignedMemberId ?? meId,
                    })
                  }
                >
                  Drop Task
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Claim a wellness window" subtitle="Lock in your soft layer.">
        {suggestedWindows.length === 0 ? (
          <EmptyState>No suggested windows.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {suggestedWindows.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-ink">
                    {memberName(members, w.memberId)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDayTime(w.startsAt)}
                  </p>
                </div>
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
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
