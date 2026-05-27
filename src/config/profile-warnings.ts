import type { AppConfig } from './schema.js';

export const collectProfileWarnings = (config: AppConfig): string[] => {
  const warnings: string[] = [];
  const { context, entry } = config.timeframes;
  if (config.strategy.entryProfile === 'intraday') {
    if (context === '1d' || entry === '4h') {
      warnings.push('entryProfile intraday with swing timeframes (1d/4h); use 1h/15m recommended');
    }
  }
  if (config.strategy.entryProfile === 'swing') {
    if (entry === '15m' || entry === '5m' || entry === '3m' || entry === '1m') {
      warnings.push('entryProfile swing with intraday entry TF; use 4h entry recommended');
    }
  }
  if (config.strategy.triggerMode === 'technical') {
    if (config.strategy.entryProfile === 'swing') {
      warnings.push('triggerMode technical with entryProfile swing; intraday entryProfile recommended');
    }
    if (config.strategy.newsVeto.enabled) {
      if (config.feeds.some((f) => f.enabled)) {
        warnings.push(
          'newsVeto enabled: RSS feeds active for macro veto; trades remain technical',
        );
      }
      if (!config.symbols.includes(config.strategy.newsVeto.leaderSymbol)) {
        warnings.push(
          `newsVeto.leaderSymbol ${config.strategy.newsVeto.leaderSymbol} not in symbols; BTC leader rule inactive`,
        );
      }
      if (config.sentiment.llm.enabled) {
        warnings.push('newsVeto phase 1 expects rule-only sentiment; llm.enabled should be false');
      }
    } else if (config.feeds.some((f) => f.enabled)) {
      warnings.push('triggerMode technical: RSS feeds are enabled in config but ignored at runtime');
    }
  }
  return warnings;
};
