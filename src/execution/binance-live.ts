import type { AppConfig } from '../config/schema.js';
import { createLogger } from '../core/logger.js';
import type { FuturesFetch } from './binance-futures.js';
import {
  BinanceFuturesAdapter,
  type BinanceFuturesCallbacks,
} from './binance-futures-adapter.js';

export type BinanceLiveCallbacks = BinanceFuturesCallbacks;

const LIVE_WARN_MSG = 'LIVE TRADING ENABLED - real funds at risk';

export class BinanceLiveAdapter extends BinanceFuturesAdapter {
  private readonly warnLog = createLogger({ level: 'info', pretty: false });

  constructor(
    config: AppConfig,
    apiKey: string,
    apiSecret: string,
    callbacks: BinanceLiveCallbacks = {},
    fetchFn?: FuturesFetch,
  ) {
    super('live', config.binance.baseUrl, config, apiKey, apiSecret, callbacks, fetchFn);
  }

  override async connect(): Promise<void> {
    this.warnLog.warn({}, LIVE_WARN_MSG);
    await super.connect();
  }
}
