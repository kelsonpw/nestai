/**
 * Seasonal Tracker — SeasonalProjects with their milestone timeline
 * (30d / 14d / 48h / 15m lead-time stages).
 */
import type { Milestone, SeasonalProject } from '@nestai/contracts';
import { MilestoneStageValues } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Card, EmptyState } from '../components/ui';
import { formatDay } from '../lib/format';

const STAGE_LABEL: Record<string, string> = {
  PREP_30D: '30d · Prep',
  ASSET_CHECK_14D: '14d · Asset check',
  FINAL_48H: '48h · Final',
  JIT_15M: '15m · Go',
};

const KIND_TONE: Record<string, string> = {
  CAMP: 'green',
  SPORTS: 'blue',
  CAMPSITE: 'amber',
  SKI_TRIP: 'violet',
  TRIP: 'slate',
};

const STATUS_TONE: Record<string, string> = {
  SEARCHING: 'slate',
  TRACKING: 'amber',
  CONFIRMED: 'green',
};

export function SeasonalTracker({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { seasonalProjects, milestones } = snapshot;

  return (
    <Card
      title="Seasonal tracker"
      subtitle="Camps, sports and trips with their lead-time milestone timelines."
    >
      {seasonalProjects.length === 0 ? (
        <EmptyState>No seasonal projects in flight.</EmptyState>
      ) : (
        <div className="space-y-5">
          {seasonalProjects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              milestones={milestones.filter(
                (m) => m.seasonalProjectId === p.id,
              )}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ProjectRow({
  project: p,
  milestones,
}: {
  project: SeasonalProject;
  milestones: Milestone[];
}) {
  const byStage = new Map(milestones.map((m) => [m.stage, m]));
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{p.title}</p>
          {p.targetWindow && (
            <p className="text-xs text-slate-500">
              Target {formatDay(p.targetWindow.start)} –{' '}
              {formatDay(p.targetWindow.end)}
              {p.location && ` · ${p.location.label}`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Badge tone={KIND_TONE[p.kind] ?? 'slate'}>{p.kind}</Badge>
          <Badge tone={STATUS_TONE[p.status] ?? 'slate'}>{p.status}</Badge>
        </div>
      </div>

      {/* Milestone timeline */}
      <ol className="mt-4 grid grid-cols-4 gap-2">
        {MilestoneStageValues.map((stage) => {
          const m = byStage.get(stage);
          return (
            <li
              key={stage}
              className={`rounded-md border p-2 text-center ${
                m?.fired
                  ? 'border-green-300 bg-green-50'
                  : m
                    ? 'border-slate-200 bg-white'
                    : 'border-dashed border-slate-200 bg-slate-50 opacity-60'
              }`}
            >
              <p className="text-[10px] font-semibold text-slate-500">
                {STAGE_LABEL[stage]}
              </p>
              {m ? (
                <>
                  <p className="mt-1 text-[11px] text-ink">{m.content}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {formatDay(m.fireAt)}
                  </p>
                  {m.fired && (
                    <span className="text-[10px] font-medium text-green-600">
                      ✓ fired
                    </span>
                  )}
                </>
              ) : (
                <p className="mt-1 text-[10px] text-slate-300">—</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
