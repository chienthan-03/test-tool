import type { SignalDirection } from '../../core/types.js';
import type { EntryEvalContext } from '../entries/types.js';

export type ContextGateResult = { allow: boolean; reason?: string };

export interface ContextGate {
  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
    ctx: EntryEvalContext,
  ): ContextGateResult;
}
