import type Database from 'better-sqlite3';
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type { Logger } from '../core/logger.js';
import type { ExecutionAdapter } from '../execution/adapter.interface.js';
import type { BinanceMarket } from '../market/binance-market.js';
import type { RssPollerManager } from '../news/rss-poller-manager.js';
import type { NewsPipeline } from '../sentiment/news-pipeline.js';
import type { RiskEngine } from '../risk/risk-engine.js';
import type { StrategyEngine } from '../strategy/strategy-engine.js';

export interface RuntimeContext {
  config: AppConfig;
  mode: 'live' | 'testnet' | 'sim';
  bus: AppEventBus;
  log: Logger;
  db: Database.Database;
  adapter: ExecutionAdapter;
  newsPipeline?: NewsPipeline;
  rssManager?: RssPollerManager;
  market: BinanceMarket;
  strategy: StrategyEngine;
  risk: RiskEngine;
  startedAt: Date;
}
