import type { AppConfig } from '../config/schema.js';
import type { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import type { SignalDirection } from '../core/types.js';
import type { KlineStore } from '../market/kline-store.js';
import type { EntryPathRegistry } from './entries/registry.js';
import type { EntryEvalContext, EntryPathId, EntryPathResult } from './entries/types.js';
import type { MtfEngine } from './mtf-engine.js';

export type EntryGateStage = 'context' | 'entry';

export type EntryGateResult = {
  allow: boolean;
  reason?: string;
  stage?: EntryGateStage;
  entry?: EntryPathResult;
  entryPath?: EntryPathId;
};

export class EntryGate {
  private readonly log;

  constructor(
    private readonly config: AppConfig,
    private readonly mtf: MtfEngine,
    private readonly registry: EntryPathRegistry,
    private readonly store: KlineStore,
    private readonly bus?: AppEventBus,
    private readonly getNow: () => Date = () => new Date(),
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
    const ctx: EntryEvalContext = {
      symbol,
      direction,
      strength,
      config: this.config,
      store: this.store,
    };

    if (!this.config.entryGates.enabled) {
      const r = this.registry.primary.evaluate(ctx);
      if (!r.confirm) {
        return { allow: false, reason: r.reason, stage: 'entry' };
      }
      return { allow: true, entry: r, entryPath: 'fib' };
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

    const primary = this.registry.primary.evaluate(ctx);
    if (primary.confirm) {
      return { allow: true, entry: primary, entryPath: 'fib' };
    }

    const altCfg = this.config.strategy.alternateEntries;
    if (!altCfg.enabled || !altCfg.fallbackOnReasons.includes(primary.reason ?? '')) {
      this.logReject(symbol, direction, primary.reason ?? 'entry_blocked', 'entry');
      return {
        allow: false,
        reason: primary.reason,
        stage: 'entry',
      };
    }

    for (const evaluator of this.registry.alternates) {
      const alt = evaluator.evaluate(ctx);
      if (alt.confirm) {
        return { allow: true, entry: alt, entryPath: evaluator.id };
      }
    }

    return { allow: false, reason: primary.reason, stage: 'entry' };
  }

  private logReject(
    symbol: string,
    direction: SignalDirection,
    reason: string,
    stage: EntryGateStage,
  ): void {
    if (this.config.entryGates.captureRejects && this.bus) {
      this.bus.emit('strategy:gateReject', {
        symbol,
        direction,
        reason,
        stage,
        at: this.getNow().toISOString(),
      });
    }

    if (!this.config.entryGates.logRejects) {
      return;
    }
    this.log.info(
      { symbol, direction, reason, stage },
      'entry gate rejected',
    );
  }
}
