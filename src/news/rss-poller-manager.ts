import type { AppConfig, FeedConfig } from '../config/schema.js';
import type { Logger } from '../core/logger.js';
import type { FeedRepository } from '../storage/repositories/feed-repo.js';
import type { NewsPipeline } from '../sentiment/news-pipeline.js';
import { RssPoller } from './rss-poller.js';

const DEGRADED_FAILURE_THRESHOLD = 5;
const DEGRADED_SKIP_MS = 10 * 60 * 1000;

interface FeedRuntimeState {
  timer?: ReturnType<typeof setInterval>;
  degradedUntil?: number;
}

export class RssPollerManager {
  private readonly feedStates = new Map<string, FeedRuntimeState>();
  private started = false;

  constructor(
    private readonly deps: {
      config: AppConfig;
      poller: RssPoller;
      pipeline: NewsPipeline;
      feedRepo: FeedRepository;
      log: Logger;
    },
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    for (const feed of this.deps.config.feeds) {
      if (!feed.enabled) {
        continue;
      }

      this.scheduleFeed(feed);
    }
  }

  stop(): void {
    for (const state of this.feedStates.values()) {
      if (state.timer) {
        clearInterval(state.timer);
      }
    }

    this.feedStates.clear();
    this.started = false;
  }

  async pollFeed(feed: FeedConfig): Promise<void> {
    const state = this.getFeedState(feed.id);

    if (state.degradedUntil !== undefined && Date.now() < state.degradedUntil) {
      this.deps.log.warn({ feedId: feed.id }, 'feed degraded, skipping poll');
      return;
    }

    if (state.degradedUntil !== undefined && Date.now() >= state.degradedUntil) {
      state.degradedUntil = undefined;
    }

    try {
      const items = await this.deps.poller.poll(feed.url);

      for (const item of items) {
        await this.deps.pipeline.processRawItem(item, feed.id);
      }

      this.deps.feedRepo.upsertStatus({
        feedId: feed.id,
        lastSuccessAt: new Date(),
        lastErrorAt: null,
        lastError: null,
        consecutiveFailures: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const existing = this.deps.feedRepo.getStatus(feed.id);
      const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;

      this.deps.feedRepo.upsertStatus({
        feedId: feed.id,
        lastErrorAt: new Date(),
        lastError: message,
        consecutiveFailures,
      });

      this.deps.log.error(
        { feedId: feed.id, err: message, consecutiveFailures },
        'rss poll failed',
      );

      if (consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD) {
        state.degradedUntil = Date.now() + DEGRADED_SKIP_MS;
        this.deps.log.warn(
          { feedId: feed.id, skipMs: DEGRADED_SKIP_MS },
          'feed marked degraded',
        );
      }
    }
  }

  private scheduleFeed(feed: FeedConfig): void {
    const state = this.getFeedState(feed.id);

    void this.pollFeed(feed);

    state.timer = setInterval(() => {
      void this.pollFeed(feed);
    }, feed.pollIntervalSec * 1000);
  }

  private getFeedState(feedId: string): FeedRuntimeState {
    let state = this.feedStates.get(feedId);
    if (!state) {
      state = {};
      this.feedStates.set(feedId, state);
    }

    return state;
  }
}
