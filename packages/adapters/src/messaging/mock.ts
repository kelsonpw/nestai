/**
 * MockMessagingProvider (WhatsApp + SMS) — `parseInbound` normalizes a
 * webhook-shaped payload (WhatsApp Cloud API shape, or a flat Twilio-style
 * shape) into an `InboundMessage`; `send` writes deterministic JSON to
 * `fixtures/_sink/messaging/`. No network, no secrets.
 */
import type {
  MessagingProvider,
  InboundMessage,
  OutboundMessage,
} from '@nestai/contracts';
import { writeJsonSink } from '../internal/paths.js';

export class MockMessagingProvider implements MessagingProvider {
  async parseInbound(payload: unknown): Promise<InboundMessage> {
    const msg = normalize(payload);
    if (!msg) {
      throw new Error(
        'MockMessagingProvider.parseInbound: unrecognized webhook payload shape.',
      );
    }
    return msg;
  }

  async send(msg: OutboundMessage): Promise<{ providerRef: string }> {
    const providerRef = `mock-msg-${hash(msg.channel + '|' + msg.to + '|' + msg.body)}`;
    await writeJsonSink(`messaging/${providerRef}.json`, {
      providerRef,
      channel: msg.channel,
      to: msg.to,
      body: msg.body,
    });
    return { providerRef };
  }
}

/* ----------------------------- normalize --------------------------------- */

function normalize(payload: unknown): InboundMessage | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;

  // Twilio-style flat shape: { From, Body, MediaUrl0?, MediaContentType0? }
  if (typeof p.From === 'string' && typeof p.Body === 'string') {
    return {
      from: p.From,
      text: p.Body,
      receivedAt: new Date().toISOString(),
      mediaUrl: typeof p.MediaUrl0 === 'string' ? p.MediaUrl0 : undefined,
      mediaType: typeof p.MediaContentType0 === 'string' ? p.MediaContentType0 : undefined,
    };
  }

  // WhatsApp Cloud API shape: entry[].changes[].value.messages[]
  const entry = p.entry;
  if (Array.isArray(entry)) {
    for (const e of entry) {
      const changes = (e as Record<string, unknown>)?.changes;
      if (!Array.isArray(changes)) continue;
      for (const c of changes) {
        const value = (c as Record<string, unknown>)?.value as
          | Record<string, unknown>
          | undefined;
        const messages = value?.messages;
        if (!Array.isArray(messages) || messages.length === 0) continue;
        const m = messages[0] as Record<string, unknown>;
        const from = typeof m.from === 'string' ? m.from : '';
        const text =
          (m.text as Record<string, unknown> | undefined)?.body;
        const receivedAt =
          typeof m.timestamp === 'string'
            ? new Date(Number(m.timestamp) * 1000).toISOString()
            : new Date().toISOString();
        const image = m.image as Record<string, unknown> | undefined;
        return {
          from,
          text: typeof text === 'string' ? text : '',
          receivedAt,
          mediaUrl: typeof image?.link === 'string' ? image.link : undefined,
          mediaType: image ? 'image' : undefined,
        };
      }
    }
  }

  return null;
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
