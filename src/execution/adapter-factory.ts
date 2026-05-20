import type Database from 'better-sqlite3';
import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import type { Fill, PositionClosedEvent } from '../core/types.js';
import type { ExecutionAdapter, ExecutionMode } from './adapter.interface.js';
import { SimBroker } from './sim-broker.js';

export const createAdapter = (
  mode: ExecutionMode | AppConfig['mode'],
  config: AppConfig,
  _db?: Database.Database,
  bus?: AppEventBus,
): ExecutionAdapter => {
  if (mode === 'sim') {
    const callbacks = bus
      ? {
          onFill: (fill: Fill) => {
            bus.emit('execution:fill', fill);
          },
          onPositionClosed: (event: PositionClosedEvent) => {
            bus.emit('execution:positionClosed', event);
          },
        }
      : {};
    return new SimBroker(config, callbacks);
  }

  throw new Error(`Execution adapter not implemented for mode: ${mode}`);
};
