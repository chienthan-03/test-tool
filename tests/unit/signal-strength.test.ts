import { describe, it, expect } from 'vitest';
import { computeStrength } from '../../src/sentiment/signal-strength.js';

describe('computeStrength', () => {
  it('llm blend', () => {
    const strength = computeStrength({
      impactScore: 5,
      ruleSentiment: 0,
      confidence: 0.9,
      usedLlm: true,
    });

    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(1);
    expect(strength).toBeCloseTo(0.94, 5);
  });

  it('rule-only scales with impact and sentiment', () => {
    const directional = computeStrength({
      impactScore: 3,
      ruleSentiment: 1,
      usedLlm: false,
    });
    const neutral = computeStrength({
      impactScore: 3,
      ruleSentiment: 0,
      usedLlm: false,
    });

    expect(directional).toBeCloseTo(0.6, 5);
    expect(neutral).toBeCloseTo(0.3, 5);
  });
});
