/**
 * NestAI security hardening tests (root-level e2e).
 *
 * Boots the REAL compiled NestJS app (mock providers + in-memory queue) against
 * the live Postgres and asserts the privacy / isolation guarantees that the
 * whole product hinges on:
 *
 *   (a) cross-tenant access is blocked (tenant isolation via HouseholdGuard +
 *       TenantPrisma ownership checks);
 *   (b) the LLM provider only ever receives SCRUBBED text — no raw address,
 *       SSN or phone — verified with a recording spy provider;
 *   (c) a minor's photo/media is deleted immediately post-extraction;
 *   (d) the 24h purge sweep blanks expired RawMessage raw text/media and deletes
 *       expired AvailabilityBlock raw source.
 *
 * Runs with PROVIDER_MODE=mock and zero external infra/secrets.
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { prisma } from '@nestai/db';
import type { LlmProvider, ExtractionResult } from '@nestai/contracts';

import { AppModule } from '../services/api/dist/app.module.js';
import { LLM_PROVIDER } from '../services/api/dist/tokens.js';
import { SchedulerService } from '../services/api/dist/scheduler/scheduler.service.js';

process.env.PROVIDER_MODE = 'mock';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://nestai:nestai@localhost:5432/nestai';
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;

const HID_A = 'hh_sec_a';
const HID_B = 'hh_sec_b';

/** A recording LLM that captures every text handed to it, then delegates to a
 *  deterministic empty extraction. Lets us prove only scrubbed text reaches it. */
class RecordingLlmProvider implements LlmProvider {
  readonly seenTexts: string[] = [];
  async extractTasks(input: {
    text: string;
    familyContext: string;
    now: string;
  }): Promise<ExtractionResult> {
    this.seenTexts.push(input.text);
    return { tasks: [], events: [], confidence: 0.1 };
  }
  async route() {
    return { assignedMemberId: null, confidence: 0, rationale: 'spy: no route' };
  }
}

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
async function cleanup(id: string) {
  await prisma.household.deleteMany({ where: { id } });
}

