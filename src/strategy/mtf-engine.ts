import type { AppConfig } from '../config/schema.js';
import type { SignalDirection } from '../core/types.js';
import { atr, ema, emaSlopeDown, emaSlopeUp, last } from '../market/indicators.js';
import type { KlineStore } from '../market/kline-store.js';

export type MtfContextResult = { allow: boolean; reason?: string };

export type MtfEntryResult = {
  confirm: boolean;
  atr: number;
  close: number;
  reason?: string;
};

export class MtfEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly store: KlineStore,
  ) {}

  evaluateContext(
    symbol: string,
    direction: SignalDirection,
    strength: number,
  ): MtfContextResult {
    const tf = this.config.timeframes.context;
    const candles = this.store.getCandles(symbol, tf);
    const period = this.config.strategy.emaContextPeriod;

    if (candles.length < period) {
      return { allow: false, reason: 'insufficient_context_data' };
    }

    const closes = candles.map((c) => c.close);
    const emaSeries = ema(closes, period);
    const latestClose = last(closes);
    const latestEma = last(emaSeries);

    if (
      latestClose === undefined ||
      latestEma === undefined ||
      Number.isNaN(latestEma)
    ) {
      return { allow: false, reason: 'insufficient_context_data' };
    }

    const bullish =
      latestClose > latestEma && emaSlopeUp(emaSeries);
    const bearish =
      latestClose < latestEma && emaSlopeDown(emaSeries);
    const strongEnough =
      strength >= this.config.sentiment.rules.strongNewsThreshold;

    if (direction === 'long') {
      if (bullish) {
        return { allow: true };
      }
      if (bearish) {
        return { allow: false, reason: 'mtf_context_conflict' };
      }
      return strongEnough
        ? { allow: true }
        : { allow: false, reason: 'mtf_context_sideways_weak' };
    }

    if (bearish) {
      return { allow: true };
    }
    if (bullish) {
      return { allow: false, reason: 'mtf_context_conflict' };
    }
    return strongEnough
      ? { allow: true }
      : { allow: false, reason: 'mtf_context_sideways_weak' };
  }

  evaluateEntry(symbol: string, direction: SignalDirection): MtfEntryResult {
    const tf = this.config.timeframes.entry;
    const candles = this.store.getCandles(symbol, tf);
    const { emaEntryPeriod, atrPeriod, minAtrPercent, entry } =
      this.config.strategy;

    const minBars = Math.max(emaEntryPeriod, atrPeriod);
    if (candles.length < minBars) {
      return { confirm: false, atr: 0, close: 0, reason: 'insufficient_entry_data' };
    }

    const closes = candles.map((c) => c.close);
    const latestClose = last(closes);
    if (latestClose === undefined) {
      return { confirm: false, atr: 0, close: 0, reason: 'insufficient_entry_data' };
    }

    const emaSeries = ema(closes, emaEntryPeriod);
    const latestEma = last(emaSeries);
    const atrSeries = atr(candles, atrPeriod);
    const latestAtr = last(atrSeries);

    if (latestAtr === undefined || Number.isNaN(latestAtr)) {
      return {
        confirm: false,
        atr: 0,
        close: latestClose,
        reason: 'insufficient_atr',
      };
    }

    const atrPercent = (latestAtr / latestClose) * 100;
    if (atrPercent < minAtrPercent) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'atr_below_minimum',
      };
    }

    if (entry.requireEmaConfirm) {
      if (latestEma === undefined || Number.isNaN(latestEma)) {
        return {
          confirm: false,
          atr: latestAtr,
          close: latestClose,
          reason: 'insufficient_ema',
        };
      }
      if (direction === 'long' && latestClose <= latestEma) {
        return {
          confirm: false,
          atr: latestAtr,
          close: latestClose,
          reason: 'ema_not_confirmed',
        };
      }
      if (direction === 'short' && latestClose >= latestEma) {
        return {
          confirm: false,
          atr: latestAtr,
          close: latestClose,
          reason: 'ema_not_confirmed',
        };
      }
    }

    return { confirm: true, atr: latestAtr, close: latestClose };
  }
}
