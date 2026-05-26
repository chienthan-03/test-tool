import { checkEntryAtrBounds } from './atr-guard.js';
import type { EntryEvalContext, EntryPathEvaluator, EntryPathResult } from './types.js';
import type { Candle } from '../../core/types.js';

const rangeSlice = (candles: Candle[], lookback: number): Candle[] =>
  candles.slice(-(lookback + 1), -1);

export class BreakoutEntryEvaluator implements EntryPathEvaluator {
  readonly id = 'breakout' as const;

  evaluate(ctx: EntryEvalContext): EntryPathResult {
    const { symbol, direction, config, store } = ctx;
    const tf = config.timeframes.entry;
    const candles = store.getCandles(symbol, tf);
    const { lookbackBars, bufferPercent } = config.strategy.alternateEntries.breakout;
    const { slAtrMultiplier, tpAtrMultiplier } = config.risk;

    const atrCheck = checkEntryAtrBounds(candles, config);
    if (!atrCheck.ok) {
      return {
        confirm: false,
        reason: atrCheck.reason,
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    const { close, atr: latestAtr } = atrCheck;

    if (candles.length < lookbackBars + 1) {
      return {
        confirm: false,
        reason: 'insufficient_breakout_bars',
        close,
        atr: latestAtr,
      };
    }

    const rangeCandles = rangeSlice(candles, lookbackBars);
    if (rangeCandles.length < lookbackBars) {
      return {
        confirm: false,
        reason: 'insufficient_breakout_bars',
        close,
        atr: latestAtr,
      };
    }

    if (direction === 'long') {
      const rangeHigh = Math.max(...rangeCandles.map((c) => c.high));
      const trigger = rangeHigh * (1 + bufferPercent);
      if (close <= trigger) {
        return {
          confirm: false,
          reason: 'breakout_not_triggered',
          close,
          atr: latestAtr,
        };
      }

      const structureSl = rangeHigh * (1 - bufferPercent);
      const atrSl = close - slAtrMultiplier * latestAtr;
      const stopLoss = Math.max(structureSl, atrSl);
      const takeProfit = close + tpAtrMultiplier * latestAtr;

      return {
        confirm: true,
        close,
        atr: latestAtr,
        stopLoss,
        takeProfit,
      };
    }

    const rangeLow = Math.min(...rangeCandles.map((c) => c.low));
    const trigger = rangeLow * (1 - bufferPercent);
    if (close >= trigger) {
      return {
        confirm: false,
        reason: 'breakout_not_triggered',
        close,
        atr: latestAtr,
      };
    }

    const structureSl = rangeLow * (1 + bufferPercent);
    const atrSl = close + slAtrMultiplier * latestAtr;
    const stopLoss = Math.min(structureSl, atrSl);
    const takeProfit = close - tpAtrMultiplier * latestAtr;

    return {
      confirm: true,
      close,
      atr: latestAtr,
      stopLoss,
      takeProfit,
    };
  }
}
