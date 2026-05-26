import type { Candle } from '../../core/types.js';
import type { AppConfig } from '../../config/schema.js';
import { atr, last } from '../../market/indicators.js';

export const checkEntryAtrBounds = (
  candles: Candle[],
  config: AppConfig,
): { ok: true; atr: number; close: number } | { ok: false; reason: string; atr: number; close: number } => {
  const { atrPeriod, minAtrPercent, maxAtrPercent } = config.strategy;
  const latestClose = last(candles.map((c) => c.close));
  if (latestClose === undefined) {
    return { ok: false, reason: 'insufficient_entry_data', atr: 0, close: 0 };
  }
  const latestAtr = last(atr(candles, atrPeriod));
  if (latestAtr === undefined || Number.isNaN(latestAtr)) {
    return { ok: false, reason: 'insufficient_atr', atr: 0, close: latestClose };
  }
  const atrPercent = (latestAtr / latestClose) * 100;
  if (atrPercent < minAtrPercent) {
    return { ok: false, reason: 'atr_below_minimum', atr: latestAtr, close: latestClose };
  }
  if (maxAtrPercent != null && atrPercent > maxAtrPercent) {
    return { ok: false, reason: 'atr_above_maximum', atr: latestAtr, close: latestClose };
  }
  return { ok: true, atr: latestAtr, close: latestClose };
};
