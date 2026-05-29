import type { AppConfig } from '../../config/schema.js';
import type { SignalDirection } from '../../core/types.js';
import type { KlineStore } from '../../market/kline-store.js';
import { ema, last } from '../../market/indicators.js';

export type EmaTrendState =
  | {
      ok: false;
      reason: 'ema_context_insufficient_data' | 'ema_context_flat' | 'ema_context_price_filter';
    }
  | {
      ok: true;
      fast: number;
      slow: number;
      close: number;
      isFlat: boolean;
      direction: SignalDirection;
    };

export const computeEmaTrendState = (
  symbol: string,
  store: KlineStore,
  config: AppConfig,
): EmaTrendState => {
  const emaCfg = config.strategy.profiles.intraday.contextEma;
  const tf = config.timeframes.context;
  const candles = store.getCandles(symbol, tf);
  const minBars = emaCfg.slowPeriod + 5;

  if (candles.length < minBars) {
    return { ok: false, reason: 'ema_context_insufficient_data' };
  }

  const closes = candles.map((c) => c.close);
  const emaFastSeries = ema(closes, emaCfg.fastPeriod);
  const emaSlowSeries = ema(closes, emaCfg.slowPeriod);
  const fast = last(emaFastSeries);
  const slow = last(emaSlowSeries);
  const close = last(closes);

  if (
    fast === undefined ||
    slow === undefined ||
    close === undefined ||
    Number.isNaN(fast) ||
    Number.isNaN(slow) ||
    Number.isNaN(close)
  ) {
    return { ok: false, reason: 'ema_context_insufficient_data' };
  }

  const spreadRatio = Math.abs(fast - slow) / close;
  const isFlat = spreadRatio < emaCfg.flatPercent;

  if (isFlat) {
    return { ok: false, reason: 'ema_context_flat' };
  }

  const direction: SignalDirection = fast > slow ? 'long' : 'short';

  if (emaCfg.requireCloseBeyondSlow) {
    if (direction === 'long' && close <= slow) {
      return { ok: false, reason: 'ema_context_price_filter' };
    }
    if (direction === 'short' && close >= slow) {
      return { ok: false, reason: 'ema_context_price_filter' };
    }
  }

  return {
    ok: true,
    fast,
    slow,
    close,
    isFlat: false,
    direction,
  };
};
