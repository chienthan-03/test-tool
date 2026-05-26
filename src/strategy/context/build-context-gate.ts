import type { AppConfig } from '../../config/schema.js';
import type { MtfEngine } from '../mtf-engine.js';
import { ElliottContextGate } from './elliott-context-gate.js';
import { EmaTrendContextGate } from './ema-trend-context-gate.js';
import type { ContextGate } from './types.js';

export const buildContextGate = (config: AppConfig, mtf: MtfEngine): ContextGate => {
  if (config.strategy.entryProfile === 'intraday') {
    return new EmaTrendContextGate();
  }
  return new ElliottContextGate(mtf);
};
