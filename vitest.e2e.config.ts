import { defineConfig } from 'vitest/config';

/**
 * Root-level end-to-end / security test config.
 *
 * These suites boot the COMPILED NestJS app (services/api/dist) against the live
 * Postgres with mock providers, so the default esbuild transform is sufficient
 * (no decorator metadata needs emitting here — the app module is already built
 * by `pnpm -r build`). Run them with `pnpm test:e2e`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Serial: suites share Postgres tables and toggle process env.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
