/**
 * Integration tests for @nestai/api.
 *
 * Boots the real Nest app (mock providers + in-memory queue) against the live
 * seeded Postgres. Uses a dedicated test household so assertions don't depend on
 * exact seed counts; the household is created/cleaned around the suite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { prisma } from '@nestai/db';

import { AppModule } from '../app.module.js';

const TEST_HID = 'hh_test_a6';
const OTHER_HID = 'hh_test_a6_other';

async function seedHousehold(id: string, name: string) {
  await prisma.household.upsert({
    where: { id },
    update: {},
    create: {
      id,
      name,
      timezone: 'America/Los_Angeles',
      digestTimeLocal: '07:00',
      sundayCheckinTimeLocal: '16:00',
    },
  });
}

async function cleanupHousehold(id: string) {
  // Cascade deletes children (members/tasks/etc.) via onDelete: Cascade.
  await prisma.household.deleteMany({ where: { id } });
}

describe('NestAI API (integration)', () => {
  let app: INestApplication;
  let httpServer: unknown;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PROVIDER_MODE = 'mock';
    delete process.env.REDIS_URL;

    await cleanupHousehold(TEST_HID);
    await cleanupHousehold(OTHER_HID);
    await seedHousehold(TEST_HID, 'Test Household A6');
    await seedHousehold(OTHER_HID, 'Other Household A6');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await cleanupHousehold(TEST_HID);
    await cleanupHousehold(OTHER_HID);
    await prisma.$disconnect();
  });

  const as = (hid: string) => ({ 'x-household-id': hid });

  it('boots and answers health (no tenant required)', async () => {
    const res = await request(httpServer).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects tenant routes without x-household-id', async () => {
    await request(httpServer).get('/members').expect(401);
  });

  it('creates and lists members scoped by household', async () => {
    const create = await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({
        displayName: 'Parent One',
        role: 'HEAD',
        birthDate: '1985-04-12',
        skills: ['cooking', 'driving'],
        drivingPrivileges: true,
        contactEmail: 'parent.one@example.test',
      })
      .expect(201);
    expect(create.body.id).toBeDefined();
    expect(create.body.householdId).toBe(TEST_HID);
    expect(create.body.age).toBeGreaterThan(30);

    const list = await request(httpServer)
      .get('/members')
      .set(as(TEST_HID))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.every((m: { householdId: string }) => m.householdId === TEST_HID)).toBe(true);
    expect(list.body.some((m: { id: string }) => m.id === create.body.id)).toBe(true);
  });

  it('blocks cross-tenant access to a member', async () => {
    const created = await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({ displayName: 'Secret Member', role: 'DEPENDENT' })
      .expect(201);

    // Listing as the OTHER household must not include TEST's member.
    const otherList = await request(httpServer)
      .get('/members')
      .set(as(OTHER_HID))
      .expect(200);
    expect(otherList.body.some((m: { id: string }) => m.id === created.body.id)).toBe(false);

    // Direct id lookup from the other tenant must 404 (ownership assertion).
    await request(httpServer)
      .get(`/members/${created.body.id}`)
      .set(as(OTHER_HID))
      .expect(404);
  });

  it('ingests a WhatsApp message → creates and routes tasks', async () => {
    // Ensure a routable adult exists.
    await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({
        displayName: 'Router Parent',
        role: 'HEAD',
        drivingPrivileges: true,
        availabilityState: 'AVAILABLE',
      })
      .expect(201);

    const res = await request(httpServer)
      .post('/ingestion/message')
      .set(as(TEST_HID))
      .send({
        kind: 'WHATSAPP',
        rawText:
          'Reminder: book the dentist appointment for Friday and pick up groceries. Call 555-123-4567.',
      })
      .expect(201);

    expect(res.body.accepted).toBe(true);
    expect(res.body.messageId).toBeDefined();
    expect(Array.isArray(res.body.createdTaskIds)).toBe(true);
    expect(res.body.createdTaskIds.length).toBeGreaterThan(0);

    // The raw message should have been PII-scrubbed (phone tokenized).
    const messages = await request(httpServer)
      .get('/ingestion/messages')
      .set(as(TEST_HID))
      .expect(200);
    const stored = messages.body.find((m: { id: string }) => m.id === res.body.messageId);
    expect(stored.scrubbedText).toContain('[PHONE_');

    // At least one created task should be routed (assigned) to a member.
    const tasks = await request(httpServer).get('/tasks').set(as(TEST_HID)).expect(200);
    const created = tasks.body.filter((t: { id: string }) =>
      res.body.createdTaskIds.includes(t.id),
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created.some((t: { assignedMemberId: string | null }) => t.assignedMemberId)).toBe(true);
  });

  it('drop + claim locks a task to the claimer', async () => {
    const memberA = await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({ displayName: 'Owner A', role: 'HEAD', drivingPrivileges: true })
      .expect(201);
    const memberB = await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({ displayName: 'Backup B', role: 'HEAD', drivingPrivileges: true })
      .expect(201);

    const task = await request(httpServer)
      .post('/tasks')
      .set(as(TEST_HID))
      .send({
        title: 'Drive to soccer practice',
        category: 'LOGISTICS',
        urgency: 'HIGH',
      })
      .expect(201);
    const taskId = task.body.task.id;

    // Drop by member A.
    const drop = await request(httpServer)
      .post(`/tasks/${taskId}/drop`)
      .set(as(TEST_HID))
      .send({ memberId: memberA.body.id, reason: 'conflict' })
      .expect(201);
    expect(drop.body.task.status).toBe('DROPPED');
    expect(drop.body.escalationId).toBeDefined();

    // Claim by member B.
    const claim = await request(httpServer)
      .post(`/tasks/${taskId}/claim`)
      .set(as(TEST_HID))
      .send({ memberId: memberB.body.id })
      .expect(201);
    expect(claim.body.ok).toBe(true);
    expect(claim.body.task.status).toBe('CLAIMED');
    expect(claim.body.task.assignedMemberId).toBe(memberB.body.id);

    // Second claim is an idempotent no-op (already locked).
    const claim2 = await request(httpServer)
      .post(`/tasks/${taskId}/claim`)
      .set(as(TEST_HID))
      .send({ memberId: memberA.body.id })
      .expect(201);
    expect(claim2.body.ok).toBe(false);
    expect(claim2.body.task.assignedMemberId).toBe(memberB.body.id);
  });

  it('builds + sends a daily digest (written to fixtures/_sink)', async () => {
    const member = await request(httpServer)
      .post('/members')
      .set(as(TEST_HID))
      .send({
        displayName: 'Digest Member',
        role: 'HEAD',
        contactEmail: 'digest@example.test',
      })
      .expect(201);

    await request(httpServer)
      .post('/tasks')
      .set(as(TEST_HID))
      .send({ title: 'Pay water bill', category: 'ADMIN', noRoute: true })
      .expect(201);

    const built = await request(httpServer)
      .get(`/notifications/digest/${member.body.id}`)
      .set(as(TEST_HID))
      .expect(200);
    expect(built.body.householdId).toBe(TEST_HID);
    expect(built.body.memberId).toBe(member.body.id);
    expect(built.body.type).toBe('DAILY_DIGEST');
    expect(typeof built.body.summary).toBe('string');

    const sent = await request(httpServer)
      .post(`/notifications/digest/${member.body.id}/send`)
      .set(as(TEST_HID))
      .expect(201);
    expect(sent.body.providerRef).toContain('mock-email-');
    expect(sent.body.notificationId).toBeDefined();
  });
});
