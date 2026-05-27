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
import type { EntryGate } from './entry-gate.js';
import type { NewsVetoEvaluator } from './news-veto-evaluator.js';
import type { PendingSignalStore } from './pending-signals.js';
import { resolveEmaContextDirection } from './technical-direction.js';

const TECHNICAL_NEWS_ID = 'technical';
const TECHNICAL_STRENGTH = 1.0;

export class StrategyEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly bus: AppEventBus,
    private readonly _store: KlineStore,
    private readonly entryGate: EntryGate,
    private readonly pending: PendingSignalStore,
    private readonly hasPosition: (symbol: string) => Promise<boolean>,
    private readonly isInCooldown: (symbol: string) => boolean = () => false,
    private readonly isPaused: () => boolean,
    private readonly getNow: () => Date = () => new Date(),
    private readonly newsVeto?: NewsVetoEvaluator,
  ) {
    this.bus.on('news:signal', (signal) => {
      void this.handleNewsSignal(signal);
    });
    this.bus.on('market:candleClose', (event) => {
      void this.handleCandleClose(event);
    });
  }

  private async handleNewsSignal(signal: NewsSignal): Promise<void> {
    if (this.config.strategy.triggerMode === 'technical') {
      return;
    }

    if (this.isPaused()) {
      return;
    }

    for (const symbol of signal.symbols) {
      if (this.isInCooldown(symbol)) {
        continue;
      }
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
    if (event.tf !== this.config.timeframes.entry) {
      return;
    }

    if (this.isPaused()) {
      return;
    }

    if (this.config.strategy.triggerMode === 'technical') {
      await this.handleTechnicalCandleClose(event);
      return;
    }

    this.pending.pruneExpired(this.getNow());

    const pendingEntry = this.pending.get(event.symbol);
    if (!pendingEntry) {
      return;
    }

    if (this.isInCooldown(event.symbol)) {
      this.pending.remove(event.symbol);
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

    const gate = this.entryGate.evaluate(
      event.symbol,
      signal.direction,
      signal.strength,
    );
    if (!gate.allow || !gate.entry) {
      return;
    }

    const entry = gate.entry;

    const side: OrderSide = signal.direction === 'long' ? 'BUY' : 'SELL';
    const intent: TradeIntent = {
      id: randomUUID(),
      symbol: event.symbol,
      side,
      newsSignalId: signal.id,
      newsId: signal.newsId,
      entryPrice: entry.close,
      atr: entry.atr,
      stopLoss: entry.stopLoss,
      takeProfit: entry.takeProfit,
      contextTimeframe: this.config.timeframes.context,
      entryTimeframe: this.config.timeframes.entry,
      entryPath: gate.entryPath ?? 'fib',
      createdAt: this.getNow(),
    };

    this.pending.remove(event.symbol);
    this.bus.emit('strategy:intent', intent);
  }

  private async handleTechnicalCandleClose(_event: CandleCloseEvent): Promise<void> {
    for (const symbol of this.config.symbols) {
      if (this.isInCooldown(symbol)) {
        continue;
      }
      if (
        this.config.strategy.onePositionPerSymbol &&
        (await this.hasPosition(symbol))
      ) {
        continue;
      }

      const direction = resolveEmaContextDirection(symbol, this._store, this.config);
      if (!direction) {
        continue;
      }

      const gate = this.entryGate.evaluate(symbol, direction, TECHNICAL_STRENGTH);
      if (!gate.allow || !gate.entry) {
        continue;
      }

      if (this.newsVeto) {
        const veto = this.newsVeto.shouldVeto(symbol, direction, this.getNow());
        if (veto.veto) {
          continue;
        }
      }

      const entry = gate.entry;
      const side: OrderSide = direction === 'long' ? 'BUY' : 'SELL';
      const intent: TradeIntent = {
        id: randomUUID(),
        symbol,
        side,
        newsSignalId: `technical-${symbol}-${this.getNow().toISOString()}`,
        newsId: TECHNICAL_NEWS_ID,
        entryPrice: entry.close,
        atr: entry.atr,
        stopLoss: entry.stopLoss,
        takeProfit: entry.takeProfit,
        contextTimeframe: this.config.timeframes.context,
        entryTimeframe: this.config.timeframes.entry,
        entryPath: gate.entryPath ?? 'fib',
        createdAt: this.getNow(),
      };

      this.bus.emit('strategy:intent', intent);
    }
  }
}
