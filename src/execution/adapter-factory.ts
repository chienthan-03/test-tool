import type Database from 'better-sqlite3';
import type { AppConfig } from '../config/schema.js';
import type { ExecutionAdapter, ExecutionMode } from './adapter.interface.js';
import { SimBroker } from './sim-broker.js';

export const createAdapter = (
  mode: ExecutionMode | AppConfig['mode'],
  config: AppConfig,
  _db?: Database.Database,
): ExecutionAdapter => {
  if (mode === 'sim') {
    return new SimBroker(config);
  }

  throw new Error(`Execution adapter not implemented for mode: ${mode}`);
};
