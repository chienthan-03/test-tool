import type { Candle } from '../core/types.js';
import { atr, last } from './indicators.js';

const MAX_CANDLES = 200;

export type CandleCloseCallback = (symbol: string, tf: string, candle: Candle) => void;

const storeKey = (symbol: string, tf: string): string => `${symbol}|${tf}`;

export class KlineStore {
  private readonly buffers = new Map<string, Candle[]>();
  private readonly closeCallbacks: CandleCloseCallback[] = [];

  update(symbol: string, tf: string, candle: Candle): void {
    const key = storeKey(symbol, tf);
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = [];
      this.buffers.set(key, buf);
    }

    const lastCandle = buf[buf.length - 1];
    const wasClosed = lastCandle?.isClosed ?? false;

    if (lastCandle && lastCandle.openTime.getTime() === candle.openTime.getTime()) {
      buf[buf.length - 1] = candle;
    } else {
      buf.push(candle);
      if (buf.length > MAX_CANDLES) {
        buf.shift();
      }
    }

    if (candle.isClosed && (!wasClosed || lastCandle?.openTime.getTime() !== candle.openTime.getTime())) {
      this.notifyClose(symbol, tf, candle);
    }
  }

  getCandles(symbol: string, tf: string, count?: number): Candle[] {
    const buf = this.buffers.get(storeKey(symbol, tf)) ?? [];
    if (count === undefined || count >= buf.length) {
      return [...buf];
    }
    return buf.slice(-count);
  }

  onCandleClose(cb: CandleCloseCallback): void {
    this.closeCallbacks.push(cb);
  }

  getLatestClose(symbol: string, tf: string): number | undefined {
    const candle = last(this.buffers.get(storeKey(symbol, tf)) ?? []);
    return candle?.close;
  }

  getLatestAtr(symbol: string, tf: string, period = 14): number | undefined {
    const candles = this.buffers.get(storeKey(symbol, tf)) ?? [];
    const series = atr(candles, period);
    const value = last(series);
    if (value === undefined || Number.isNaN(value)) {
      return undefined;
    }
    return value;
  }

  private notifyClose(symbol: string, tf: string, candle: Candle): void {
    for (const cb of this.closeCallbacks) {
      cb(symbol, tf, candle);
    }
  }
}
