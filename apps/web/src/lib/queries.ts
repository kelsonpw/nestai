/**
 * TanStack Query hooks wrapping the selected API client.
 *
 * The snapshot is the single source of truth for the dashboard; mutations
 * update it optimistically and then reconcile via invalidation.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ApprovalDecisionRequest,
  ClaimTaskRequest,
  DropTaskRequest,
} from '@nestai/contracts';

import { api, type DashboardSnapshot } from '../api';

export const snapshotKey = ['snapshot'] as const;

export function useSnapshot() {
  return useQuery({
    queryKey: snapshotKey,
    queryFn: () => api.getSnapshot(),
  });
}

/** Helper: optimistically patch the cached snapshot, returning a rollback. */
function useSnapshotPatch() {
  const qc = useQueryClient();
  return {
    qc,
    async patch(mutate: (s: DashboardSnapshot) => void) {
      await qc.cancelQueries({ queryKey: snapshotKey });
      const prev = qc.getQueryData<DashboardSnapshot>(snapshotKey);
      if (prev) {
        const next = structuredClone(prev);
        mutate(next);
        qc.setQueryData(snapshotKey, next);
      }
      return prev;
    },
  };
}

export function useDecideApproval() {
  const { qc, patch } = useSnapshotPatch();
  return useMutation({
    mutationFn: (req: ApprovalDecisionRequest) => api.decideApproval(req),
    onMutate: (req) =>
      patch((s) => {
        const a = s.approvals.find((x) => x.id === req.approvalId);
        if (a) {
          a.status = req.decision;
          a.decidedById = req.decidedById;
          a.decidedAt = new Date().toISOString();
        }
      }),
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(snapshotKey, prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}

export function useClaimTask() {
  const { qc, patch } = useSnapshotPatch();
  return useMutation({
    mutationFn: (req: ClaimTaskRequest) => api.claimTask(req),
    onMutate: (req) =>
      patch((s) => {
        const t = s.tasks.find((x) => x.id === req.taskId);
        if (t) {
          t.status = 'CLAIMED';
          t.assignedMemberId = req.memberId;
        }
      }),
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(snapshotKey, prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}

export function useDropTask() {
  const { qc, patch } = useSnapshotPatch();
  return useMutation({
    mutationFn: (req: DropTaskRequest) => api.dropTask(req),
    onMutate: (req) =>
      patch((s) => {
        const t = s.tasks.find((x) => x.id === req.taskId);
        if (t) {
          t.status = 'DROPPED';
          t.assignedMemberId = undefined;
        }
      }),
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(snapshotKey, prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}

export function useClaimWindow() {
  const { qc, patch } = useSnapshotPatch();
  return useMutation({
    mutationFn: (v: { windowId: string; memberId: string }) =>
      api.claimWindow(v.windowId, v.memberId),
    onMutate: (v) =>
      patch((s) => {
        const w = s.wellnessWindows.find((x) => x.id === v.windowId);
        if (w) w.status = 'CLAIMED';
      }),
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(snapshotKey, prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}

export function useToggleSkill() {
  const { qc, patch } = useSnapshotPatch();
  return useMutation({
    mutationFn: (v: { memberId: string; skill: string }) =>
      api.toggleSkill(v.memberId, v.skill),
    onMutate: (v) =>
      patch((s) => {
        const m = s.members.find((x) => x.id === v.memberId);
        if (m) {
          m.skills = m.skills.includes(v.skill)
            ? m.skills.filter((sk) => sk !== v.skill)
            : [...m.skills, v.skill];
        }
      }),
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(snapshotKey, prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: snapshotKey }),
  });
}
