/**
 * MockEmailProvider — `fetchInbox` returns canned fixture emails (filtered by
 * `since`); `send` writes a deterministic JSON file to
 * `fixtures/_sink/email/` and returns a stable provider ref. No network, no
 * secrets.
 */
import { readFile } from 'node:fs/promises';

import type {
  EmailProvider,
  InboundEmail,
  OutboundMessage,
} from '@nestai/contracts';
import { fixturePath, writeJsonSink } from '../internal/paths.js';

export interface MockEmailConfig {
  /** Inbox fixture under fixtures/, defaults to "email/inbox.json". */
  inboxRelativePath?: string;
}

export class MockEmailProvider implements EmailProvider {
  private readonly inboxRelativePath: string;

  constructor(config: MockEmailConfig = {}) {
    this.inboxRelativePath = config.inboxRelativePath ?? 'email/inbox.json';
  }

  async fetchInbox(since: string): Promise<InboundEmail[]> {
    const raw = await readFile(
      fixturePath(...this.inboxRelativePath.split('/')),
      'utf8',
    );
    const all = JSON.parse(raw) as InboundEmail[];
    const sinceMs = new Date(since).getTime();
    const filtered = Number.isNaN(sinceMs)
      ? all
      : all.filter((e) => new Date(e.receivedAt).getTime() >= sinceMs);
    return filtered.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }

  async send(msg: OutboundMessage): Promise<{ providerRef: string }> {
    const providerRef = `mock-email-${hash(msg.to + '|' + (msg.subject ?? '') + '|' + msg.body)}`;
    await writeJsonSink(`email/${providerRef}.json`, {
      providerRef,
      channel: msg.channel,
      to: msg.to,
      subject: msg.subject,
      body: msg.body,
    });
    return { providerRef };
  }
}

/** Tiny deterministic non-crypto hash (FNV-1a) for stable file names. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
