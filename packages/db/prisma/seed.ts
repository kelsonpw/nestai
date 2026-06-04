/**
 * @nestai/db — seed
 *
 * Seeds ONE demo household ("The Rivera Family") with a realistic cast of
 * members, routing rules, assets, a registration-timeline reference dataset,
 * wellness goals, and a couple of events/tasks so the dashboard and digest
 * have content.
 *
 * Idempotent: everything keyed off stable ids and written via `upsert`
 * inside a single transaction, so re-running is safe.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Stable ids so the seed is idempotent across runs.
const HID = 'hh_rivera';
const M = {
  alex: 'mbr_alex',
  jordan: 'mbr_jordan',
  mia: 'mbr_mia',
  sam: 'mbr_sam',
} as const;

const now = new Date();
function inDays(days: number, hour = 9): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // ---- Household -------------------------------------------------------
    await tx.household.upsert({
      where: { id: HID },
      update: {
        name: 'The Rivera Family',
        timezone: 'America/Los_Angeles',
        digestTimeLocal: '07:00',
        sundayCheckinTimeLocal: '16:00',
      },
      create: {
        id: HID,
        name: 'The Rivera Family',
        timezone: 'America/Los_Angeles',
        digestTimeLocal: '07:00',
        sundayCheckinTimeLocal: '16:00',
      },
    });

    // ---- Members ---------------------------------------------------------
    // Two heads of household.
    await tx.member.upsert({
      where: { id: M.alex },
      update: {},
      create: {
        id: M.alex,
        householdId: HID,
        displayName: 'Alex Rivera',
        role: 'HEAD',
        birthDate: '1985-04-12',
        skills: ['Driving', 'Cooking', 'Plumbing'],
        drivingPrivileges: true,
        homeLocation: { label: 'Home', address: '742 Maple Ave, Portland, OR' },
        officeLocation: { label: 'Office', address: 'Downtown Portland, OR' },
        commuteMinutes: 40,
        availabilityState: 'AVAILABLE',
        contactEmail: 'alex@example.com',
        contactPhone: '+15035550100',
      },
    });

    await tx.member.upsert({
      where: { id: M.jordan },
      update: {},
      create: {
        id: M.jordan,
        householdId: HID,
        displayName: 'Jordan Rivera',
        role: 'HEAD',
        birthDate: '1986-09-23',
        skills: ['Driving', 'HeavyLifting'],
        drivingPrivileges: true,
        homeLocation: { label: 'Home', address: '742 Maple Ave, Portland, OR' },
        // Works from home some days — no fixed office commute.
        availabilityState: 'AVAILABLE',
        contactEmail: 'jordan@example.com',
        contactPhone: '+15035550101',
      },
    });

    // Two dependents.
    await tx.member.upsert({
      where: { id: M.mia },
      update: {},
      create: {
        id: M.mia,
        householdId: HID,
        displayName: 'Mia Rivera',
        role: 'DEPENDENT',
        birthDate: isoFromAge(9),
        skills: ['PetCare'],
        drivingPrivileges: false,
        availabilityState: 'AVAILABLE',
      },
    });

    await tx.member.upsert({
      where: { id: M.sam },
      update: {},
      create: {
        id: M.sam,
        householdId: HID,
        displayName: 'Sam Rivera',
        role: 'DEPENDENT',
        birthDate: isoFromAge(15),
        skills: ['Driving-Learner', 'Cooking'],
        drivingPrivileges: false,
        availabilityState: 'AVAILABLE',
      },
    });

    // ---- Routing rules ("Who Does What") --------------------------------
    await upsertRoutingRule(tx, 'rule_plumbing', {
      name: 'Plumbing -> Alex',
      matchSkills: ['Plumbing'],
      matchCategory: 'MAINTENANCE',
      assignToMemberId: M.alex,
      priority: 100,
    });
    await upsertRoutingRule(tx, 'rule_dishwasher', {
      name: 'Dishwasher -> any dependent age >= 8',
      matchSkills: [],
      matchCategory: 'ADMIN',
      minAge: 8,
      priority: 50,
    });
    await upsertRoutingRule(tx, 'rule_driving', {
      name: 'Driving tasks -> adults with driving privileges',
      matchSkills: ['Driving'],
      matchCategory: 'LOGISTICS',
      minAge: 18,
      priority: 80,
    });

    // ---- Household assets ------------------------------------------------
    await upsertAsset(tx, 'asset_vehicle', 'VEHICLE', '2019 Honda Pilot', {
      year: 2019,
      make: 'Honda',
      model: 'Pilot',
      seats: 8,
    });
    await upsertAsset(tx, 'asset_ski', 'GEAR', 'Ski gear set', {
      items: ['skis', 'boots', 'poles', 'helmets'],
      count: 4,
    });
    await upsertAsset(tx, 'asset_soccer', 'GEAR', "Kids' soccer gear", {
      items: ['cleats', 'shin guards', 'ball', 'jerseys'],
    });

    // ---- Registration timeline reference dataset ------------------------
    await upsertTimeline(tx, 'rt_camp', {
      kind: 'CAMP',
      label: 'Summer Camp registration',
      opensRule: 'Opens early February',
      leadDays: 14,
    });
    await upsertTimeline(tx, 'rt_littleleague', {
      kind: 'SPORTS',
      label: 'Little League (early-bird)',
      opensRule: 'Early-bird signups open early January',
      leadDays: 14,
    });
    await upsertTimeline(tx, 'rt_campsite', {
      kind: 'CAMPSITE',
      label: 'Rec.gov campsite booking',
      opensRule: 'Opens 6 months (180 days) ahead of arrival',
      leadDays: 7,
    });
    await upsertTimeline(tx, 'rt_skitrip', {
      kind: 'SKI_TRIP',
      label: 'Ski trip prep',
      opensRule: 'Plan Oct/Nov before the season',
      leadDays: 30,
    });

    // ---- Wellness goals --------------------------------------------------
    await upsertWellnessGoal(tx, 'wg_alex_gym', {
      memberId: M.alex,
      kind: 'GYM',
      targetCount: 3,
      durationMin: 45,
      period: 'WEEKLY',
    });
    await upsertWellnessGoal(tx, 'wg_jordan_quiet', {
      memberId: M.jordan,
      kind: 'QUIET',
      targetCount: 1,
      durationMin: 60,
      period: 'WEEKLY',
    });
    await upsertWellnessGoal(tx, 'wg_jordan_datenight', {
      memberId: M.jordan,
      kind: 'DATE_NIGHT',
      targetCount: 1,
      durationMin: 120,
      period: 'BIWEEKLY',
    });

    // ---- Events ----------------------------------------------------------
    await upsertEvent(tx, 'evt_soccer', {
      title: "Mia's soccer practice",
      startsAt: inDays(2, 16),
      endsAt: inDays(2, 17),
      location: { label: 'Riverside Park field' },
      ownerMemberId: M.mia,
      colorTag: 'green',
    });
    await upsertEvent(tx, 'evt_dentist', {
      title: 'Family dentist appointments',
      startsAt: inDays(5, 10),
      endsAt: inDays(5, 12),
      location: { label: 'Bright Smiles Dental' },
      colorTag: 'blue',
    });

    // ---- Tasks -----------------------------------------------------------
    await upsertTask(tx, 'task_dishwasher', {
      title: 'Unload the dishwasher',
      description: 'Daily chore — any dependent age 8+.',
      category: 'ADMIN',
      urgency: 'LOW',
      status: 'OPEN',
      minAge: 8,
      assignedMemberId: M.mia,
      status_: 'ASSIGNED',
    });
    await upsertTask(tx, 'task_plumbing', {
      title: 'Fix leaky kitchen faucet',
      description: 'Slow drip under the sink; needs a washer replacement.',
      category: 'MAINTENANCE',
      urgency: 'MED',
      requiredSkills: ['Plumbing'],
      assignedMemberId: M.alex,
    });
    await upsertTask(tx, 'task_carpool', {
      title: 'Drive Sam to Saturday game',
      description: 'Carpool to the away match across town.',
      category: 'LOGISTICS',
      urgency: 'HIGH',
      requiredSkills: ['Driving'],
      dueAt: inDays(3, 8),
    });

    // ---- Family context --------------------------------------------------
    await upsertContext(tx, 'ctx_pref_dinner', {
      kind: 'preference',
      text: 'Family prefers dinner together by 6:30pm on weeknights.',
    });
    await upsertContext(tx, 'ctx_constraint_jordan', {
      kind: 'constraint',
      text: 'Jordan works from home Tuesdays and Thursdays.',
      refId: M.jordan,
    });
  });
}

// Convert an age (in years) to an approximate ISO "YYYY-MM-DD" birth date.
function isoFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

async function upsertRoutingRule(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    name: string;
    matchSkills: string[];
    matchCategory?: 'MAINTENANCE' | 'SCHOOL' | 'ERRAND' | 'ADMIN' | 'EVENT' | 'SEASONAL' | 'WELLNESS' | 'LOGISTICS';
    minAge?: number;
    assignToMemberId?: string;
    priority: number;
  },
): Promise<void> {
  await tx.routingRule.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, ...data },
  });
}

async function upsertAsset(
  tx: Prisma.TransactionClient,
  id: string,
  kind: 'VEHICLE' | 'GEAR',
  name: string,
  attrs: Prisma.InputJsonValue,
): Promise<void> {
  await tx.householdAsset.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, kind, name, attrs },
  });
}

async function upsertTimeline(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    kind: 'CAMP' | 'SPORTS' | 'CAMPSITE' | 'SKI_TRIP' | 'TRIP';
    label: string;
    opensRule: string;
    leadDays: number;
    region?: string;
  },
): Promise<void> {
  await tx.registrationTimeline.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, ...data },
  });
}

async function upsertWellnessGoal(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    memberId: string;
    kind: 'GYM' | 'QUIET' | 'DATE_NIGHT' | 'CUSTOM';
    targetCount: number;
    durationMin: number;
    period: 'WEEKLY' | 'BIWEEKLY';
  },
): Promise<void> {
  await tx.wellnessGoal.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, ...data },
  });
}

async function upsertEvent(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    title: string;
    startsAt: Date;
    endsAt?: Date;
    location?: Prisma.InputJsonValue;
    ownerMemberId?: string;
    colorTag?: string;
  },
): Promise<void> {
  await tx.event.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, ...data },
  });
}

async function upsertTask(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    title: string;
    description?: string;
    category: 'MAINTENANCE' | 'SCHOOL' | 'ERRAND' | 'ADMIN' | 'EVENT' | 'SEASONAL' | 'WELLNESS' | 'LOGISTICS';
    urgency?: 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';
    status?: 'OPEN' | 'ASSIGNED' | 'CLAIMED' | 'DROPPED' | 'DONE' | 'BLOCKED';
    status_?: 'OPEN' | 'ASSIGNED' | 'CLAIMED' | 'DROPPED' | 'DONE' | 'BLOCKED';
    requiredSkills?: string[];
    minAge?: number;
    assignedMemberId?: string;
    dueAt?: Date;
  },
): Promise<void> {
  const { status_, ...rest } = data;
  await tx.task.upsert({
    where: { id },
    update: {},
    create: {
      id,
      householdId: HID,
      ...rest,
      status: status_ ?? rest.status ?? 'OPEN',
    },
  });
}

async function upsertContext(
  tx: Prisma.TransactionClient,
  id: string,
  data: { kind: string; text: string; refId?: string },
): Promise<void> {
  await tx.familyContext.upsert({
    where: { id },
    update: {},
    create: { id, householdId: HID, ...data },
  });
}

main()
  .then(async () => {
    const [members, tasks, events, rules, assets, timelines, goals] =
      await Promise.all([
        prisma.member.count(),
        prisma.task.count(),
        prisma.event.count(),
        prisma.routingRule.count(),
        prisma.householdAsset.count(),
        prisma.registrationTimeline.count(),
        prisma.wellnessGoal.count(),
      ]);
    // eslint-disable-next-line no-console
    console.log(
      `Seed complete: members=${members} tasks=${tasks} events=${events} ` +
        `routingRules=${rules} assets=${assets} timelines=${timelines} wellnessGoals=${goals}`,
    );
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
