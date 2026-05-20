import type { AppConfig } from '../config/schema.js';
import { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { RssPoller, type FetchFn } from '../news/rss-poller.js';
import { RssPollerManager } from '../news/rss-poller-manager.js';
import { SymbolMapper } from '../news/symbol-mapper.js';
import { NewsPipeline } from '../sentiment/news-pipeline.js';
import { RuleScorer } from '../sentiment/rule-scorer.js';
import { SignalMerger } from '../sentiment/signal-merger.js';
import { openDatabase } from '../storage/db.js';
import { migrate } from '../storage/migrate.js';
import { FeedRepository } from '../storage/repositories/feed-repo.js';
import { NewsRepository } from '../storage/repositories/news-repo.js';
import { SignalRepository } from '../storage/repositories/signal-repo.js';

export interface NewsStack {
  db: ReturnType<typeof openDatabase>;
  bus: AppEventBus;
  manager: RssPollerManager;
  feedRepo: FeedRepository;
}

export const createNewsStack = (config: AppConfig, fetchFn?: FetchFn): NewsStack => {
  const db = openDatabase(config.storage.sqlitePath);
  migrate(db);

  const bus = new AppEventBus();
  const log = createLogger({
    level: config.logging.level,
    pretty: config.logging.pretty,
  });
  const mapper = new SymbolMapper(config.symbols);
  const scorer = new RuleScorer(config.sentiment.rules);
  const merger = new SignalMerger({
    symbols: config.symbols,
    rules: { minStrength: config.sentiment.rules.minStrength },
    llm: {
      minConfidence: config.sentiment.llm.minConfidence,
      defaultTtlMinutes: config.sentiment.llm.defaultTtlMinutes,
    },
  });

  const pipeline = new NewsPipeline({
    mapper,
    scorer,
    merger,
    newsRepo: new NewsRepository(db),
    signalRepo: new SignalRepository(db),
    bus,
    config,
    log,
  });

  const poller = new RssPoller(fetchFn);
  const feedRepo = new FeedRepository(db);
  const manager = new RssPollerManager({
    config,
    poller,
    pipeline,
    feedRepo,
    bus,
    log,
  });

  return { db, bus, manager, feedRepo };
};
