/**
 * App shell: top nav + routed views. The dashboard snapshot is fetched once
 * via TanStack Query and threaded into each view.
 */
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { apiMode } from './api';
import { useSnapshot } from './lib/queries';
import { HouseholdMatrix } from './views/HouseholdMatrix';
import { RulesEngine } from './views/RulesEngine';
import { ApprovalsInbox } from './views/ApprovalsInbox';
import { DigestPreview } from './views/DigestPreview';
import { BalanceBatteryView } from './views/BalanceBattery';
import { ConflictRadar } from './views/ConflictRadar';
import { SeasonalTracker } from './views/SeasonalTracker';
import { QuickActions } from './views/QuickActions';
import type { DashboardSnapshot } from './api';

const NAV = [
  { to: '/matrix', label: 'Matrix' },
  { to: '/rules', label: 'Who Does What' },
  { to: '/approvals', label: 'Approvals' },
  { to: '/digest', label: 'Digest' },
  { to: '/balance', label: 'Balance' },
  { to: '/conflicts', label: 'Conflicts' },
  { to: '/seasonal', label: 'Seasonal' },
  { to: '/actions', label: 'Quick Actions' },
];

export default function App() {
  const { data, isLoading, isError, error } = useSnapshot();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">NestAI</span>
              <span className="text-sm text-slate-500">
                {data?.household.name ?? 'Household Orchestrator'}
              </span>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
              {apiMode} data
            </span>
          </div>
          <nav className="mt-3 flex flex-wrap gap-1">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-ink text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {isLoading && <Loading />}
        {isError && (
          <p className="text-sm text-red-600">
            Failed to load dashboard: {(error as Error)?.message}
          </p>
        )}
        {data && <RoutedViews snapshot={data} />}
      </main>
    </div>
  );
}

function RoutedViews({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/matrix" replace />} />
      <Route path="/matrix" element={<HouseholdMatrix snapshot={snapshot} />} />
      <Route path="/rules" element={<RulesEngine snapshot={snapshot} />} />
      <Route path="/approvals" element={<ApprovalsInbox snapshot={snapshot} />} />
      <Route path="/digest" element={<DigestPreview snapshot={snapshot} />} />
      <Route path="/balance" element={<BalanceBatteryView snapshot={snapshot} />} />
      <Route path="/conflicts" element={<ConflictRadar snapshot={snapshot} />} />
      <Route path="/seasonal" element={<SeasonalTracker snapshot={snapshot} />} />
      <Route path="/actions" element={<QuickActions snapshot={snapshot} />} />
      <Route path="*" element={<Navigate to="/matrix" replace />} />
    </Routes>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-400">
      <span className="h-3 w-3 animate-pulse rounded-full bg-slate-300" />
      Loading dashboard…
    </div>
  );
}
