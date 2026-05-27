import { signalId } from '../core/hash.js';
import type { AppConfig } from '../config/schema.js';
import type {
  LlmSentiment,
  NewsItem,
  NewsSignal,
  RuleScoreResult,
  SentimentDirection,
  SignalDirection,
  SignalSource,
} from '../core/types.js';
import { computeStrength } from './signal-strength.js';

export type SignalMergerConfig = {
  symbols: string[];
  rules: Pick<AppConfig['sentiment']['rules'], 'minStrength'>;
  llm: Pick<AppConfig['sentiment']['llm'], 'minConfidence' | 'defaultTtlMinutes'>;
};

export class SignalMerger {
  private readonly whitelist: Set<string>;

  constructor(private readonly config: SignalMergerConfig) {
    this.whitelist = new Set(config.symbols);
  }

  build(
    rule: RuleScoreResult,
    news: NewsItem,
    llm?: LlmSentiment | null,
  ): NewsSignal | null {
    const symbols = news.symbols.filter((symbol) => this.whitelist.has(symbol));
    if (symbols.length === 0) {
      return null;
    }

    let sentiment: SentimentDirection;
    let source: SignalSource;
    let usedLlm = false;
    let confidence: number | undefined;
    let ttlMinutes = this.config.llm.defaultTtlMinutes;

    if (llm != null) {
      if (llm.confidence >= this.config.llm.minConfidence) {
        sentiment = llm.sentiment;
        source = 'llm';
        usedLlm = true;
        confidence = llm.confidence;
        ttlMinutes = llm.ttlMinutes;
      } else {
        sentiment = rule.ruleSentiment;
        source = 'merged';
      }
    } else {
      sentiment = rule.ruleSentiment;
      source = 'rule';
    }

    if (sentiment === 0) {
      return null;
    }

    const strength = computeStrength({
      impactScore: rule.impactScore,
      ruleSentiment: rule.ruleSentiment,
      confidence,
      usedLlm,
    });

    if (strength < this.config.rules.minStrength) {
      return null;
    }

    const direction: SignalDirection = sentiment === 1 ? 'long' : 'short';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

    return {
      id: signalId(),
      newsId: news.id,
      symbols,
      direction,
      strength,
      expiresAt,
      source,
      createdAt: now,
      tags: rule.tags,
    };
  }
}
