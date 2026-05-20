import type { NewsItem, RuleScoreResult } from '../core/types.js';

export const SYSTEM_PROMPT = `You are a crypto futures news analyst.
Return ONLY valid JSON with keys: sentiment (-1|0|1), confidence (0-1), affectedSymbols (array), rationale (max 200 chars), ttlMinutes (5-240).
Only include symbols from the provided whitelist.
No markdown. No explanation outside JSON.`;

export const STRICT_SYSTEM_PROMPT = `${SYSTEM_PROMPT}
Your previous response was invalid JSON. Return ONLY a single JSON object with no extra text.`;

export const buildUserPrompt = (
  item: NewsItem,
  rule: RuleScoreResult,
  whitelist: string[],
): string =>
  JSON.stringify({
    title: item.title,
    summary: item.summary ?? '',
    url: item.url,
    publishedAt: item.publishedAt.toISOString(),
    whitelist,
    ruleTags: rule.tags,
    impactScore: rule.impactScore,
    ruleSentiment: rule.ruleSentiment,
  });
