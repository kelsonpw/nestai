/**
 * Dependency / asset chaining.
 *
 * Pure, deterministic generation of follow-on work for a confirmed seasonal
 * trip:
 *
 *   1. {@link generateAssetDependencyTasks} — for each household asset relevant
 *      to the trip kind, emit a "verify X fits/works" dependency check task
 *      (e.g. "verify tire chains fit the 2019 Honda Pilot" for a ski trip).
 *
 *   2. {@link generateChildGearAuditTasks} — for each dependent whose seasonal
 *      gear may have been outgrown since last season, emit a sizing-audit task.
 *
 * Both return {@link TaskDraft}s paired with a {@link DependencyEdge} describing
 * the asset/child the task hangs off, so the persistence layer can materialize
 * the {@link TaskDependency} rows. Nothing reaches for `Date.now()`.
 */
import type {
  SeasonalProject,
  SeasonalKind,
  HouseholdAsset,
  Member,
  TaskDraft,
  AssetKind,
} from '@nestai/contracts';
import { computeAge } from '../routing/age.js';
import { type Clock } from '../time.js';

/** A draft dependency edge: which asset/child the generated task depends on. */
export interface DependencyEdge {
  dependsOnAssetId?: string;
  dependsOnChildId?: string;
  reason: string;
}

/** A generated dependency task plus the edge describing what it hangs off. */
export interface DependencyTask {
  task: TaskDraft;
  edge: DependencyEdge;
}

/* -------------------------------------------------------------------------- */
/* Asset dependency tasks                                                      */
/* -------------------------------------------------------------------------- */

/** Gear/vehicle keywords each seasonal kind cares about for readiness. */
const KIND_ASSET_HINTS: Record<
  SeasonalKind,
  { vehicle: string[]; gear: string[] }
> = {
  SKI_TRIP: {
    vehicle: ['tire chains', 'snow tires', 'roof rack', 'antifreeze'],
    gear: ['skis', 'snowboard', 'boots', 'helmet', 'goggles', 'snow jacket'],
  },
  CAMPSITE: {
    vehicle: ['roof rack', 'hitch', 'spare tire'],
    gear: ['tent', 'sleeping bag', 'stove', 'cooler', 'headlamp'],
  },
  TRIP: {
    vehicle: ['spare tire', 'roof rack'],
    gear: ['luggage', 'car seat'],
  },
  CAMP: {
    vehicle: [],
    gear: ['backpack', 'water bottle', 'sleeping bag'],
  },
  SPORTS: {
    vehicle: [],
    gear: ['cleats', 'shin guards', 'jersey', 'mouthguard'],
  },
};

/** Format a friendly asset descriptor from its name + attrs (year/make/model). */
function describeAsset(asset: HouseholdAsset): string {
  const a = asset.attrs ?? {};
  const parts = [a.year, a.make, a.model]
    .filter((v): v is string | number => v != null && v !== '')
    .map(String);
  const built = parts.join(' ').trim();
  return built.length > 0 ? built : asset.name;
}

/** True when an asset is relevant to a kind's vehicle/gear readiness hints. */
function assetMatchesKind(
  asset: HouseholdAsset,
  kind: SeasonalKind,
): { matched: boolean; hint?: string } {
  const hints = KIND_ASSET_HINTS[kind];
  const pool: string[] = asset.kind === 'VEHICLE' ? hints.vehicle : hints.gear;
  const hay = `${asset.name} ${JSON.stringify(asset.attrs ?? {})}`.toLowerCase();
  for (const hint of pool) {
    if (hay.includes(hint)) return { matched: true, hint };
  }
  // A vehicle is always worth a readiness check for trips that drive.
  if (asset.kind === 'VEHICLE' && hints.vehicle.length > 0) {
    return { matched: true };
  }
  return { matched: false };
}

export interface AssetDependencyInput {
  project: SeasonalProject;
  assets: HouseholdAsset[];
  /** Optional override of the asset kinds to consider (default: all). */
  kinds?: AssetKind[];
}

/**
 * Generate dependency-check tasks for the assets relevant to a confirmed
 * seasonal trip. For a ski trip with a vehicle named e.g. "tire chains" or a
 * vehicle whose attrs name a Honda Pilot, this emits "verify tire chains fit the
 * 2019 Honda Pilot"-style tasks. Returned sorted by asset name for determinism.
 */
