import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Point the mock adapters at the repo-root fixtures regardless of cwd.
    env: {
      NESTAI_FIXTURES_DIR: resolve(here, '..', '..', 'fixtures'),
    },
    include: ['src/**/*.test.ts'],
  },
});
