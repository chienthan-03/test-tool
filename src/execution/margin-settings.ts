import type { AppConfig } from '../config/schema.js';

export type MarginMode = 'isolated' | 'cross';
export type BinanceMarginType = 'ISOLATED' | 'CROSSED';

export type ResolvedSymbolMargin = {
  mode: MarginMode;
  leverage: number;
};

export const toBinanceMarginType = (mode: MarginMode): BinanceMarginType =>
  mode === 'isolated' ? 'ISOLATED' : 'CROSSED';

export const resolveSymbolMargin = (
  config: AppConfig,
  symbol: string,
): ResolvedSymbolMargin => {
  const global = config.binance.margin;
  const override = config.symbolOverrides[symbol]?.margin;

  return {
    mode: override?.mode ?? global.mode,
    leverage: override?.leverage ?? global.leverage,
  };
};