export function generateAssetDependencyTasks(
  input: AssetDependencyInput,
): DependencyTask[] {
  const { project, assets } = input;
  const kinds = input.kinds;
  const hints = KIND_ASSET_HINTS[project.kind];

  const out: DependencyTask[] = [];
  const vehicles = assets.filter((a) => a.kind === 'VEHICLE');

  for (const asset of assets) {
    if (kinds && !kinds.includes(asset.kind)) continue;
    const { matched, hint } = assetMatchesKind(asset, project.kind);
    if (!matched) continue;

    let title: string;
    if (asset.kind === 'GEAR' && hint) {
      // Tie a gear item to a vehicle when one exists ("fit" semantics).
      const vehicle = vehicles[0];
      title =
        vehicle && /chain|rack|hitch/.test(hint)
          ? `Verify ${asset.name} fit the ${describeAsset(vehicle)}`
          : `Check ${asset.name} for "${project.title}"`;
    } else if (asset.kind === 'VEHICLE') {
      // Pair the vehicle with the first relevant gear hint (e.g. tire chains).
      const gearHint = hints.vehicle[0] ?? 'winter readiness';
      title = `Verify ${gearHint} fit the ${describeAsset(asset)}`;
    } else {
      title = `Ready ${asset.name} for "${project.title}"`;
    }

    out.push({
      task: {
        title,
        description: `Asset readiness check ahead of "${project.title}".`,
        urgency: 'MED',
        category: 'SEASONAL',
        requiredSkills: [],
        requiresApproval: false,
      },
      edge: {
        dependsOnAssetId: asset.id,
        reason: `${project.kind} readiness for ${asset.name}`,
      },
    });
  }

  out.sort((a, b) => a.task.title.localeCompare(b.task.title));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Child gear audit tasks                                                      */
/* -------------------------------------------------------------------------- */

export interface ChildGearAuditInput {
  project: SeasonalProject;
  /** Household members; only DEPENDENTs are audited. */
  members: Member[];
  now: Clock;
  /** Age (years) below which seasonal gear is most likely outgrown. Default 14. */
  growthAgeCeiling?: number;
}

/**
 * Generate child-gear sizing-audit tasks for dependents whose seasonal gear may
 * have been outgrown since last season. Only DEPENDENT members under the growth
 * ceiling are considered. Returned sorted by member display name.
 */
export function generateChildGearAuditTasks(
  input: ChildGearAuditInput,
): DependencyTask[] {
  const { project, members, now } = input;
  const ceiling = input.growthAgeCeiling ?? 14;
  const gearItems = KIND_ASSET_HINTS[project.kind].gear;

  const out: DependencyTask[] = [];
  for (const member of members) {
    if (member.role !== 'DEPENDENT') continue;
    const age = computeAge(member.birthDate, now);
    // Unknown-age dependents are still audited (conservative); known ages are
    // gated by the growth ceiling.
    if (age != null && age > ceiling) continue;

    const items = gearItems.length > 0 ? gearItems.slice(0, 3).join(', ') : 'gear';
    out.push({
      task: {
        title: `Size check ${member.displayName}'s ${project.kind === 'SKI_TRIP' ? 'ski ' : ''}gear (${items})`,
        description: `Confirm ${member.displayName}'s seasonal gear still fits before "${project.title}"; kids outgrow gear season to season.`,
        urgency: 'MED',
        category: 'SEASONAL',
        requiredSkills: [],
        requiresApproval: false,
      },
      edge: {
        dependsOnChildId: member.id,
        reason: `Gear sizing audit for ${member.displayName} (${project.kind})`,
      },
    });
  }

  out.sort((a, b) => a.task.title.localeCompare(b.task.title));
  return out;
}

/**
 * Convenience: produce the full dependency chain (asset checks + child gear
 * audits) for a confirmed seasonal project.
 */
export function generateDependencyChain(input: {
  project: SeasonalProject;
  assets: HouseholdAsset[];
  members: Member[];
  now: Clock;
  growthAgeCeiling?: number;
}): DependencyTask[] {
  return [
    ...generateAssetDependencyTasks({
      project: input.project,
      assets: input.assets,
    }),
    ...generateChildGearAuditTasks({
      project: input.project,
      members: input.members,
      now: input.now,
      growthAgeCeiling: input.growthAgeCeiling,
    }),
  ];
}
