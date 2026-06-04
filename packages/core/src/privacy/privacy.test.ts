import { describe, it, expect } from 'vitest';
import { scrub, unscrub } from './scrubber.js';

describe('scrub / unscrub', () => {
  it('tokenizes email, phone and address and round-trips', () => {
    const text =
      'Email me at jane@example.com or call 555-123-4567. Drop off at 123 Main St.';
    const { scrubbedText, tokenMap } = scrub(text);
    expect(scrubbedText).not.toContain('jane@example.com');
    expect(scrubbedText).not.toContain('555-123-4567');
    expect(scrubbedText).toContain('[EMAIL_1]');
    expect(scrubbedText).toContain('[PHONE_1]');
    expect(tokenMap.some((t) => t.type === 'ADDRESS')).toBe(true);

    expect(unscrub(scrubbedText, tokenMap)).toBe(text);
  });

  it('reuses one token for repeated identical values', () => {
    const { tokenMap } = scrub('call 555-123-4567 then 555-123-4567 again');
    const phones = tokenMap.filter((t) => t.type === 'PHONE');
    expect(phones.length).toBe(1);
  });

  it('drops originals when keepOriginals is false', () => {
    const { tokenMap } = scrub('jane@example.com', { keepOriginals: false });
    expect(tokenMap[0].original).toBeUndefined();
  });
});