describe('NestAI security hardening (e2e)', () => {
  let app: INestApplication;
  let http: unknown;
  const spy = new RecordingLlmProvider();

  beforeAll(async () => {
    await cleanup(HID_A);
    await cleanup(HID_B);
    await seedHousehold(HID_A, 'Sec Household A');
    await seedHousehold(HID_B, 'Sec Household B');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LLM_PROVIDER)
      .useValue(spy)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    await cleanup(HID_A);
    await cleanup(HID_B);
    await prisma.$disconnect();
  });

  const as = (hid: string) => ({ 'x-household-id': hid });

  /* (a) cross-tenant isolation ------------------------------------------- */
  it('(a) blocks cross-tenant access to another household’s member', async () => {
    // Missing tenant header → 401.
    await request(http as never).get('/members').expect(401);

    const created = await request(http as never)
      .post('/members')
      .set(as(HID_A))
      .send({ displayName: 'A-Only Member', role: 'DEPENDENT' })
      .expect(201);

    // Household B must not see A's member in its list…
    const listB = await request(http as never)
      .get('/members')
      .set(as(HID_B))
      .expect(200);
    expect(listB.body.some((m: { id: string }) => m.id === created.body.id)).toBe(
      false,
    );
    // …and a direct id lookup from B must 404 (ownership assertion).
    await request(http as never)
      .get(`/members/${created.body.id}`)
      .set(as(HID_B))
      .expect(404);
  });

  /* (b) LLM only ever sees scrubbed text --------------------------------- */
  it('(b) the LLM provider only receives scrubbed text (no raw PII)', async () => {
    spy.seenTexts.length = 0;
    const rawPii = {
      ssn: '123-45-6789',
      phone: '555-123-4567',
      address: '742 Maple Ave',
    };
    const rawText =
      `Please book the dentist. My SSN is ${rawPii.ssn}, ` +
      `I live at ${rawPii.address}, call me at ${rawPii.phone}.`;

    await request(http as never)
      .post('/ingestion/message')
      .set(as(HID_A))
      .send({ kind: 'WHATSAPP', rawText })
      .expect(201);

    expect(spy.seenTexts.length).toBeGreaterThan(0);
    const seen = spy.seenTexts.join('\n');
    // The model saw tokens, not the raw values.
    expect(seen).toContain('[SSN_');
    expect(seen).toContain('[PHONE_');
    expect(seen).not.toContain(rawPii.ssn);
    expect(seen).not.toContain(rawPii.phone);
    expect(seen).not.toContain(rawPii.address);
  });

  /* (c) minor photo/media deleted immediately post-extraction ------------ */
  it('(c) deletes a minor’s photo/media immediately after extraction', async () => {
    // A household minor whose name the ingest pipeline recognizes.
    await request(http as never)
      .post('/members')
      .set(as(HID_A))
      .send({ displayName: 'Robin', role: 'DEPENDENT', birthDate: '2015-01-01' })
      .expect(201);

    const withMinorMedia = await request(http as never)
      .post('/ingestion/message')
      .set(as(HID_A))
      .send({
        kind: 'WHATSAPP',
        rawText: 'Cute photo of Robin at the park!',
        mediaUrl: 'https://example.test/robin.jpg',
        mediaType: 'image/jpeg',
      })
      .expect(201);

    const stored = await prisma.rawMessage.findUnique({
      where: { id: withMinorMedia.body.messageId },
    });
    expect(stored?.mediaUrl).toBeNull();
    expect(stored?.mediaType).toBeNull();

    // Control: media on a message NOT mentioning a minor is retained.
    const noMinor = await request(http as never)
      .post('/ingestion/message')
      .set(as(HID_A))
      .send({
        kind: 'WHATSAPP',
        rawText: 'Receipt photo for the hardware store.',
        mediaUrl: 'https://example.test/receipt.jpg',
        mediaType: 'image/jpeg',
      })
      .expect(201);
    const storedNoMinor = await prisma.rawMessage.findUnique({
      where: { id: noMinor.body.messageId },
    });
    expect(storedNoMinor?.mediaUrl).toBe('https://example.test/receipt.jpg');
  });

  /* (d) 24h purge sweep --------------------------------------------------- */
  it('(d) purge sweep blanks expired raw message text/media + deletes expired availability raw', async () => {
    // A member to hang an availability block off of.
    const member = await request(http as never)
      .post('/members')
      .set(as(HID_A))
      .send({ displayName: 'Purge Member', role: 'HEAD' })
      .expect(201);

    const past = new Date(Date.now() - 60_000); // already expired

    const expiredMsg = await prisma.rawMessage.create({
      data: {
        householdId: HID_A,
        sourceId: null,
        rawText: 'sensitive raw text with 555-123-4567',
        scrubbedText: 'sensitive raw text with [PHONE_1]',
        tokenMap: [],
        mediaUrl: 'https://example.test/secret.jpg',
        mediaType: 'image/jpeg',
        receivedAt: past,
        purgeAfter: past,
        status: 'PROCESSED',
      },
    });

    const expiredBlock = await prisma.availabilityBlock.create({
      data: {
        householdId: HID_A,
        memberId: member.body.id,
        kind: 'BUSY',
        startsAt: past,
        endsAt: new Date(past.getTime() + 3600_000),
        source: 'SCREENSHOT_OCR',
        purgeRawAfter: past,
      },
    });

    const scheduler = app.get(SchedulerService);
    const result = await scheduler.purgeSweep(new Date());
    expect(result.messages).toBeGreaterThanOrEqual(1);
    expect(result.blocks).toBeGreaterThanOrEqual(1);

    const sweptMsg = await prisma.rawMessage.findUnique({
      where: { id: expiredMsg.id },
    });
    expect(sweptMsg?.rawText).toBe('');
    expect(sweptMsg?.scrubbedText).toBeNull();
    expect(sweptMsg?.mediaUrl).toBeNull();

    const sweptBlock = await prisma.availabilityBlock.findUnique({
      where: { id: expiredBlock.id },
    });
    expect(sweptBlock).toBeNull(); // expired availability raw is deleted
  });
});
