import { describe, it, expect } from 'vitest';
import { MockOcrProvider } from './mock.js';

describe('MockOcrProvider', () => {
  const ocr = new MockOcrProvider();

  it('returns canned text for the school-flyer fixture', async () => {
    const res = await ocr.extract({
      url: 'fixtures/ocr/school-flyer.png',
      mimeType: 'image/png',
    });
    expect(res.text).toContain('Permission slip due Friday 3pm.');
    expect(res.blocks?.length).toBeGreaterThan(0);
  });

  it('returns canned text for the work-screenshot fixture', async () => {
    const res = await ocr.extract({
      url: '/some/path/work-screenshot.png',
      mimeType: 'image/png',
    });
    expect(res.text).toContain('BUSY all day');
  });

  it('is deterministic for the same input', async () => {
    const input = { url: 'school-flyer.png', mimeType: 'image/png' };
    expect(await ocr.extract(input)).toEqual(await ocr.extract(input));
  });

  it('falls back gracefully for unknown files', async () => {
    const res = await ocr.extract({ url: 'unknown.png', mimeType: 'image/png' });
    expect(res.text).toContain('no fixture');
  });
});
