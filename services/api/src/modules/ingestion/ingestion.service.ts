import { Inject, Injectable } from '@nestjs/common';
import { scrub, extract } from '@nestai/core';
import type {
  IngestMessageRequest,
  IngestMessageResponse,
  LlmProvider,
  MessagingProvider,
  Member,
} from '@nestai/contracts';
import type { Prisma } from '@nestai/db';

import { TenantPrisma } from '../../tenant/tenant-prisma.js';
import { LLM_PROVIDER, MESSAGING_PROVIDER } from '../../tokens.js';
import { isoify } from '../../common/serialize.js';
import { TasksService } from '../tasks/tasks.service.js';

/** Raw inbound content is purged after this many hours (ephemeral retention). */
const PURGE_AFTER_HOURS = 24;

@Injectable()
export class IngestionService {
  constructor(
    private readonly db: TenantPrisma,
    private readonly tasks: TasksService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(MESSAGING_PROVIDER) private readonly messaging: MessagingProvider,
  ) {}

  /**
   * Ingest an inbound payload through the full pipeline:
   *   1. scrub PII (core) → scrubbedText + tokenMap
   *   2. LLM extract (provider) tasks + events from the scrubbed text
   *   3. persist RawMessage (with purgeAfter) + Tasks (routed) + Events
   *   4. enforce minor-photo deletion: drop media on messages mentioning minors
   */
  async ingest(req: IngestMessageRequest): Promise<IngestMessageResponse> {
    const receivedAt = req.receivedAt ?? new Date().toISOString();

    // --- minor-photo protection -------------------------------------------
    // If the message references a household minor and carries media, strip the
    // media immediately (do not persist a minor's photo) and shorten retention.
    const minorMentioned = await this.mentionsMinor(req.rawText);
    const keepMedia = req.mediaUrl != null && !minorMentioned;

    // --- 1. scrub ----------------------------------------------------------
    const { scrubbedText, tokenMap } = scrub(req.rawText);

    const purgeAfter = new Date(
      new Date(receivedAt).getTime() + PURGE_AFTER_HOURS * 3600 * 1000,
    );

    // --- persist the raw message ------------------------------------------
    const message = await this.db.raw.rawMessage.create({
      data: this.db.data({
        sourceId: req.sourceId,
        rawText: req.rawText,
        scrubbedText,
        tokenMap: tokenMap as unknown as Prisma.InputJsonValue,
        mediaUrl: keepMedia ? req.mediaUrl : undefined,
        mediaType: keepMedia ? req.mediaType : undefined,
        receivedAt: new Date(receivedAt),
        purgeAfter,
        status: 'PROCESSING',
      }) as Prisma.RawMessageUncheckedCreateInput,
    });

    // --- 2. extract --------------------------------------------------------
    const familyContext = await this.familyContextText();
    const extraction = await extract({
      llm: this.llm,
      text: scrubbedText,
      familyContext,
      now: receivedAt,
    });

    // --- 3. persist tasks + events ----------------------------------------
    const createdTaskIds: string[] = [];
    for (const t of extraction.tasks) {
      const result = await this.tasks.create({
        title: t.title,
        description: t.description,
        dueAt: t.dueAt,
        urgency: t.urgency,
        category: t.category,
        requiredSkills: t.requiredSkills ?? [],
        minAge: t.minAge,
        maxAge: t.maxAge,
        requiresApproval: t.requiresApproval,
        confidence: t.confidence,
        sourceMessageId: message.id,
      });
      if (result.task?.id) createdTaskIds.push(result.task.id as string);
    }

    const createdEventIds: string[] = [];
    for (const e of extraction.events) {
      const event = await this.db.raw.event.create({
        data: this.db.data({
          title: e.title,
          startsAt: new Date(e.startsAt),
          endsAt: e.endsAt ? new Date(e.endsAt) : undefined,
          location: e.location as unknown as Prisma.InputJsonValue,
          allDay: e.allDay ?? false,
          sourceId: req.sourceId,
        }) as Prisma.EventUncheckedCreateInput,
      });
      createdEventIds.push(event.id);
    }

    await this.db.raw.rawMessage.update({
      where: { id: message.id },
      data: { status: 'PROCESSED', processedAt: new Date() },
    });

    return {
      messageId: message.id,
      accepted: true,
      createdTaskIds,
      createdEventIds,
    };
  }

  /**
   * Parse an inbound messaging-provider webhook payload (WhatsApp/SMS) into a
   * normalized message and run it through {@link ingest}.
   */
  async ingestWebhook(payload: unknown): Promise<IngestMessageResponse> {
    const inbound = await this.messaging.parseInbound(payload);
    return this.ingest({
      householdId: this.db.householdId,
      kind: 'WHATSAPP',
      rawText: inbound.text,
      mediaUrl: inbound.mediaUrl,
      mediaType: inbound.mediaType,
      receivedAt: inbound.receivedAt,
    });
  }

  async listMessages() {
    const rows = await this.db.raw.rawMessage.findMany({
      where: this.db.where(),
      orderBy: { receivedAt: 'desc' },
    });
    return rows.map((m) => isoify(m));
  }

  /** True if the text references the display name of a household dependent. */
  private async mentionsMinor(text: string): Promise<boolean> {
    const minors = await this.db.raw.member.findMany({
      where: this.db.where({ role: 'DEPENDENT' as const }),
    });
    const lower = text.toLowerCase();
    return minors.some((m) => lower.includes(m.displayName.toLowerCase()));
  }

  /** Build a compact family-context string fed to the LLM extractor. */
  private async familyContextText(): Promise<string> {
    const members = (await this.db.raw.member.findMany({
      where: this.db.where({ active: true }),
    })) as unknown as Member[];
    const lines = members.map(
      (m) =>
        `- ${m.displayName} (${m.role}${
          m.skills?.length ? `, skills: ${m.skills.join('/')}` : ''
        })`,
    );
    const contexts = await this.db.raw.familyContext.findMany({
      where: this.db.where(),
      take: 20,
    });
    for (const c of contexts) lines.push(`- ${c.kind}: ${c.text}`);
    return lines.join('\n');
  }
}
