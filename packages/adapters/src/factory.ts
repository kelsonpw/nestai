/**
 * Provider factory.
 *
 * `createProviders(config)` returns one instance of each adapter, choosing
 * mock vs real per adapter. Selection precedence (highest first):
 *   1. Per-adapter env override: NESTAI_<ADAPTER>_MODE = mock | real
 *      (e.g. NESTAI_LLM_MODE=real)
 *   2. The config's providerMode (derived from PROVIDER_MODE by the caller)
 *   3. Default: mock
 *
 * Mocks need no secrets and no network. Real providers compile but throw a
 * descriptive error when used unconfigured — EXCEPT the LLM, where a missing
 * ANTHROPIC_API_KEY safely falls back to the deterministic mock (per spec).
 */
import type {
  NestaiConfig,
  ProviderMode,
  LlmProvider,
  CalendarProvider,
  EmailProvider,
  MessagingProvider,
  OcrProvider,
} from '@nestai/contracts';

import { MockLlmProvider, AnthropicLlmProvider } from './llm/index.js';
import { MockCalendarProvider, RealCalendarProvider } from './calendar/index.js';
import { MockEmailProvider, RealEmailProvider } from './email/index.js';
import {
  MockMessagingProvider,
  RealMessagingProvider,
} from './messaging/index.js';
import { MockOcrProvider, RealOcrProvider } from './ocr/index.js';

export interface Providers {
  llm: LlmProvider;
  calendar: CalendarProvider;
  email: EmailProvider;
  messaging: MessagingProvider;
  ocr: OcrProvider;
}

type Adapter = 'LLM' | 'CALENDAR' | 'EMAIL' | 'MESSAGING' | 'OCR';

function resolveMode(adapter: Adapter, base: ProviderMode): ProviderMode {
  const override = process.env[`NESTAI_${adapter}_MODE`];
  if (override === 'mock' || override === 'real') return override;
  return base;
}

export function createProviders(config: NestaiConfig): Providers {
  const base: ProviderMode = config.providerMode ?? 'mock';

  return {
    llm: createLlm(config, resolveMode('LLM', base)),
    calendar: createCalendar(config, resolveMode('CALENDAR', base)),
    email: createEmail(config, resolveMode('EMAIL', base)),
    messaging: createMessaging(config, resolveMode('MESSAGING', base)),
    ocr: createOcr(config, resolveMode('OCR', base)),
  };
}

function createLlm(config: NestaiConfig, mode: ProviderMode): LlmProvider {
  if (mode === 'real') {
    const apiKey = config.llm?.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      return new AnthropicLlmProvider({
        apiKey,
        baseUrl: config.llm?.baseUrl,
        extractModel: config.llm?.model,
      });
    }
    // Spec: if the key is missing, the factory falls back to the mock.
    return new MockLlmProvider();
  }
  return new MockLlmProvider();
}

function createCalendar(
  config: NestaiConfig,
  mode: ProviderMode,
): CalendarProvider {
  if (mode === 'real') {
    return new RealCalendarProvider({
      provider: (config.calendar?.provider as 'caldav' | 'google') ?? 'caldav',
      apiKey: config.calendar?.apiKey,
    });
  }
  return new MockCalendarProvider();
}

function createEmail(config: NestaiConfig, mode: ProviderMode): EmailProvider {
  if (mode === 'real') {
    return new RealEmailProvider({ fromAddress: config.email?.fromAddress });
  }
  return new MockEmailProvider();
}

function createMessaging(
  config: NestaiConfig,
  mode: ProviderMode,
): MessagingProvider {
  if (mode === 'real') {
    return new RealMessagingProvider({
      provider:
        (config.messaging?.provider as 'twilio' | 'whatsapp-cloud') ?? 'twilio',
      authToken: config.messaging?.apiKey,
      fromNumber: config.messaging?.fromNumber,
    });
  }
  return new MockMessagingProvider();
}

function createOcr(config: NestaiConfig, mode: ProviderMode): OcrProvider {
  if (mode === 'real') {
    return new RealOcrProvider({
      provider:
        (config.ocr?.provider as
          | 'google-document-ai'
          | 'azure-document-intelligence') ?? 'google-document-ai',
      apiKey: config.ocr?.apiKey,
    });
  }
  return new MockOcrProvider();
}

/**
 * Convenience: build a NestaiConfig from process.env, defaulting to mock mode.
 * Callers that already have a config can ignore this.
 */
export function configFromEnv(): NestaiConfig {
  const mode = process.env.PROVIDER_MODE === 'real' ? 'real' : 'mock';
  return {
    providerMode: mode,
    defaultTimezone: process.env.NESTAI_DEFAULT_TZ ?? 'America/Los_Angeles',
    llm: {
      provider: process.env.NESTAI_LLM_PROVIDER ?? 'anthropic',
      model: process.env.NESTAI_LLM_MODEL,
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
    },
  };
}
