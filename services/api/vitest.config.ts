import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * Vitest config for @nestai/api integration tests.
 *
 * NestJS DI relies on `reflect-metadata` + emitted `design:paramtypes`. Vitest's
 * default esbuild transform does NOT emit decorator metadata, so we transform
 * with SWC (legacy decorators + `decoratorMetadata`) to make constructor
 * injection work exactly as it does in the tsc build.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests boot Nest against the live Postgres; run serially to
    // avoid cross-test interference on shared tables.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
