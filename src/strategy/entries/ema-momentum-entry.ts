import type { OrderSide } from '../../core/types.js';
import { ema, last } from '../../market/indicators.js';
import { calcSlTp } from '../../risk/sl-tp-calculator.js';
import { checkEntryAtrBounds } from './atr-guard.js';
import type { EntryEvalContext, EntryPathEvaluator, EntryPathResult } from './types.js';

const directionToSide = (direction: 'long' | 'short'): OrderSide =>
  direction === 'long' ? 'BUY' : 'SELL';

export class EmaMomentumEntryEvaluator implements EntryPathEvaluator {
  readonly id = 'emaMomentum' as const;

  evaluate(ctx: EntryEvalContext): EntryPathResult {
    const { symbol, direction, config, store } = ctx;
    const emaCfg = config.strategy.alternateEntries.emaMomentum;
    const entryTf = config.timeframes.entry;
    const candles = store.getCandles(symbol, entryTf);

    const minBars = Math.max(emaCfg.slowPeriod, emaCfg.fastPeriod + emaCfg.slopeLookback);
    if (candles.length < minBars) {
      const close = store.getLatestClose(symbol, entryTf) ?? 0;
      return { confirm: false, reason: 'insufficient_ema_bars', close, atr: 0 };
    }

    const atrCheck = checkEntryAtrBounds(candles, config);
    if (!atrCheck.ok) {
      return {
        confirm: false,
        reason: atrCheck.reason,
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    const closes = candles.map((c) => c.close);
    const emaFast = ema(closes, emaCfg.fastPeriod);
    const emaSlow = ema(closes, emaCfg.slowPeriod);

    const fastNow = last(emaFast);
    const slowNow = last(emaSlow);
    if (
      fastNow === undefined ||
      slowNow === undefined ||
      Number.isNaN(fastNow) ||
      Number.isNaN(slowNow)
    ) {
      return {
        confirm: false,
        reason: 'insufficient_ema_bars',
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    const aligned =
      direction === 'long' ? fastNow > slowNow : fastNow < slowNow;
    if (!aligned) {
      return {
        confirm: false,
        reason: 'ema_not_aligned',
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    if (emaCfg.requireCloseBeyondSlow) {
      const priceOk =
        direction === 'long'
          ? atrCheck.close > slowNow
          : atrCheck.close < slowNow;
      if (!priceOk) {
        return {
          confirm: false,
          reason: 'ema_price_beyond_slow',
          close: atrCheck.close,
          atr: atrCheck.atr,
        };
      }
    }

    const fastPrior = emaFast[emaFast.length - 1 - emaCfg.slopeLookback];
    if (fastPrior === undefined || Number.isNaN(fastPrior) || fastPrior === 0) {
      return {
        confirm: false,
        reason: 'insufficient_ema_bars',
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    const slopePct = (fastNow - fastPrior) / fastPrior;
    const slopeOk = direction === 'long' ? slopePct > 0 : slopePct < 0;
    if (!slopeOk) {
      return {
        confirm: false,
        reason: 'ema_slope_weak',
        close: atrCheck.close,
        atr: atrCheck.atr,
      };
    }

    const side = directionToSide(direction);
    const { stopLoss, takeProfit } = calcSlTp({
      side,
      entryPrice: atrCheck.close,
      atr: atrCheck.atr,
      slMult: config.risk.slAtrMultiplier,
      tpMult: config.risk.tpAtrMultiplier,
    });

    return {
      confirm: true,
      close: atrCheck.close,
      atr: atrCheck.atr,
      stopLoss,
      takeProfit,
    };
  }
}
