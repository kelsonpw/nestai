/**
 * API client selection.
 *
 * `VITE_API_MODE` chooses the implementation ('mock' default, or 'real').
 * The real client targets `VITE_API_BASE_URL`.
 */
import type { ApiMode, NestApiClient } from './client';
import { createMockClient } from './mockClient';
import { createRealClient } from './realClient';

const MODE: ApiMode =
  (import.meta.env.VITE_API_MODE as ApiMode | undefined) ?? 'mock';

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  'http://localhost:3000';

export const apiMode: ApiMode = MODE;

export const api: NestApiClient =
  MODE === 'real' ? createRealClient(BASE_URL) : createMockClient();

export type { NestApiClient, DashboardSnapshot, ApiMode } from './client';
