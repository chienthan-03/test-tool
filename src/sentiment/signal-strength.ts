import type { SentimentDirection } from '../core/types.js';

export function computeStrength(params: {
  impactScore: number;
  ruleSentiment: SentimentDirection;
  confidence?: number;
  usedLlm: boolean;
}): number {
  const base = Math.min(params.impactScore / 5, 1);
  if (params.usedLlm && params.confidence != null) {
    return base * 0.4 + params.confidence * 0.6;
  }
  return base * (params.ruleSentiment !== 0 ? 1 : 0.5);
}
