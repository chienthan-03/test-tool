import type {
  Balance,
  Fill,
  OrderPlan,
  Position,
} from '../core/types.js';

export type ExecutionMode = 'live' | 'testnet' | 'sim' | 'backtest';

export interface ExecutionAdapter {
  readonly mode: ExecutionMode;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getBalance(): Promise<Balance>;
  getPosition(symbol: string): Promise<Position | null>;
  getAllPositions(): Promise<Position[]>;
  placeEntry(plan: OrderPlan): Promise<Fill>;
  placeStopLoss(
    symbol: string,
    side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string>;
  placeTakeProfit(
    symbol: string,
    side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string>;
  reconcile(): Promise<void>;
}
