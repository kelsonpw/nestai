/**
 * Conformance: every provider (mock + real) satisfies its contract interface
 * at the type level, and the factory wires mocks by default. The type-level
 * assignments below fail compilation (and therefore the vitest run) if any
 * implementation drifts from the interface in @nestai/contracts.
 */
import { describe, it, expect } from 'vitest';
import type {
  LlmProvider,
  CalendarProvider,
  EmailProvider,
  MessagingProvider,
  OcrProvider,
  NestaiConfig,
} from '@nestai/contracts';

import {
  MockLlmProvider,
  AnthropicLlmProvider,
  MockCalendarProvider,
  RealCalendarProvider,
  MockEmailProvider,
  RealEmailProvider,
  MockMessagingProvider,
  RealMessagingProvider,
  MockOcrProvider,
  RealOcrProvider,
  createProviders,
} from './index.js';

describe('interface conformance (type-level)', () => {
  it('mock providers implement their interfaces', () => {
    const llm: LlmProvider = new MockLlmProvider();
    const calendar: CalendarProvider = new MockCalendarProvider();
    const email: EmailProvider = new MockEmailProvider();
    const messaging: MessagingProvider = new MockMessagingProvider();
    const ocr: OcrProvider = new MockOcrProvider();
    for (const p of [llm, calendar, email, messaging, ocr]) {
      expect(p).toBeTruthy();
    }
  });

  it('real providers implement their interfaces (compile-only, may throw when used)', () => {
    const llm: LlmProvider = new AnthropicLlmProvider({ apiKey: 'sk-test-not-used' });
    const calendar: CalendarProvider = new RealCalendarProvider();
    const email: EmailProvider = new RealEmailProvider();
    const messaging: MessagingProvider = new RealMessagingProvider();
    const ocr: OcrProvider = new RealOcrProvider();
    for (const p of [llm, calendar, email, messaging, ocr]) {
      expect(p).toBeTruthy();
    }
  });
});

describe('createProviders factory', () => {
  const baseConfig: NestaiConfig = {
    providerMode: 'mock',
    defaultTimezone: 'America/Los_Angeles',
  };

  it('defaults to mock implementations', () => {
    const p = createProviders(baseConfig);
    expect(p.llm).toBeInstanceOf(MockLlmProvider);
    expect(p.calendar).toBeInstanceOf(MockCalendarProvider);
    expect(p.email).toBeInstanceOf(MockEmailProvider);
    expect(p.messaging).toBeInstanceOf(MockMessagingProvider);
    expect(p.ocr).toBeInstanceOf(MockOcrProvider);
  });

  it('LLM real mode falls back to mock when no API key is present', () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const p = createProviders({ ...baseConfig, providerMode: 'real' });
      expect(p.llm).toBeInstanceOf(MockLlmProvider);
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });

  it('honors a per-adapter env override', () => {
    const prev = process.env.NESTAI_OCR_MODE;
    process.env.NESTAI_OCR_MODE = 'real';
    try {
      const p = createProviders(baseConfig);
      expect(p.ocr).toBeInstanceOf(RealOcrProvider);
      // other adapters stay mock
      expect(p.email).toBeInstanceOf(MockEmailProvider);
    } finally {
      if (prev === undefined) delete process.env.NESTAI_OCR_MODE;
      else process.env.NESTAI_OCR_MODE = prev;
    }
  });

  it('real providers throw a descriptive error when used unconfigured', async () => {
    const cal = new RealCalendarProvider();
    await expect(
      cal.listEvents({ start: '2026-06-01T00:00:00.000Z', end: '2026-06-30T00:00:00.000Z' }),
    ).rejects.toThrow(/not configured/i);

    const ocr = new RealOcrProvider();
    await expect(ocr.extract({ mimeType: 'image/png' })).rejects.toThrow(/not configured/i);
  });
});
