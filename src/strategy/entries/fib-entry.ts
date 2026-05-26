import type { MtfEngine } from '../mtf-engine.js';
import type { EntryEvalContext, EntryPathEvaluator, EntryPathResult } from './types.js';

export class FibEntryEvaluator implements EntryPathEvaluator {
  readonly id = 'fib' as const;

  constructor(private readonly mtf: MtfEngine) {}

  evaluate(ctx: EntryEvalContext): EntryPathResult {
    const r = this.mtf.evaluateEntry(ctx.symbol, ctx.direction);
    return {
      confirm: r.confirm,
      reason: r.reason,
      close: r.close,
      atr: r.atr,
      stopLoss: r.stopLoss,
      takeProfit: r.takeProfit,
    };
  }
}
