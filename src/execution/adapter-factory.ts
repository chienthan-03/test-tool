import type Database from 'better-sqlite3';
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type { Fill, PositionClosedEvent } from '../core/types.js';
import { BinanceLiveAdapter } from './binance-live.js';
import { BinanceTestnetAdapter } from './binance-testnet.js';
import type { ExecutionAdapter, ExecutionMode } from './adapter.interface.js';
import { SimBroker } from './sim-broker.js';

const busCallbacks = (bus: AppEventBus) => ({
  onFill: (fill: Fill) => {
    bus.emit('execution:fill', fill);
  },
  onPositionClosed: (event: PositionClosedEvent) => {
    bus.emit('execution:positionClosed', event);
  },
});

export const createAdapter = (
  mode: ExecutionMode | AppConfig['mode'],
  config: AppConfig,
  _db?: Database.Database,
  bus?: AppEventBus,
): ExecutionAdapter => {
  if (mode === 'sim') {
    const callbacks = bus ? busCallbacks(bus) : {};
    return new SimBroker(config, callbacks);
  }

  if (mode === 'testnet') {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET required for testnet');
    }
    const callbacks = bus ? busCallbacks(bus) : {};
    return new BinanceTestnetAdapter(config, apiKey, apiSecret, callbacks);
  }

  if (mode === 'live') {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET required for live');
    }
    const callbacks = bus ? busCallbacks(bus) : {};
    return new BinanceLiveAdapter(config, apiKey, apiSecret, callbacks);
  }

  throw new Error(`Execution adapter not implemented for mode: ${mode}`);
};
