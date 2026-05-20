import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type { Logger } from '../core/logger.js';
import type { RssRawItem } from '../core/types.js';
import { NewsDedupe } from '../news/dedupe.js';
import { normalizeRssItem } from '../news/normalizer.js';
import type { SymbolMapper } from '../news/symbol-mapper.js';
import type { NewsRepository } from '../storage/repositories/news-repo.js';
import type { SignalRepository } from '../storage/repositories/signal-repo.js';
import type { RuleScorer, RuleScoreDiscard } from './rule-scorer.js';
import type { SignalMerger } from './signal-merger.js';

const isDiscard = (result: unknown): result is RuleScoreDiscard =>
  result !== null && typeof result === 'object' && 'discard' in result && result.discard === true;

export class NewsPipeline {
  private readonly dedupe: NewsDedupe;

  constructor(
    private readonly deps: {
      mapper: SymbolMapper;
      scorer: RuleScorer;
      merger: SignalMerger;
      newsRepo: NewsRepository;
      signalRepo: SignalRepository;
      bus: AppEventBus;
      config: AppConfig;
      log: Logger;
    },
  ) {
    this.dedupe = new NewsDedupe(deps.newsRepo);
  }

  async processRawItem(raw: RssRawItem, sourceId: string): Promise<void> {
    const news = normalizeRssItem(raw, sourceId, this.deps.mapper);

    if (news.symbols.length === 0) {
      return;
    }

    if (!this.dedupe.shouldProcess(news.id)) {
      return;
    }

    this.deps.newsRepo.insertRaw(news, JSON.stringify(raw));

    const scoreResult = this.deps.scorer.score(news);
    if (isDiscard(scoreResult)) {
      this.deps.newsRepo.markProcessed(news.id);
      return;
    }

    if (scoreResult === null) {
      this.deps.newsRepo.markProcessed(news.id);
      return;
    }

    const signal = this.deps.merger.build(scoreResult, news, null);
    if (signal === null) {
      this.deps.newsRepo.markProcessed(news.id);
      return;
    }

    this.deps.signalRepo.insert(signal);
    this.deps.bus.emit('news:signal', signal);
    this.deps.newsRepo.markProcessed(news.id);

    this.deps.log.debug(
      { newsId: news.id, symbols: signal.symbols, direction: signal.direction },
      'news signal emitted',
    );
  }
}
