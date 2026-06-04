/**
 * Real HTTP implementation of {@link NestApiClient}.
 *
 * This is a thin fetch wrapper pointed at `VITE_API_BASE_URL`. It is NOT wired
 * to a running backend yet — it exists so the app can switch to live data by
 * flipping `VITE_API_MODE=real` once the API package ships.
 */
import type {
  Approval,
  ApprovalDecisionRequest,
  ClaimTaskRequest,
  DropTaskRequest,
  Member,
  Task,
  WellnessWindow,
} from '@nestai/contracts';

import type { DashboardSnapshot, NestApiClient } from './client';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return (await res.json()) as T;
}

export function createRealClient(baseUrl: string): NestApiClient {
  const base = baseUrl.replace(/\/$/, '');

  const post = <T>(path: string, body: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => json<T>(r));

  return {
    getSnapshot: () =>
      fetch(`${base}/api/dashboard/snapshot`).then((r) =>
        json<DashboardSnapshot>(r),
      ),
    decideApproval: (req: ApprovalDecisionRequest) =>
      post<Approval>('/api/approvals/decide', req),
    claimWindow: (windowId: string, memberId: string) =>
      post<WellnessWindow>('/api/wellness/claim', { windowId, memberId }),
    claimTask: (req: ClaimTaskRequest) => post<Task>('/api/tasks/claim', req),
    dropTask: (req: DropTaskRequest) => post<Task>('/api/tasks/drop', req),
    toggleSkill: (memberId: string, skill: string) =>
      post<Member>('/api/members/toggle-skill', { memberId, skill }),
  };
}
