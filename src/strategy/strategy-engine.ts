import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type {
  CandleCloseEvent,
  NewsSignal,
  OrderSide,
  TradeIntent,
} from '../core/types.js';
import type { KlineStore } from '../market/kline-store.js';
import type { MtfEngine } from './mtf-engine.js';
import type { PendingSignalStore } from './pending-signals.js';

export class StrategyEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly bus: AppEventBus,
    private readonly _store: KlineStore,
    private readonly mtf: MtfEngine,
    private readonly pending: PendingSignalStore,
    private readonly hasPosition: (symbol: string) => Promise<boolean>,
    private readonly isPaused: () => boolean,
    private readonly getNow: () => Date = () => new Date(),
  ) {
    this.bus.on('news:signal', (signal) => {
      void this.handleNewsSignal(signal);
    });
    this.bus.on('market:candleClose', (event) => {
      void this.handleCandleClose(event);
    });
  }

  private async handleNewsSignal(signal: NewsSignal): Promise<void> {
    if (this.isPaused()) {
      return;
    }

    for (const symbol of signal.symbols) {
      if (
        this.config.strategy.onePositionPerSymbol &&
        (await this.hasPosition(symbol))
      ) {
        continue;
      }
      this.pending.set(symbol, signal, signal.createdAt);
    }
  }

  private async handleCandleClose(event: CandleCloseEvent): Promise<void> {
    if (this.isPaused()) {
      return;
    }

    if (event.tf !== this.config.timeframes.entry) {
      return;
    }

    this.pending.pruneExpired(this.getNow());

    const pendingEntry = this.pending.get(event.symbol);
    if (!pendingEntry) {
      return;
    }

    if (
      this.config.strategy.onePositionPerSymbol &&
      (await this.hasPosition(event.symbol))
    ) {
      this.pending.remove(event.symbol);
      return;
    }

    const { signal, receivedAt } = pendingEntry;

    if (this.config.strategy.entry.waitForNextCandleClose) {
      if (receivedAt.getTime() >= event.candle.closeTime.getTime()) {
        return;
      }
    }

    const context = this.mtf.evaluateContext(
      event.symbol,
      signal.direction,
      signal.strength,
    );
    if (!context.allow) {
      return;
    }

    const entry = this.mtf.evaluateEntry(event.symbol, signal.direction);
    if (!entry.confirm) {
      return;
    }

    const side: OrderSide = signal.direction === 'long' ? 'BUY' : 'SELL';
    const intent: TradeIntent = {
      id: randomUUID(),
      symbol: event.symbol,
      side,
      newsSignalId: signal.id,
      newsId: signal.newsId,
      entryPrice: entry.close,
      atr: entry.atr,
      contextTimeframe: this.config.timeframes.context,
      entryTimeframe: this.config.timeframes.entry,
      createdAt: this.getNow(),
    };

    this.pending.remove(event.symbol);
    this.bus.emit('strategy:intent', intent);
  }
}
