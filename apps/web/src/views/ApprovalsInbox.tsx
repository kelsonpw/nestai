/**
 * Approvals Inbox — pending Approvals (permission slips, fees, quotes) with
 * Approve / Reject buttons wired to the mock client (optimistic update).
 */
import type { Approval } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Button, Card, EmptyState } from '../components/ui';
import { currency, formatDayTime, memberName } from '../lib/format';
import { useDecideApproval } from '../lib/queries';

const REASON_LABEL: Record<string, string> = {
  PERMISSION_SLIP: 'Permission slip',
  FEE: 'Fee',
  QUOTE: 'Quote',
  ASSIGNMENT: 'Assignment',
  OTHER: 'Other',
};

const STATUS_TONE: Record<string, string> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'slate',
};

export function ApprovalsInbox({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { approvals, members, tasks } = snapshot;
  const decide = useDecideApproval();
  // A demo "current decider" — the first head of household.
  const deciderId =
    members.find((m) => m.role === 'HEAD')?.id ?? members[0]?.id ?? '';

  const pending = approvals.filter((a) => a.status === 'PENDING');
  const decided = approvals.filter((a) => a.status !== 'PENDING');

  const taskTitle = (taskId: string) =>
    tasks.find((t) => t.id === taskId)?.title ?? taskId;

  const renderRow = (a: Approval) => (
    <li
      key={a.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-4 py-3"
    >
      <div>
        <div className="flex items-center gap-2">
          <Badge tone="blue">{REASON_LABEL[a.reason] ?? a.reason}</Badge>
          {a.amount != null && (
            <span className="text-sm font-semibold text-ink">
              {currency(a.amount)}
            </span>
          )}
          <Badge tone={STATUS_TONE[a.status] ?? 'slate'}>{a.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-ink">{taskTitle(a.taskId)}</p>
        <p className="text-xs text-slate-500">
          Requested by {memberName(members, a.requestedById)}
          {a.decidedAt && ` · decided ${formatDayTime(a.decidedAt)}`}
        </p>
      </div>
      {a.status === 'PENDING' && (
        <div className="flex gap-2">
          <Button
            variant="success"
            onClick={() =>
              decide.mutate({
                approvalId: a.id,
                decidedById: deciderId,
                decision: 'APPROVED',
              })
            }
          >
            Approve
          </Button>
          <Button
            variant="danger"
            onClick={() =>
              decide.mutate({
                approvalId: a.id,
                decidedById: deciderId,
                decision: 'REJECTED',
              })
            }
          >
            Reject
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <Card
        title="Approvals inbox"
        subtitle="Permission slips, fees and quotes awaiting a head-of-household decision."
      >
        {pending.length === 0 ? (
          <EmptyState>No pending approvals. You&apos;re all caught up.</EmptyState>
        ) : (
          <ul className="space-y-2">{pending.map(renderRow)}</ul>
        )}
      </Card>

      {decided.length > 0 && (
        <Card title="Recently decided">
          <ul className="space-y-2">{decided.map(renderRow)}</ul>
        </Card>
      )}
    </div>
  );
}
