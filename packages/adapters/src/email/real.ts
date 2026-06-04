/**
 * RealEmailProvider — nodemailer (SMTP send) + IMAP (inbox) skeleton.
 *
 * Compiles, but throws a descriptive error until SMTP/IMAP credentials are
 * configured. `send` shows the intended nodemailer wiring behind the
 * credential guard.
 */
import nodemailer from 'nodemailer';

import type {
  EmailProvider,
  InboundEmail,
  OutboundMessage,
} from '@nestai/contracts';

export interface RealEmailConfig {
  fromAddress?: string;
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
  };
  imap?: {
    host: string;
    port: number;
    user: string;
    pass: string;
  };
}

export class RealEmailProvider implements EmailProvider {
  private readonly config: RealEmailConfig;
  private transport?: nodemailer.Transporter;

  constructor(config: RealEmailConfig = {}) {
    this.config = config;
  }

  async fetchInbox(_since: string): Promise<InboundEmail[]> {
    if (!this.config.imap) {
      throw new Error(
        'RealEmailProvider.fetchInbox is not configured. Provide { imap: { host, port, user, pass } } ' +
          'or use PROVIDER_MODE=mock.',
      );
    }
    // TODO: connect via an IMAP client, search since `_since`, and map
    // messages onto InboundEmail[].
    throw new Error('RealEmailProvider.fetchInbox is not implemented yet.');
  }

  async send(msg: OutboundMessage): Promise<{ providerRef: string }> {
    if (!this.config.smtp || !this.config.fromAddress) {
      throw new Error(
        'RealEmailProvider.send is not configured. Provide { fromAddress, smtp: { host, port, user, pass } } ' +
          'or use PROVIDER_MODE=mock.',
      );
    }
    if (!this.transport) {
      this.transport = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure ?? this.config.smtp.port === 465,
        auth: { user: this.config.smtp.user, pass: this.config.smtp.pass },
      });
    }
    const info = await this.transport.sendMail({
      from: this.config.fromAddress,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
    return { providerRef: info.messageId };
  }
}
