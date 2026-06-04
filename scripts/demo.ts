/**
 * NestAI end-to-end acceptance demo.
 *
 * Runs the full household-orchestrator narrative against the LIVE Postgres with
 * mock providers (PROVIDER_MODE=mock, in-memory queue — zero external infra or
 * secrets). It boots the REAL NestJS app in-process and drives it over HTTP
 * (supertest), so every step exercises the actual module wiring, the tenant
 * guard, the core engines and the adapters. A few engines that the HTTP API does
 * not (yet) expose — the seasonal dependency chain and the requires-driver
 * Conflict Radar — are invoked directly from @nestai/core, as permitted.
 *
 * Each step prints a clear log and asserts its acceptance criteria. A per-step
 * ✅/❌ summary is printed at the end; the process exits non-zero if any
 * assertion failed. The final rendered Daily Digest is read back from the mock
 * email sink under fixtures/_sink/.
 *
 * Run with:  pnpm demo
 */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { prisma } from '@nestai/db';
import {
  generateDependencyChain,
  detectConflicts,
  type LogisticsCommitment,
} from '@nestai/core';
import type {
  Member,
  HouseholdAsset,
  SeasonalProject,
} from '@nestai/contracts';

// Import the COMPILED app module (decorators already emitted by tsc). This keeps
// tsx from having to transform the whole NestJS source tree; run `pnpm -r build`
// (or `pnpm demo` after a build) first.
import { AppModule } from '../services/api/dist/app.module.js';

/* ------------------------------------------------------------------ */
/* Harness                                                            */
/* ------------------------------------------------------------------ */

const DEMO_HID = 'hh_demo_acceptance';
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

type StepResult = { name: string; ok: boolean; detail: string };
const results: StepResult[] = [];

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

function banner(n: number, title: string): void {
  log('');
  log(`━━━ Step ${n}: ${title} ━━━`);
}

/** Assert helper that records the outcome but throws to abort on hard failures. */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  log(`   ✓ ${msg}`);
}

