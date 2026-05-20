import type { AppConfig } from '../config/schema.js';
import type { FuturesFetch } from './binance-futures.js';
import {
  BinanceFuturesAdapter,
  type BinanceFuturesCallbacks,
} from './binance-futures-adapter.js';

export type BinanceTestnetCallbacks = BinanceFuturesCallbacks;

export class BinanceTestnetAdapter extends BinanceFuturesAdapter {
  constructor(
    config: AppConfig,
    apiKey: string,
    apiSecret: string,
    callbacks: BinanceTestnetCallbacks = {},
    fetchFn?: FuturesFetch,
  ) {
    super('testnet', config.binance.testnetBaseUrl, config, apiKey, apiSecret, callbacks, fetchFn);
  }
}
