import type { ExecutionAdapter } from './adapter.interface.js';

export class BinanceLiveAdapter implements ExecutionAdapter {
  readonly mode = 'live' as const;

  async connect(): Promise<void> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async disconnect(): Promise<void> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async getBalance(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async getPosition(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async getAllPositions(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async placeEntry(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async placeStopLoss(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async placeTakeProfit(): Promise<never> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }

  async reconcile(): Promise<void> {
    throw new Error('Live trading not implemented yet; use --mode testnet');
  }
}