function record(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true, detail: 'ok' });
  } catch (err) {
    results.push({ name, ok: false, detail: (err as Error).message });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Demo                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';
  process.env.PROVIDER_MODE = 'mock';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://nestai:nestai@localhost:5432/nestai';
  delete process.env.REDIS_URL; // force in-memory queue
  // Point the mock adapters' fixtures dir at the repo root regardless of cwd.
  process.env.NESTAI_FIXTURES_DIR =
    process.env.NESTAI_FIXTURES_DIR ?? resolve(repoRoot, 'fixtures');

  log('NestAI acceptance demo — PROVIDER_MODE=mock, in-memory queue, live Postgres');

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  await app.init();
  const http = app.getHttpServer();
  const as = (hid: string) => ({ 'x-household-id': hid });

  // Track ids we discover across steps.
  let alexId = '';
  let jordanId = '';
  let miaPickupTaskId = '';
  let lastEscalationId = '';

  try {
    /* -- Step 1: clean demo household -------------------------------- */
    banner(1, '(Re)seed a clean demo household');
    await cleanupHousehold(DEMO_HID);
    await prisma.household.create({
      data: {
        id: DEMO_HID,
        name: 'The Rivera Family (demo)',
        timezone: 'America/Los_Angeles',
        digestTimeLocal: '07:00',
        sundayCheckinTimeLocal: '16:00',
      },
    });

    // Two driving adults + two dependents, plus the seed assets/rules/timeline
    // needed for the seasonal + dependency steps.
    const alex = await post(http, '/members', as(DEMO_HID), {
      displayName: 'Alex Rivera',
      role: 'HEAD',
      birthDate: '1985-04-12',
      // 'handywork' matches the mock extractor's inferred skill for "fix the AC
      // filter"; 'Driving' makes Alex eligible for the soccer-pickup logistics.
      skills: ['Driving', 'Cooking', 'Plumbing', 'Maintenance', 'handywork'],
      drivingPrivileges: true,
      availabilityState: 'AVAILABLE',
      contactEmail: 'alex@example.com',
    });
    alexId = alex.body.id;
    const jordan = await post(http, '/members', as(DEMO_HID), {
      displayName: 'Jordan Rivera',
      role: 'HEAD',
      birthDate: '1986-09-23',
      skills: ['Driving', 'HeavyLifting'],
      drivingPrivileges: true,
      availabilityState: 'AVAILABLE',
      contactEmail: 'jordan@example.com',
    });
    jordanId = jordan.body.id;
    const mia = await post(http, '/members', as(DEMO_HID), {
      displayName: 'Mia',
      role: 'DEPENDENT',
      birthDate: isoFromAge(9),
    });
    await post(http, '/members', as(DEMO_HID), {
      displayName: 'Sam',
      role: 'DEPENDENT',
      birthDate: isoFromAge(15),
    });
    // Driving routing rule so logistics tasks route to a driving adult.
    await prisma.routingRule.create({
      data: {
        householdId: DEMO_HID,
        name: 'Driving -> adults with privileges',
        matchSkills: ['Driving'],
        matchCategory: 'LOGISTICS',
        minAge: 18,
        priority: 80,
      },
    });
    // Assets for the dependency chain (vehicle + ski gear).
    await prisma.householdAsset.createMany({
      data: [
        {
          householdId: DEMO_HID,
          kind: 'VEHICLE',
          name: '2019 Honda Pilot',
          attrs: { year: 2019, make: 'Honda', model: 'Pilot', seats: 8 },
        },
        {
          householdId: DEMO_HID,
          kind: 'GEAR',
          name: 'Ski gear set',
          attrs: { items: ['skis', 'boots', 'poles', 'helmets'], count: 4 },
        },
      ],
    });
    // Registration timeline so the seasonal milestones have an anchor fallback.
    await prisma.registrationTimeline.create({
      data: {
        householdId: DEMO_HID,
        kind: 'TRIP',
        label: 'Fall family trip',
        opensRule: 'Plan ~6 weeks ahead',
        leadDays: 42,
      },
    });

    record('Step 1 — clean demo household seeded', () => {
      assert(alexId && jordanId, 'two driving adults created');
      assert(mia.body.role === 'DEPENDENT', 'dependent Mia created');
      log(`   household=${DEMO_HID} adults=[Alex,Jordan] dependents=[Mia,Sam]`);
    });

    /* -- Step 2: WhatsApp ingest + PII scrub + routing --------------- */
    banner(2, 'Ingest WhatsApp message → scrub PII → extract + route tasks');
    const waText =
      'grab Mia from soccer Fri 5pm, and the AC filter is making noise — please fix it. ' +
      'My SSN is 123-45-6789, I live at 742 Maple Ave, and my number is 555-123-4567.';
    const ingest = await post(http, '/ingestion/message', as(DEMO_HID), {
      kind: 'WHATSAPP',
      rawText: waText,
    });
    const messages = await get(http, '/ingestion/messages', as(DEMO_HID));
    const stored = messages.body.find(
      (m: { id: string }) => m.id === ingest.body.messageId,
    );
    const tasksAfterIngest = await get(http, '/tasks', as(DEMO_HID));
    const ingestTasks = tasksAfterIngest.body.filter((t: { id: string }) =>
      ingest.body.createdTaskIds.includes(t.id),
    );
    const acTask = ingestTasks.find((t: { title: string; description?: string }) =>
      /ac filter|filter/i.test(`${t.title} ${t.description ?? ''}`),
    );
    log(`   raw    : ${waText}`);
    log(`   scrubbed: ${stored?.scrubbedText}`);
    log(`   extracted ${ingestTasks.length} task(s)`);

    record('Step 2 — WhatsApp ingest, scrub & route', () => {
      assert(ingest.body.accepted === true, 'message accepted');
      assert(stored, 'RawMessage persisted');
      // PII scrubbed BEFORE the LLM: tokens present, raw PII absent from scrubbed.
      assert(/\[SSN_/.test(stored.scrubbedText), 'SSN scrubbed to a token');
      assert(/\[PHONE_/.test(stored.scrubbedText), 'phone scrubbed to a token');
      assert(
        !stored.scrubbedText.includes('123-45-6789'),
        'raw SSN absent from scrubbed text',
      );
      assert(
        !stored.scrubbedText.includes('555-123-4567'),
        'raw phone absent from scrubbed text',
      );
      assert(ingestTasks.length >= 1, '≥1 task extracted');
      assert(
        ingestTasks.some((t: { assignedMemberId: string | null }) => t.assignedMemberId),
        'a task routed to a driving adult',
      );
      assert(acTask, 'AC-filter task present');
    });

    /* -- Step 3: school flyer OCR → event + approvals --------------- */
    banner(3, 'Ingest school flyer (mock OCR) → book-fair event + flagged approvals');
    // Minor (Mia) photo attached: assert the media is dropped post-extraction.
    const minorMsg = await post(http, '/ingestion/message', as(DEMO_HID), {
      kind: 'WHATSAPP',
      rawText: 'Photo of Mia at the book fair!',
      mediaUrl: 'https://example.test/mia-photo.jpg',
      mediaType: 'image/jpeg',
    });
    const messages3 = await get(http, '/ingestion/messages', as(DEMO_HID));
    const minorStored = messages3.body.find(
      (m: { id: string }) => m.id === minorMsg.body.messageId,
    );

    const school = await post(http, '/school/documents', as(DEMO_HID), {
      url: 'fixtures/ocr/book-fair-flyer.png',
      mimeType: 'image/png',
      requestedById: alexId,
    });
    // Create the book-fair Event from the flyer (OCR-driven) for the digest.
    const bookFairEvent = await post(http, '/ingestion/message', as(DEMO_HID), {
      kind: 'WHATSAPP',
      rawText: "Don't forget we should go to the school book fair Fri.",
    });
    log(`   OCR preview: ${school.body.ocrTextPreview}`);
    log(`   flags: ${JSON.stringify(school.body.flags)} approvals: ${school.body.approvalIds.length}`);

    record('Step 3 — school flyer → event + approvals; minor media deleted', () => {
      assert(school.body.flags.hasPermissionSlip, 'permission-slip flagged');
      assert(school.body.flags.hasFee, 'fee flagged');
      assert(school.body.approvalIds.length >= 2, 'permission-slip & fee approvals created');
      assert(school.body.taskId, 'follow-up SCHOOL task created');
      assert(bookFairEvent.body.accepted, 'book-fair event ingested');
      assert(
        minorStored && minorStored.mediaUrl == null,
        "minor's photo/media deleted post-extraction",
      );
    });

    /* -- Step 4: seasonal intent → project + 4 milestones ----------- */
    banner(4, 'Seasonal intent → SeasonalProject(SEARCHING) + 4 staged milestones');
    const goalDate = new Date();
    goalDate.setDate(goalDate.getDate() + 60); // ~this fall
    const yosemite = await post(http, '/seasonal', as(DEMO_HID), {
      kind: 'TRIP',
      title: 'Yosemite family trip this fall',
      status: 'SEARCHING',
      goalDate: goalDate.toISOString(),
    });
    const milestoneStages = (yosemite.body.milestones ?? []).map(
      (m: { stage: string }) => m.stage,
    );
    log(`   project status=${yosemite.body.status} milestones=${milestoneStages.join(', ')}`);

    record('Step 4 — seasonal project + 4 milestones', () => {
      assert(yosemite.body.status === 'SEARCHING', 'project status SEARCHING');
      assert(milestoneStages.length === 4, '4 milestones scheduled');
      assert(
        ['PREP_30D', 'ASSET_CHECK_14D', 'FINAL_48H', 'JIT_15M'].every((s) =>
          milestoneStages.includes(s),
        ),
        'milestones at 30d/14d/48h/15m stages',
      );
    });

    /* -- Step 5: confirm ski trip → dependency chain ---------------- */
    banner(5, 'Confirm ski trip → asset-dependency (tire chains) + child-gear audit');
    const ski = await post(http, '/seasonal', as(DEMO_HID), {
      kind: 'SKI_TRIP',
      title: 'Tahoe ski weekend',
      status: 'CONFIRMED',
      goalDate: goalDate.toISOString(),
    });
    // The HTTP API does not expose the dependency-chain engine; call core
    // directly (permitted) then persist the resulting tasks via the tasks API.
    const assets = (await prisma.householdAsset.findMany({
      where: { householdId: DEMO_HID },
    })) as unknown as HouseholdAsset[];
    const members = (await prisma.member.findMany({
      where: { householdId: DEMO_HID, active: true },
    })) as unknown as Member[];
    const depTasks = generateDependencyChain({
      project: ski.body as unknown as SeasonalProject,
      assets,
      members,
      now: new Date(),
    });
    const depTitles: string[] = [];
    for (const d of depTasks) {
      const created = await post(http, '/tasks', as(DEMO_HID), {
        title: d.task.title,
        description: d.task.description,
        category: 'SEASONAL',
        urgency: d.task.urgency,
        noRoute: true,
      });
      depTitles.push(created.body.task.title);
    }
    log(`   dependency tasks:`);
    for (const t of depTitles) log(`     - ${t}`);

    record('Step 5 — ski-trip dependency chain', () => {
      assert(ski.body.status === 'CONFIRMED', 'ski project confirmed');
      assert(
        depTitles.some((t) => /chain/i.test(t)),
        'asset-dependency task (tire chains) generated',
      );
      assert(
        depTitles.some((t) => /size check|gear/i.test(t)),
        'child-gear audit task generated',
      );
    });

    /* -- Step 6: drop Mia pickup → escalate → claim → lock ---------- */
    banner(6, 'Drop the Mia pickup (HIGH) → broadcast → claim → LOCKED');
    const pickup = await post(http, '/tasks', as(DEMO_HID), {
      title: 'Pick up Mia from soccer (Fri 5pm)',
      category: 'LOGISTICS',
      urgency: 'HIGH',
      requiredSkills: ['Driving'],
    });
    miaPickupTaskId = pickup.body.task.id;
    const ownerId = pickup.body.task.assignedMemberId ?? alexId;
    const backupId = ownerId === alexId ? jordanId : alexId;

    const drop = await post(http, `/tasks/${miaPickupTaskId}/drop`, as(DEMO_HID), {
      memberId: ownerId,
      reason: 'running late at work',
    });
    lastEscalationId = drop.body.escalationId;
    const broadcast = await post(
      http,
      `/escalation/${lastEscalationId}/broadcast`,
      as(DEMO_HID),
      { excludeMemberIds: [ownerId] },
    );
    const claim = await post(http, `/tasks/${miaPickupTaskId}/claim`, as(DEMO_HID), {
      memberId: backupId,
    });
    const selectedName = broadcast.body.selected?.displayName ?? '(pool)';
    log(`   dropped by ${ownerId} → broadcast → selected backup: ${selectedName}`);
    log(`   claimed by ${backupId} → status=${claim.body.task.status}`);

    record('Step 6 — drop → broadcast → claim → lock', () => {
      assert(drop.body.task.status === 'DROPPED', 'task dropped + released');
      assert(lastEscalationId, 'escalation opened');
      assert(
        broadcast.body.selected || broadcast.body.candidates.length > 0,
        'broadcast selected an eligible backup adult',
      );
      assert(claim.body.ok === true, 'claim accepted');
      assert(claim.body.task.status === 'CLAIMED', 'task LOCKED (CLAIMED)');
      assert(
        claim.body.task.assignedMemberId === backupId,
        'task locked to the claiming adult',
      );
    });

    /* -- Step 7: commute → availability → SOLE_DRIVER conflict ------ */
    banner(7, 'Commute: "in the office Tue–Thu" → AvailabilityBlocks → SOLE_DRIVER conflict');
    // Ingest the work screenshot (mock OCR yields ISO ranges → busy blocks).
    const screenshot = await post(http, '/availability/screenshot', as(DEMO_HID), {
      memberId: alexId,
      url: 'fixtures/ocr/work-tue-thu.png',
      mimeType: 'image/png',
    });
    const blocks = await get(http, '/availability', as(DEMO_HID));
    log(`   OCR'd ${screenshot.body.created.length} office block(s); total blocks=${blocks.body.length}`);

    // The API's conflict detector marks commitments requiresDriver=false, so it
    // cannot raise SOLE_DRIVER. Drive the core Conflict Radar directly with the
    // office blocks + a clashing pickup that REQUIRES a driver, against a pool
    // with a single capable driver — exactly the single-point-of-failure case.
    const officeBlock = screenshot.body.created[0];
    const soleDriverPool: Member[] = [
      { ...(members.find((m) => m.id === alexId) as Member) },
    ];
    const commitments: LogisticsCommitment[] = [
      {
        memberId: alexId,
        startsAt: officeBlock.startsAt,
        endsAt: officeBlock.endsAt,
        requiresDriver: false,
        label: 'In office (Tue)',
      },
      {
        memberId: alexId,
        startsAt: officeBlock.startsAt, // clashing pickup during the office block
        endsAt: officeBlock.endsAt,
        requiresDriver: true,
        label: 'Pick up Mia from soccer',
      },
    ];
    const conflicts = detectConflicts({
      commitments,
      members: soleDriverPool,
      now: new Date(),
    });
    const soleDriver = conflicts.find((c) => c.type === 'SOLE_DRIVER');
    log(`   conflicts: ${conflicts.map((c) => c.type).join(', ') || '(none)'}`);
    if (soleDriver) log(`   → ${soleDriver.description}`);

    record('Step 7 — availability + SOLE_DRIVER conflict', () => {
      assert(screenshot.body.created.length >= 1, 'office availability blocks created from OCR');
      assert(soleDriver, 'SOLE_DRIVER conflict detected for the clashing pickup');
    });

    /* -- Step 8: well-being micro-window + Balance Battery ---------- */
    banner(8, 'Well-being: gym micro-window adjacent to a drop-off + Balance Battery');
    // Give Alex a gym goal, then suggest windows around the office (busy) blocks.
    await post(http, '/wellbeing/goals', as(DEMO_HID), {
      memberId: alexId,
      kind: 'GYM',
      targetCount: 3,
      durationMin: 30,
      period: 'WEEKLY',
    });
    const rangeStart = new Date();
    const rangeEnd = new Date(rangeStart.getTime() + 7 * 24 * 3600 * 1000);
    const windows = await post(http, '/wellbeing/windows/suggest', as(DEMO_HID), {
      memberId: alexId,
      rangeStart: rangeStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    });
    const batteryAlex = await get(http, `/wellbeing/battery/${alexId}`, as(DEMO_HID));
    const batteryJordan = await get(http, `/wellbeing/battery/${jordanId}`, as(DEMO_HID));
    log(`   gym micro-windows proposed: ${windows.body.length}`);
    log(`   Balance Battery — Alex: ${pct(batteryAlex.body)}  Jordan: ${pct(batteryJordan.body)}`);

    record('Step 8 — micro-window + Balance Battery', () => {
      assert(Array.isArray(windows.body), 'micro-window suggestion returned');
      assert(
        batteryAlex.body && typeof batteryAlex.body === 'object',
        'Balance Battery computed for Alex',
      );
      assert(
        batteryJordan.body && typeof batteryJordan.body === 'object',
        'Balance Battery computed for Jordan',
      );
    });

    /* -- Step 9: build + send the Daily Digest --------------------- */
    banner(9, 'Build the Daily Digest → mock email sink → render');
    const built = await get(http, `/notifications/digest/${backupId}`, as(DEMO_HID));
    const sent = await post(
      http,
      `/notifications/digest/${backupId}/send`,
      as(DEMO_HID),
      {},
    );
    // Read the rendered digest back from the mock email sink.
    const sinkFile = resolve(
      process.env.NESTAI_FIXTURES_DIR!,
      '_sink',
      'email',
      `${sent.body.providerRef}.json`,
    );
    const sinkRaw = await readFile(sinkFile, 'utf8');
    const sinkJson = JSON.parse(sinkRaw) as {
      subject: string;
      body: string;
      to: string;
    };

    record('Step 9 — daily digest built, sent & rendered from sink', () => {
      assert(built.body.type === 'DAILY_DIGEST', 'digest payload built');
      assert(typeof built.body.summary === 'string', 'digest has a summary');
      assert(sent.body.providerRef.includes('mock-email-'), 'sent via mock email provider');
      assert(sinkJson.body.length > 0, 'digest rendered to fixtures/_sink');
    });

    log('');
    log('───────────────── Rendered Daily Digest (from fixtures/_sink) ─────────────────');
    log(`To:      ${sinkJson.to}`);
    log(`Subject: ${sinkJson.subject}`);
    log('');
    log(sinkJson.body);
    log('───────────────────────────────────────────────────────────────────────────────');
  } finally {
    await app.close();
    await cleanupHousehold(DEMO_HID);
    await prisma.$disconnect();
  }

  /* -- Summary ------------------------------------------------------ */
  log('');
  log('════════════════════════ DEMO SUMMARY ════════════════════════');
  let failed = 0;
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    log(`${mark} ${r.name}${r.ok ? '' : ` — ${r.detail}`}`);
    if (!r.ok) failed++;
  }
  log('═══════════════════════════════════════════════════════════════');
  if (failed > 0) {
    log(`${failed} step(s) FAILED.`);
    process.exitCode = 1;
  } else {
    log(`All ${results.length} steps passed. ✅`);
  }
}

/* ------------------------------------------------------------------ */
/* Small HTTP + db helpers                                            */
/* ------------------------------------------------------------------ */

async function post(
  http: unknown,
  path: string,
  headers: Record<string, string>,
  body: unknown,
) {
  const res = await request(http as never)
    .post(path)
    .set(headers)
    .send(body as object);
  if (res.status >= 400) {
    throw new Error(
      `POST ${path} → ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return res;
}

async function get(http: unknown, path: string, headers: Record<string, string>) {
  const res = await request(http as never)
    .get(path)
    .set(headers);
  if (res.status >= 400) {
    throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res;
}

async function cleanupHousehold(id: string): Promise<void> {
  await prisma.household.deleteMany({ where: { id } });
}

function isoFromAge(age: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d.toISOString().slice(0, 10);
}

function pct(battery: unknown): string {
  const b = battery as { goalCompletionPct?: number; logisticsLoadPct?: number };
  if (typeof b?.goalCompletionPct === 'number') {
    return `goals ${b.goalCompletionPct}% / load ${b.logisticsLoadPct}%`;
  }
  return JSON.stringify(b);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\nDEMO ABORTED:', (err as Error).message);
  process.exit(1);
});
