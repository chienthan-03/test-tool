import { describe, it, expect } from 'vitest';
import { SymbolMapper } from '../../src/news/symbol-mapper.js';

describe('SymbolMapper', () => {
  it('maps Bitcoin to BTCUSDT when whitelisted', () => {
    const mapper = new SymbolMapper(['BTCUSDT']);
    expect(mapper.extractSymbols('Bitcoin hits ATH')).toEqual(['BTCUSDT']);
  });

  it('filters symbols not in whitelist', () => {
    const mapper = new SymbolMapper(['BTCUSDT']);
    expect(mapper.extractSymbols('Solana rally')).toEqual([]);
  });

  it('extracts multiple whitelisted tickers', () => {
    const mapper = new SymbolMapper(['BTCUSDT', 'ETHUSDT']);
    expect(mapper.extractSymbols('BTC and ETH rise')).toEqual(['BTCUSDT', 'ETHUSDT']);
  });
});
