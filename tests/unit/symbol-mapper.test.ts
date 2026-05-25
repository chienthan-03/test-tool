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

  const expandedWhitelist = [
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
  ];

  it('maps Solana to SOLUSDT when whitelisted', () => {
    const mapper = new SymbolMapper(expandedWhitelist);
    expect(mapper.extractSymbols('Solana rally lifts SOL')).toEqual(['SOLUSDT']);
  });

  it('maps BNB and XRP in order of appearance', () => {
    const mapper = new SymbolMapper(expandedWhitelist);
    expect(mapper.extractSymbols('BNB and XRP surge')).toEqual(['BNBUSDT', 'XRPUSDT']);
  });

  it('still filters non-whitelisted tickers like Dogecoin', () => {
    const mapper = new SymbolMapper(expandedWhitelist);
    expect(mapper.extractSymbols('Dogecoin only')).toEqual([]);
  });
});
