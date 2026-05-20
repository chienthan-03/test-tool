import { z } from 'zod';

export const LlmSentimentSchema = z.object({
  sentiment: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  confidence: z.number().min(0).max(1),
  affectedSymbols: z.array(z.string()),
  rationale: z.string().max(200),
  ttlMinutes: z.number().int().min(5).max(240),
});

export type ParsedLlmSentiment = z.infer<typeof LlmSentimentSchema>;
