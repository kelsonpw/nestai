/**
 * DI tokens used across the NestAI API.
 *
 * Providers (LLM/calendar/email/messaging/ocr) and the singleton Prisma client
 * are injected by token so wiring stays explicit and esbuild-friendly (vitest's
 * transformer does not emit decorator metadata for interface params).
 */
export const PRISMA = Symbol('PRISMA');
export const PROVIDERS = Symbol('PROVIDERS');
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const CALENDAR_PROVIDER = Symbol('CALENDAR_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
export const JOB_QUEUE = Symbol('JOB_QUEUE');
