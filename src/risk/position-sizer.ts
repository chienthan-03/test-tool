export const calcQuantity = (params: {
  availableBalance: number;
  positionPercent: number;
  entryPrice: number;
  minNotional: number;
  maxNotional: number | null;
  stepSize: number;
  minQty: number;
  leverage?: number;
}): { quantity: number; notional: number } | null => {
  const leverage = params.leverage ?? 1;
  let notional = params.availableBalance * (params.positionPercent / 100) * leverage;
  if (params.maxNotional != null) {
    notional = Math.min(notional, params.maxNotional);
  }
  if (notional < params.minNotional) {
    return null;
  }
  const rawQty = notional / params.entryPrice;
  const quantity = Math.floor(rawQty / params.stepSize) * params.stepSize;
  if (quantity < params.minQty) {
    return null;
  }
  return { quantity, notional: quantity * params.entryPrice };
};
