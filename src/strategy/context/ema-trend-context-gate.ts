import { ema, last } from '../../market/indicators.js';
import type { SignalDirection } from '../../core/types.js';
import type { EntryEvalContext } from '../entries/types.js';
import type { ContextGate, ContextGateResult } from './types.js';

export class EmaTrendContextGate implements ContextGate {
  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
    ctx: EntryEvalContext,
  ): ContextGateResult {
    const emaCfg = ctx.config.strategy.profiles.intraday.contextEma;
    const tf = ctx.config.timeframes.context;
    const candles = ctx.store.getCandles(symbol, tf);
    const minBars = emaCfg.slowPeriod + 5;

    if (candles.length < minBars) {
      return { allow: false, reason: 'ema_context_insufficient_data' };
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
      Number.isNaN(slow)
    ) {
      return { allow: false, reason: 'ema_context_insufficient_data' };
    }

    const strongEnough = strength >= ctx.config.sentiment.rules.strongNewsThreshold;
    const spreadRatio = Math.abs(fast - slow) / close;
    const isFlat = spreadRatio < emaCfg.flatPercent;

    if (isFlat) {
      return strongEnough ? { allow: true } : { allow: false, reason: 'ema_context_flat' };
    }

    if (direction === 'long' && fast > slow) {
      return { allow: true };
    }
    if (direction === 'short' && fast < slow) {
      return { allow: true };
    }

    return { allow: false, reason: 'ema_context_conflict' };
  }
}
