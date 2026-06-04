/**
 * "Who Does What" Rules Engine — per-member profile cards with skill-tag
 * toggles and age-restriction context, plus the list of RoutingRules.
 */
import type { Member } from '@nestai/contracts';
import { TaskCategoryValues } from '@nestai/contracts';

import type { DashboardSnapshot } from '../api';
import { Badge, Card, EmptyState } from '../components/ui';
import { ageFromBirthDate, memberName } from '../lib/format';
import { useToggleSkill } from '../lib/queries';

/** The canonical skill palette offered as toggles on each profile. */
const SKILL_PALETTE = [
  'Driving',
  'Cooking',
  'HeavyLifting',
  'Plumbing',
  'PetCare',
  'Driving-Learner',
  'Childcare',
  'Gardening',
] as const;

export function RulesEngine({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { members, routingRules } = snapshot;
  const toggleSkill = useToggleSkill();

  return (
    <div className="space-y-6">
      <Card
        title="Who Does What — member profiles"
        subtitle="Toggle skills and review age eligibility used by the routing engine."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {members.map((m) => (
            <MemberProfileCard
              key={m.id}
              member={m}
              onToggle={(skill) =>
                toggleSkill.mutate({ memberId: m.id, skill })
              }
            />
          ))}
        </div>
      </Card>

      <Card
        title="Routing rules"
        subtitle="Higher-priority rules win when biasing task → member assignment."
      >
        {routingRules.length === 0 ? (
          <EmptyState>No routing rules configured.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...routingRules]
              .sort((a, b) => b.priority - a.priority)
              .map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{r.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.matchCategory && (
                        <Badge tone="blue">{r.matchCategory}</Badge>
                      )}
                      {r.matchSkills.map((s) => (
                        <Badge key={s} tone="violet">
                          {s}
                        </Badge>
                      ))}
                      {r.minAge != null && (
                        <Badge tone="amber">age ≥ {r.minAge}</Badge>
                      )}
                      {r.maxAge != null && (
                        <Badge tone="amber">age ≤ {r.maxAge}</Badge>
                      )}
                      {r.assignToMemberId && (
                        <Badge tone="green">
                          → {memberName(members, r.assignToMemberId)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400">
                    priority {r.priority}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Categories: {TaskCategoryValues.join(', ')}
        </p>
      </Card>
    </div>
  );
}

function MemberProfileCard({
  member,
  onToggle,
}: {
  member: Member;
  onToggle: (skill: string) => void;
}) {
  const age = ageFromBirthDate(member.birthDate);
  const active = new Set(member.skills);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">{member.displayName}</p>
          <p className="text-xs text-slate-500">
            {member.role}
            {age != null && ` · age ${age}`}
            {member.drivingPrivileges && ' · 🚗 driving'}
          </p>
        </div>
        <Badge tone={member.availabilityState === 'AVAILABLE' ? 'green' : 'amber'}>
          {member.availabilityState}
        </Badge>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
          Skills
        </p>
        <div className="flex flex-wrap gap-2">
          {SKILL_PALETTE.map((skill) => {
            const on = active.has(skill);
            return (
              <button
                key={skill}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(skill)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  on
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
