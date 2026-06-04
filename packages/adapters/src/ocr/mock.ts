/**
 * MockOcrProvider — returns canned text keyed by file name (the basename of
 * `file.url`). The school-flyer and work-screenshot fixtures therefore yield
 * deterministic text and blocks. No network, no secrets.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type { OcrProvider } from '@nestai/contracts';
import { fixturePath } from '../internal/paths.js';

interface OcrFixtureEntry {
  text: string;
  blocks?: unknown[];
}

export interface MockOcrConfig {
  /** Fixtures map under fixtures/, defaults to "ocr/ocr-fixtures.json". */
  fixturesRelativePath?: string;
}

export class MockOcrProvider implements OcrProvider {
  private readonly fixturesRelativePath: string;
  private cache?: Record<string, OcrFixtureEntry>;

  constructor(config: MockOcrConfig = {}) {
    this.fixturesRelativePath = config.fixturesRelativePath ?? 'ocr/ocr-fixtures.json';
  }

  private async load(): Promise<Record<string, OcrFixtureEntry>> {
    if (!this.cache) {
      const raw = await readFile(
        fixturePath(...this.fixturesRelativePath.split('/')),
        'utf8',
      );
      this.cache = JSON.parse(raw) as Record<string, OcrFixtureEntry>;
    }
    return this.cache;
  }

  async extract(file: {
    url?: string;
    bytes?: Uint8Array;
    mimeType: string;
  }): Promise<{ text: string; blocks?: unknown[] }> {
    const fixtures = await this.load();
    const key = file.url ? basename(file.url) : undefined;
    if (key && fixtures[key]) {
      return { text: fixtures[key].text, blocks: fixtures[key].blocks };
    }
    // Deterministic fallback so the mock never throws on unknown inputs.
    return {
      text: key
        ? `[mock-ocr] no fixture for "${key}" (${file.mimeType})`
        : `[mock-ocr] ${file.bytes?.length ?? 0} bytes (${file.mimeType})`,
      blocks: [],
    };
  }
}
