import { fetch } from 'undici';
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type { Logger } from '../core/logger.js';
import type { Candle } from '../core/types.js';
import { fetchKlines, type RestFetch } from './binance-rest.js';
import { BinanceWsClient } from './binance-ws.js';
import { KlineStore } from './kline-store.js';
import { streamName, toBinanceInterval } from './timeframe.js';

export class BinanceMarket {
  private ws: BinanceWsClient | undefined;

  constructor(
    private readonly store: KlineStore,
    private readonly bus: AppEventBus,
    private readonly config: AppConfig,
    private readonly log: Logger,
    private readonly fetchFn: RestFetch = fetch,
  ) {}

  async start(symbols: string[], intervals: string[]): Promise<void> {
    const baseUrl = this.getRestBaseUrl();

    for (const symbol of symbols) {
      for (const interval of intervals) {
        const binanceInterval = toBinanceInterval(interval);
        const candles = await fetchKlines(
          baseUrl,
          symbol,
          binanceInterval,
          200,
          this.fetchFn,
        );

        for (const candle of candles) {
          this.store.update(symbol, interval, candle);
        }
      }
    }

    const streams = symbols.flatMap((symbol) =>
      intervals.map((interval) =>
        streamName(symbol, toBinanceInterval(interval)),
      ),
    );

    this.ws = new BinanceWsClient(
      this.getWsBaseUrl(),
      (candle) => this.handleClosedCandle(candle),
      this.log,
      this.config.binance.wsReconnectMaxRetries,
    );
    this.ws.subscribeKlines(streams);
  }

  stop(): void {
    this.ws?.close();
    this.ws = undefined;
  }

  private handleClosedCandle(candle: Candle): void {
    const tf = candle.interval;
    this.store.update(candle.symbol, tf, candle);
    this.bus.emit('market:candleClose', { symbol: candle.symbol, tf, candle });
  }

  private getRestBaseUrl(): string {
    return this.config.mode === 'testnet'
      ? this.config.binance.testnetBaseUrl
      : this.config.binance.baseUrl;
  }

  private getWsBaseUrl(): string {
    return this.config.mode === 'testnet'
      ? this.config.binance.testnetWsUrl
      : this.config.binance.mainnetWsUrl;
  }
}
