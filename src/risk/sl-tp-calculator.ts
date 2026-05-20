import type { OrderSide } from '../core/types.js';

export const calcSlTp = (params: {
  side: OrderSide;
  entryPrice: number;
  atr: number;
  slMult: number;
  tpMult: number;
}): { stopLoss: number; takeProfit: number } => {
  const { side, entryPrice, atr, slMult, tpMult } = params;
  const slDist = slMult * atr;
  const tpDist = tpMult * atr;
  if (side === 'BUY') {
    return { stopLoss: entryPrice - slDist, takeProfit: entryPrice + tpDist };
  }
  return { stopLoss: entryPrice + slDist, takeProfit: entryPrice - tpDist };
};
