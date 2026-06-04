import { describe, it, expect } from 'vitest';
import type { ExtractionResult, LlmProvider } from '@nestai/contracts';
import { extract, postProcess } from './extractor.js';

const NOW = '2026-06-04T12:00:00.000Z';

function fakeLlm(result: ExtractionResult): LlmProvider {
  return {
    extractTasks: async () => result,
    route: async () => ({ assignedMemberId: null, confidence: 0, rationale: '' }),
  };
}

describe('postProcess', () => {
  it('dedupes tasks keeping the highest confidence and drops empty titles', () => {
    const raw: ExtractionResult = {
      tasks: [
        { title: 'Pay fee', urgency: 'MED', category: 'ADMIN', requiredSkills: [], requiresApproval: false, confidence: 0.4 },
        { title: 'Pay fee', urgency: 'MED', category: 'ADMIN', requiredSkills: [], requiresApproval: false, confidence: 0.9 },
        { title: '', urgency: 'MED', category: 'ADMIN', requiredSkills: [], requiresApproval: false, confidence: 0.9 },
      ],
      events: [],
      confidence: 0.8,
    };
    const out = postProcess(raw);
    expect(out.tasks.length).toBe(1);
    expect(out.tasks[0].confidence).toBe(0.9);
  });

  it('normalizes invalid urgency/category and clamps confidence', () => {
    const raw = {
      tasks: [
        { title: 'X', urgency: 'WAT', category: 'NOPE', confidence: 5 } as never,
      ],
      events: [],
      confidence: 2,
    } as unknown as ExtractionResult;
    const out = postProcess(raw);
    expect(out.tasks[0].urgency).toBe('MED');
    expect(out.tasks[0].category).toBe('ADMIN');
    expect(out.tasks[0].confidence).toBe(1);
    expect(out.confidence).toBe(1);
  });
});

describe('extract', () => {
  it('calls the injected provider and post-processes', async () => {
    const llm = fakeLlm({
      tasks: [
        { title: 'Sign slip', urgency: 'HIGH', category: 'SCHOOL', requiredSkills: [], requiresApproval: true, confidence: 0.7 },
      ],
      events: [],
      confidence: 0.7,
    });
    const out = await extract({ text: 'sign the permission slip', llm, now: NOW });
    expect(out.tasks.length).toBe(1);
    expect(out.tasks[0].title).toBe('Sign slip');
  });
});
