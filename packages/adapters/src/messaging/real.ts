/**
 * RealMessagingProvider — Twilio (SMS) / WhatsApp Cloud API skeleton.
 *
 * `parseInbound` reuses the same webhook normalization the mock uses (parsing
 * a payload needs no credentials). `send` requires credentials and throws a
 * descriptive error until configured.
 */
import type {
  MessagingProvider,
  InboundMessage,
  OutboundMessage,
} from '@nestai/contracts';
import { MockMessagingProvider } from './mock.js';

export interface RealMessagingConfig {
  provider?: 'twilio' | 'whatsapp-cloud';
  accountSid?: string;
  authToken?: string;
  /** Twilio "from" number, or WhatsApp phone-number id. */
  fromNumber?: string;
  baseUrl?: string;
}

export class RealMessagingProvider implements MessagingProvider {
  private readonly config: RealMessagingConfig;
  private readonly parser = new MockMessagingProvider();

  constructor(config: RealMessagingConfig = {}) {
    this.config = config;
  }

  async parseInbound(payload: unknown): Promise<InboundMessage> {
    // Inbound parsing is credential-free; the webhook shape is identical.
    return this.parser.parseInbound(payload);
  }

  async send(msg: OutboundMessage): Promise<{ providerRef: string }> {
    if (!this.config.authToken || !this.config.fromNumber) {
      throw new Error(
        'RealMessagingProvider.send is not configured. Provide { accountSid, authToken, fromNumber } ' +
          'or use PROVIDER_MODE=mock.',
      );
    }
    // TODO: POST to Twilio Messages API or WhatsApp Cloud /messages endpoint
    // using the configured credentials; return the provider message SID.
    void msg;
    throw new Error('RealMessagingProvider.send is not implemented yet.');
  }
}
