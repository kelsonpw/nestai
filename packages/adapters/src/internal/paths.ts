/**
 * Shared filesystem helpers for mock adapters.
 *
 * Mock providers read fixtures from the repo-root `fixtures/` directory and
 * write deterministic JSON "sinks" under `fixtures/_sink/`. We resolve the
 * fixtures root relative to this compiled file so it works from `dist/` too,
 * with an env override (`NESTAI_FIXTURES_DIR`) for tests / custom layouts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the repo-root `fixtures/` directory.
 *
 * Compiled layout: `<repo>/packages/adapters/dist/internal/paths.js`, so the
 * fixtures dir is five levels up. Overridable via `NESTAI_FIXTURES_DIR`.
 */
export function fixturesDir(): string {
  const override = process.env.NESTAI_FIXTURES_DIR;
  if (override && override.length > 0) return resolve(override);
  return resolve(here, '..', '..', '..', '..', '..', 'fixtures');
}

/** Resolve a path inside the fixtures directory. */
export function fixturePath(...segments: string[]): string {
  return join(fixturesDir(), ...segments);
}

/** Resolve a path inside the deterministic mock sink (`fixtures/_sink/...`). */
export function sinkPath(...segments: string[]): string {
  return join(fixturesDir(), '_sink', ...segments);
}

/**
 * Write a deterministic JSON file, creating parent directories as needed.
 * Returns the absolute path written.
 */
export async function writeJsonSink(
  relativeFile: string,
  data: unknown,
): Promise<string> {
  const full = sinkPath(relativeFile);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
  return full;
}
