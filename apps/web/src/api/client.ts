/**
 * Typed API client interface for the NestAI dashboard.
 *
 * Two implementations exist:
 *   - `mockClient`  — backed by in-repo fixtures, fully offline (default).
 *   - `realClient`  — points fetch at VITE_API_BASE_URL (stub for now).
 *
 * Selection is driven by `import.meta.env.VITE_API_MODE` (see ./index.ts).
 * Every type flows from `@nestai/contracts` so the UI stays in lock-step
 * with the domain model.
 */
import type {
  Approval,
  ApprovalDecisionRequest,
  BalanceBattery,
  ClaimTaskRequest,
  Conflict,
  DigestPayload,
  DropTaskRequest,
  Event,
  Household,
  LoadEquity,
  Member,
  Milestone,
  RoutingRule,
  SeasonalProject,
  Task,
  WellnessGoal,
  WellnessWindow,
} from '@nestai/contracts';

/** Everything needed to render the dashboard in one shot. */
export interface DashboardSnapshot {
  household: Household;
  members: Member[];
  events: Event[];
  tasks: Task[];
  approvals: Approval[];
  routingRules: RoutingRule[];
  conflicts: Conflict[];
  seasonalProjects: SeasonalProject[];
  milestones: Milestone[];
  wellnessGoals: WellnessGoal[];
  wellnessWindows: WellnessWindow[];
  batteries: BalanceBattery[];
  loadEquity: LoadEquity[];
  digests: DigestPayload[];
}

export interface NestApiClient {
  getSnapshot(): Promise<DashboardSnapshot>;

  /** Approve or reject a pending approval; returns the updated approval. */
  decideApproval(req: ApprovalDecisionRequest): Promise<Approval>;

  /** Claim a wellness window (soft layer); returns the updated window. */
  claimWindow(windowId: string, memberId: string): Promise<WellnessWindow>;

  /** Claim an open/broadcast task; returns the updated task. */
  claimTask(req: ClaimTaskRequest): Promise<Task>;

  /** Drop (decline / un-assign) a task; returns the updated task. */
  dropTask(req: DropTaskRequest): Promise<Task>;

  /** Toggle a skill tag on a member's profile; returns the updated member. */
  toggleSkill(memberId: string, skill: string): Promise<Member>;
}

export type ApiMode = 'mock' | 'real';
