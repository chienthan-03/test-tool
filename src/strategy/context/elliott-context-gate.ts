import type { MtfEngine } from '../mtf-engine.js';
import type { ContextGate, ContextGateResult } from './types.js';
import type { SignalDirection } from '../../core/types.js';
import type { EntryEvalContext } from '../entries/types.js';

export class ElliottContextGate implements ContextGate {
  constructor(private readonly mtf: MtfEngine) {}

  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
    _ctx: EntryEvalContext,
  ): ContextGateResult {
    return this.mtf.evaluateContext(symbol, direction, strength);
  }
}
