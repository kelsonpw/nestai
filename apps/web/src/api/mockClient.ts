/**
 * Mock implementation of {@link NestApiClient}, backed by in-repo fixtures.
 *
 * Holds a single mutable snapshot in memory so mutations (approve/claim/drop/
 * toggle) persist for the life of the page — enabling optimistic-update demos
 * with no backend and no network.
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
import { buildSnapshot } from '../mocks/fixtures';

/** Small artificial latency so optimistic UI is observable in the demo. */
const LATENCY_MS = 150;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockClient(): NestApiClient {
  // One mutable snapshot for the page session.
  const snapshot: DashboardSnapshot = buildSnapshot();

  return {
    async getSnapshot(): Promise<DashboardSnapshot> {
      await delay(LATENCY_MS);
      // Return a defensive copy so callers can't mutate our store directly.
      return structuredClone(snapshot);
    },

    async decideApproval(req: ApprovalDecisionRequest): Promise<Approval> {
      await delay(LATENCY_MS);
      const approval = snapshot.approvals.find((a) => a.id === req.approvalId);
      if (!approval) throw new Error(`Unknown approval: ${req.approvalId}`);
      approval.status = req.decision;
      approval.decidedById = req.decidedById;
      approval.decidedAt = new Date().toISOString();
      approval.updatedAt = approval.decidedAt;
      return structuredClone(approval);
    },

    async claimWindow(windowId: string, memberId: string): Promise<WellnessWindow> {
      await delay(LATENCY_MS);
      const win = snapshot.wellnessWindows.find((w) => w.id === windowId);
      if (!win) throw new Error(`Unknown wellness window: ${windowId}`);
      win.status = 'CLAIMED';
      win.memberId = memberId || win.memberId;
      win.updatedAt = new Date().toISOString();
      return structuredClone(win);
    },

    async claimTask(req: ClaimTaskRequest): Promise<Task> {
      await delay(LATENCY_MS);
      const task = snapshot.tasks.find((t) => t.id === req.taskId);
      if (!task) throw new Error(`Unknown task: ${req.taskId}`);
      task.status = 'CLAIMED';
      task.assignedMemberId = req.memberId;
      task.updatedAt = new Date().toISOString();
      return structuredClone(task);
    },

    async dropTask(req: DropTaskRequest): Promise<Task> {
      await delay(LATENCY_MS);
      const task = snapshot.tasks.find((t) => t.id === req.taskId);
      if (!task) throw new Error(`Unknown task: ${req.taskId}`);
      task.status = 'DROPPED';
      task.assignedMemberId = undefined;
      task.updatedAt = new Date().toISOString();
      return structuredClone(task);
    },

    async toggleSkill(memberId: string, skill: string): Promise<Member> {
      await delay(LATENCY_MS);
      const member = snapshot.members.find((m) => m.id === memberId);
      if (!member) throw new Error(`Unknown member: ${memberId}`);
      const has = member.skills.includes(skill);
      member.skills = has
        ? member.skills.filter((s) => s !== skill)
        : [...member.skills, skill];
      member.updatedAt = new Date().toISOString();
      return structuredClone(member);
    },
  };
}
