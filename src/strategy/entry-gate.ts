import type { AppConfig } from '../config/schema.js';
import { createLogger } from '../core/logger.js';
import type { SignalDirection } from '../core/types.js';
import type { MtfEngine, MtfEntryResult } from './mtf-engine.js';

export type EntryGateStage = 'context' | 'entry';

export type EntryGateResult = {
  allow: boolean;
  reason?: string;
  stage?: EntryGateStage;
  entry?: MtfEntryResult;
};

export class EntryGate {
  private readonly log;

  constructor(
    private readonly config: AppConfig,
    private readonly mtf: MtfEngine,
  ) {
    this.log = createLogger({
      level: config.logging.level,
      pretty: config.logging.pretty,
    });
  }

  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
  ): EntryGateResult {
    if (!this.config.entryGates.enabled) {
      const entry = this.mtf.evaluateEntry(symbol, direction);
      if (!entry.confirm) {
        return { allow: false, reason: entry.reason, stage: 'entry' };
      }
      return { allow: true, entry };
    }

    const context = this.mtf.evaluateContext(symbol, direction, strength);
    if (!context.allow) {
      this.logReject(symbol, direction, context.reason ?? 'context_blocked', 'context');
      return {
        allow: false,
        reason: context.reason,
        stage: 'context',
      };
    }

    const entry = this.mtf.evaluateEntry(symbol, direction);
    if (!entry.confirm) {
      this.logReject(symbol, direction, entry.reason ?? 'entry_blocked', 'entry');
      return {
        allow: false,
        reason: entry.reason,
        stage: 'entry',
      };
    }

    return { allow: true, entry };
  }

  private logReject(
    symbol: string,
    direction: SignalDirection,
    reason: string,
    stage: EntryGateStage,
  ): void {
    if (!this.config.entryGates.logRejects) {
      return;
    }
    this.log.info(
      { symbol, direction, reason, stage },
      'entry gate rejected',
    );
  }
}
