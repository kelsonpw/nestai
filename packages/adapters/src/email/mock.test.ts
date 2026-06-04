import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { OutboundMessage } from '@nestai/contracts';
import { MockEmailProvider } from './mock.js';
import { sinkPath } from '../internal/paths.js';

describe('MockEmailProvider', () => {
  const email = new MockEmailProvider();

  it('fetches canned inbox emails', async () => {
    const inbox = await email.fetchInbox('2026-01-01T00:00:00.000Z');
    expect(inbox.length).toBeGreaterThanOrEqual(2);
    expect(inbox[0]!.subject).toContain('Permission Slip');
    expect(inbox[0]!.attachments?.[0]?.filename).toBe('school-flyer.png');
  });

  it('filters inbox by since', async () => {
    const inbox = await email.fetchInbox('2026-06-03T00:00:00.000Z');
    expect(inbox.every((e) => e.receivedAt >= '2026-06-03')).toBe(true);
  });

  it('writes a deterministic JSON sink on send', async () => {
    const msg: OutboundMessage = {
      channel: 'EMAIL',
      to: 'parent@household.test',
      subject: 'Reminder',
      body: 'Soccer at 4pm',
    };
    const a = await email.send(msg);
    const b = await email.send(msg);
    expect(a.providerRef).toBe(b.providerRef);

    const written = JSON.parse(
      await readFile(sinkPath('email', `${a.providerRef}.json`), 'utf8'),
    );
    expect(written.to).toBe('parent@household.test');
    expect(written.body).toBe('Soccer at 4pm');
  });
});
