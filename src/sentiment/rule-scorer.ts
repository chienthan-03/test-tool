import type { AppConfig } from '../config/schema.js';
import type {
  NewsItem,
  RulePriority,
  RuleScoreResult,
  SentimentDirection,
} from '../core/types.js';

export type RuleScoreDiscard = { discard: true };

export type RuleScoreOutcome = RuleScoreResult | RuleScoreDiscard | null;

export class RuleScorer {
  constructor(private readonly config: AppConfig['sentiment']['rules']) {}

  score(item: NewsItem): RuleScoreOutcome {
    const text = this.combineText(item);

    if (this.matchesBlacklist(text)) {
      return { discard: true };
    }

    if (item.symbols.length === 0) {
      return { discard: true };
    }

    const { tags, impactScore } = this.scoreTags(text);
    const bullCount = this.countKeywordMatches(text, this.config.bullishKeywords);
    const bearCount = this.countKeywordMatches(text, this.config.bearishKeywords);
    const ruleSentiment = this.resolveRuleSentiment(bullCount, bearCount);
    const priority = this.resolvePriority(impactScore, tags);
    const { needsLlm, needsLlmReason } = this.resolveNeedsLlm({
      priority,
      ruleSentiment,
      impactScore,
      bullCount,
      bearCount,
    });

    return {
      newsId: item.id,
      impactScore,
      ruleSentiment,
      priority,
      tags,
      needsLlm,
      needsLlmReason,
    };
  }

  private combineText(item: NewsItem): string {
    return `${item.title} ${item.summary ?? ''}`.trim();
  }

  private matchesBlacklist(text: string): boolean {
    const lower = text.toLowerCase();
    return this.config.blacklistKeywords.some((keyword) =>
      lower.includes(keyword.toLowerCase()),
    );
  }

  private scoreTags(text: string): { tags: string[]; impactScore: number } {
    const tags: string[] = [];
    let impactScore = 0;

    for (const rule of this.config.tagRules) {
      const matched = rule.keywords.some((keyword) =>
        this.textContains(text, keyword),
      );
      if (matched) {
        tags.push(rule.tag);
        impactScore += rule.impact;
      }
    }

    return { tags, impactScore: Math.min(impactScore, 10) };
  }

  private textContains(text: string, keyword: string): boolean {
    return text.toLowerCase().includes(keyword.toLowerCase());
  }

  private countKeywordMatches(text: string, keywords: string[]): number {
    return keywords.filter((keyword) => this.textContains(text, keyword)).length;
  }

  private resolveRuleSentiment(
    bullCount: number,
    bearCount: number,
  ): SentimentDirection {
    if (bullCount > bearCount) {
      return 1;
    }
    if (bearCount > bullCount) {
      return -1;
    }
    return 0;
  }

  private resolvePriority(impactScore: number, tags: string[]): RulePriority {
    const hasMacroTag = tags.some((tag) => this.config.macroTags.includes(tag));
    if (impactScore >= this.config.impactHigh || hasMacroTag) {
      return 'high';
    }
    if (impactScore >= 1) {
      return 'medium';
    }
    return 'low';
  }

  private resolveNeedsLlm(input: {
    priority: RulePriority;
    ruleSentiment: SentimentDirection;
    impactScore: number;
    bullCount: number;
    bearCount: number;
  }): { needsLlm: boolean; needsLlmReason?: string } {
    if (input.priority === 'high' && input.ruleSentiment === 0) {
      return { needsLlm: true, needsLlmReason: 'high_priority_neutral_sentiment' };
    }

    if (input.priority === 'high' && input.bullCount > 0 && input.bearCount > 0) {
      return { needsLlm: true, needsLlmReason: 'high_priority_conflicting_keywords' };
    }

    if (input.impactScore >= this.config.thresholdLLM) {
      return { needsLlm: true, needsLlmReason: 'impact_threshold' };
    }

    return { needsLlm: false };
  }
}
