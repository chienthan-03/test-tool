import type { AppConfig } from '../config/schema.js';
import type { SignalDirection } from '../core/types.js';
import { detectWaveTrend, isValidImpulse } from '../market/elliott-wave.js';
import {
  fibStopLoss,
  fibTakeProfit,
  isInRetraceZone,
} from '../market/fibonacci.js';
import { atr, last } from '../market/indicators.js';
import type { KlineStore } from '../market/kline-store.js';
import { detectSwings, findImpulseLegForEntry } from '../market/swing-detector.js';

export type MtfContextResult = { allow: boolean; reason?: string };

export type MtfEntryResult = {
  confirm: boolean;
  atr: number;
  close: number;
  stopLoss?: number;
  takeProfit?: number;
  reason?: string;
};

const MIN_RISK_REWARD = 1.5;

export class MtfEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly store: KlineStore,
  ) {}

  private get swing() {
    return this.config.strategy.swing;
  }

  private get elliott() {
    return this.config.strategy.elliott;
  }

  private get fib() {
    return this.config.strategy.fibonacci;
  }

  evaluateContext(
    symbol: string,
    direction: SignalDirection,
    strength: number,
  ): MtfContextResult {
    const tf = this.config.timeframes.context;
    const candles = this.store.getCandles(symbol, tf);
    const minBars = this.swing.lookback * 2 + this.swing.minSwingCount * 4;

    if (candles.length < minBars) {
      return { allow: false, reason: 'insufficient_context_data' };
    }

    const swings = detectSwings(candles, this.swing.lookback);
    if (swings.length < this.swing.minSwingCount) {
      return { allow: false, reason: 'insufficient_swings' };
    }

    const trend = detectWaveTrend(swings);
    const impulseOk = isValidImpulse(swings, direction, this.swing.minImpulsePercent);
    const strongEnough = strength >= this.config.sentiment.rules.strongNewsThreshold;
    const trendOk =
      (direction === 'long' && trend === 'bullish') ||
      (direction === 'short' && trend === 'bearish');
    const trendConflict =
      (direction === 'long' && trend === 'bearish') ||
      (direction === 'short' && trend === 'bullish');

    if (trendConflict) {
      return { allow: false, reason: 'elliott_context_conflict' };
    }

    if (this.elliott.contextRequireImpulse) {
      if (trendOk && impulseOk) {
        return { allow: true };
      }
      if (!this.elliott.allowSideways) {
        return { allow: false, reason: 'elliott_sideways_blocked' };
      }
      return strongEnough
        ? { allow: true }
        : { allow: false, reason: 'elliott_sideways_weak' };
    }

    if (trendOk) {
      return { allow: true };
    }

    if (!this.elliott.allowSideways) {
      return { allow: false, reason: 'elliott_sideways_blocked' };
    }

    return strongEnough
      ? { allow: true }
      : { allow: false, reason: 'elliott_sideways_weak' };
  }

  evaluateEntry(symbol: string, direction: SignalDirection): MtfEntryResult {
    const tf = this.config.timeframes.entry;
    const candles = this.store.getCandles(symbol, tf);
    const { atrPeriod, minAtrPercent, maxAtrPercent } = this.config.strategy;
    const minBars = Math.max(atrPeriod + 1, this.swing.lookback * 2 + this.swing.minSwingCount * 4);

    if (candles.length < minBars) {
      return { confirm: false, atr: 0, close: 0, reason: 'insufficient_entry_data' };
    }

    const latestClose = last(candles.map((c) => c.close));
    if (latestClose === undefined) {
      return { confirm: false, atr: 0, close: 0, reason: 'insufficient_entry_data' };
    }

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

    if (maxAtrPercent != null && atrPercent > maxAtrPercent) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'atr_above_maximum',
      };
    }

    const swings = detectSwings(candles, this.swing.lookback);
    if (swings.length < 2) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'insufficient_swings',
      };
    }

    const leg = findImpulseLegForEntry(swings, direction, latestClose);
    if (!leg) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'no_matching_impulse_leg',
      };
    }

    const inZone = isInRetraceZone(
      latestClose,
      leg,
      this.fib.entryMin,
      this.fib.entryMax,
      this.fib.zoneTolerancePercent,
    );

    if (!inZone) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'outside_fib_zone',
      };
    }

    const stopLoss = fibStopLoss(
      leg,
      this.fib.stopLevel,
      this.fib.stopBelowSwing,
      this.fib.stopBufferPercent,
    );
    const takeProfit = fibTakeProfit(leg, this.fib.targetExtension);

    const risk =
      direction === 'long' ? latestClose - stopLoss : stopLoss - latestClose;
    const reward =
      direction === 'long' ? takeProfit - latestClose : latestClose - takeProfit;

    if (risk <= 0 || reward <= 0 || reward / risk < MIN_RISK_REWARD) {
      return {
        confirm: false,
        atr: latestAtr,
        close: latestClose,
        reason: 'risk_reward_too_low',
      };
    }

    return {
      confirm: true,
      atr: latestAtr,
      close: latestClose,
      stopLoss,
      takeProfit,
    };
  }
}
