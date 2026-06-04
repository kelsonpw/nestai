/**
 * Balance Battery — a fuel-gauge per adult showing weekly personal-goal
 * completion %, plus a load-asymmetry indicator derived from BalanceBattery /
 * LoadEquity.
 */
import type { BalanceBattery as Battery } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Card, EmptyState } from '../components/ui';
import { memberName } from '../lib/format';

function batteryTone(pct: number): string {
  if (pct >= 67) return 'bg-green-500';
  if (pct >= 34) return 'bg-amber-500';
  return 'bg-red-500';
}

export function BalanceBatteryView({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  const { batteries, loadEquity, members } = snapshot;

  const maxShare = Math.max(0, ...loadEquity.map((l) => l.sharePct));
  const minShare = Math.min(100, ...loadEquity.map((l) => l.sharePct));
  const asymmetry = loadEquity.length >= 2 ? maxShare - minShare : 0;

  return (
    <Card
      title="Balance battery"
      subtitle="Weekly personal-goal completion and household load asymmetry."
    >
      {batteries.length === 0 ? (
        <EmptyState>No battery data.</EmptyState>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {batteries.map((b) => (
              <BatteryGauge
                key={b.memberId}
                battery={b}
                name={memberName(members, b.memberId)}
              />
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-ink">Load asymmetry</p>
              <span
                className={`text-sm font-semibold ${
                  asymmetry >= 20
                    ? 'text-red-600'
                    : asymmetry >= 10
                      ? 'text-amber-600'
                      : 'text-green-600'
                }`}
              >
                {asymmetry} pts apart
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {loadEquity.map((l) => (
                <div key={l.memberId}>
                  <div className="mb-0.5 flex justify-between text-xs text-slate-500">
                    <span>{memberName(members, l.memberId)}</span>
                    <span>
                      {l.sharePct}% · {l.taskLoad} tasks
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${l.sharePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {asymmetry >= 20 && (
              <p className="mt-3 text-xs text-red-600">
                Load is heavily skewed — consider re-routing tasks to even things
                out.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function BatteryGauge({ battery, name }: { battery: Battery; name: string }) {
  const pct = Math.round(battery.goalCompletionPct);
  return (
    <div className="rounded-lg border border-slate-200 p-4" data-testid="battery-gauge">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <span
          className="text-lg font-bold text-ink"
          data-testid="battery-pct"
          aria-label={`${name} goal completion`}
        >
          {pct}%
        </span>
      </div>
      <p className="text-xs text-slate-500">weekly goal completion</p>
      {/* Fuel gauge */}
      <div className="mt-3 flex items-center gap-1">
        <div className="relative h-5 flex-1 overflow-hidden rounded border border-slate-300 bg-slate-50">
          <div
            className={`h-full ${batteryTone(pct)} transition-all`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {/* Battery cap */}
        <span className="h-2.5 w-1 rounded-r bg-slate-300" />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Carrying {Math.round(battery.logisticsLoadPct)}% of logistics load
      </p>
    </div>
  );
}
