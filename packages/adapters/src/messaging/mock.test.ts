import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { OutboundMessage } from '@nestai/contracts';
import { MockMessagingProvider } from './mock.js';
import { fixturePath, sinkPath } from '../internal/paths.js';

describe('MockMessagingProvider.parseInbound', () => {
  const msg = new MockMessagingProvider();

  it('parses a WhatsApp Cloud webhook payload', async () => {
    const payload = JSON.parse(
      await readFile(fixturePath('messaging', 'inbound-whatsapp.json'), 'utf8'),
    );
    const inbound = await msg.parseInbound(payload);
    expect(inbound.from).toBe('+14155550123');
    expect(inbound.text).toContain('grab milk');
    expect(inbound.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('parses a flat Twilio-style payload', async () => {
    const inbound = await msg.parseInbound({
      From: '+15558675309',
      Body: 'On my way',
      MediaUrl0: 'https://example.test/pic.jpg',
      MediaContentType0: 'image/jpeg',
    });
    expect(inbound.from).toBe('+15558675309');
    expect(inbound.text).toBe('On my way');
    expect(inbound.mediaUrl).toBe('https://example.test/pic.jpg');
    expect(inbound.mediaType).toBe('image/jpeg');
  });

  it('throws on an unrecognized payload', async () => {
    await expect(msg.parseInbound({ nope: true })).rejects.toThrow();
  });
});

describe('MockMessagingProvider.send', () => {
  const msg = new MockMessagingProvider();

  it('writes a deterministic JSON sink', async () => {
    const out: OutboundMessage = {
      channel: 'WHATSAPP',
      to: '+14155550123',
      body: 'Got it, thanks!',
    };
    const a = await msg.send(out);
    const b = await msg.send(out);
    expect(a.providerRef).toBe(b.providerRef);

    const written = JSON.parse(
      await readFile(sinkPath('messaging', `${a.providerRef}.json`), 'utf8'),
    );
    expect(written.channel).toBe('WHATSAPP');
    expect(written.body).toBe('Got it, thanks!');
  });
});
