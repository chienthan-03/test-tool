import type { SignalDirection } from '../../core/types.js';
import type { EntryEvalContext } from '../entries/types.js';
import { computeEmaTrendState } from './ema-trend-state.js';
import type { ContextGate, ContextGateResult } from './types.js';

export class EmaTrendContextGate implements ContextGate {
  evaluate(
    symbol: string,
    direction: SignalDirection,
    strength: number,
    ctx: EntryEvalContext,
  ): ContextGateResult {
    const state = computeEmaTrendState(symbol, ctx.store, ctx.config);

    if (!state.ok && state.reason === 'ema_context_insufficient_data') {
      return { allow: false, reason: 'ema_context_insufficient_data' };
    }

    const strongEnough = strength >= ctx.config.sentiment.rules.strongNewsThreshold;
    if (!state.ok && state.reason === 'ema_context_flat') {
      return strongEnough ? { allow: true } : { allow: false, reason: 'ema_context_flat' };
    }

    if (!state.ok) {
      return { allow: false, reason: 'ema_context_insufficient_data' };
    }

    if (direction === state.direction) {
      return { allow: true };
    }

    return { allow: false, reason: 'ema_context_conflict' };
  }
}
