import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config/schema.js';
import type {
  Balance,
  Candle,
  Fill,
  OrderPlan,
  OrderSide,
  Position,
  PositionClosedEvent,
  PositionSide,
} from '../core/types.js';
import type { ExecutionAdapter } from './adapter.interface.js';

export type SimBrokerCallbacks = {
  onFill?: (fill: Fill) => void;
  onPositionClosed?: (event: PositionClosedEvent) => void;
};

type InternalPosition = {
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryFee: number;
  slOrderId: string;
  tpOrderId: string;
};

const sideToPositionSide = (side: OrderSide): PositionSide =>
  side === 'BUY' ? 'LONG' : 'SHORT';

const applyEntrySlippage = (
  basePrice: number,
  side: OrderSide,
  slippageBps: number,
  fillModel: AppConfig['sim']['fillModel'],
): number => {
  const slip = slippageBps / 10_000;
  const conservativeLong = basePrice * (1 + slip);
  const conservativeShort = basePrice * (1 - slip);
  const optimisticLong = basePrice * (1 - slip);
  const optimisticShort = basePrice * (1 + slip);

  if (side === 'BUY') {
    return fillModel === 'conservative' ? conservativeLong : optimisticLong;
  }
  return fillModel === 'conservative' ? conservativeShort : optimisticShort;
};

const applyExitSlippage = (
  basePrice: number,
  side: PositionSide,
  slippageBps: number,
  fillModel: AppConfig['sim']['fillModel'],
): number => {
  const slip = slippageBps / 10_000;
  if (side === 'LONG') {
    return fillModel === 'conservative' ? basePrice * (1 - slip) : basePrice * (1 + slip);
  }
  return fillModel === 'conservative' ? basePrice * (1 + slip) : basePrice * (1 - slip);
};

export class SimBroker implements ExecutionAdapter {
  readonly mode = 'sim' as const;

  private connected = false;
  private balanceUsdt: number;
  private readonly positions = new Map<string, InternalPosition>();
  private readonly markPrices = new Map<string, number>();
  private orderSeq = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly callbacks: SimBrokerCallbacks = {},
  ) {
    this.balanceUsdt = config.sim.initialBalanceUsdt;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getBalance(): Promise<Balance> {
    const equity = this.computeEquity();
    return { available: equity, total: equity };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const pos = this.positions.get(symbol);
    if (!pos) {
      return null;
    }
    return this.toPublicPosition(pos);
  }

  async getAllPositions(): Promise<Position[]> {
    return [...this.positions.values()].map((p) => this.toPublicPosition(p));
  }

  async placeEntry(plan: OrderPlan): Promise<Fill> {
    this.assertConnected();
    if (this.positions.has(plan.symbol)) {
      throw new Error(`Position already open for ${plan.symbol}`);
    }

    const mark = this.markPrices.get(plan.symbol);
    if (mark == null) {
      throw new Error(`No mark price for ${plan.symbol}; call onPriceUpdate first`);
    }

    const fillPrice = applyEntrySlippage(
      mark,
      plan.side,
      this.config.sim.slippageBps,
      this.config.sim.fillModel,
    );
    const fee = fillPrice * plan.quantity * this.config.sim.feeRate;
    this.balanceUsdt -= fee;

    const positionSide = sideToPositionSide(plan.side);
    const internal: InternalPosition = {
      symbol: plan.symbol,
      side: positionSide,
      quantity: plan.quantity,
      entryPrice: fillPrice,
      stopLoss: plan.stopLoss,
      takeProfit: plan.takeProfit,
      entryFee: fee,
      slOrderId: '',
      tpOrderId: '',
    };
    this.positions.set(plan.symbol, internal);

    const fill: Fill = {
      orderId: this.nextOrderId(),
      symbol: plan.symbol,
      side: plan.side,
      price: fillPrice,
      quantity: plan.quantity,
      fee,
      timestamp: new Date(),
    };

    this.callbacks.onFill?.(fill);
    return fill;
  }

  async placeStopLoss(
    symbol: string,
    _side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string> {
    this.assertConnected();
    const pos = this.requirePosition(symbol);
    pos.stopLoss = stopPrice;
    if (quantity !== pos.quantity) {
      pos.quantity = quantity;
    }
    if (!pos.slOrderId) {
      pos.slOrderId = this.nextOrderId();
    }
    return pos.slOrderId;
  }

  async placeTakeProfit(
    symbol: string,
    _side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string> {
    this.assertConnected();
    const pos = this.requirePosition(symbol);
    pos.takeProfit = stopPrice;
    if (quantity !== pos.quantity) {
      pos.quantity = quantity;
    }
    if (!pos.tpOrderId) {
      pos.tpOrderId = this.nextOrderId();
    }
    return pos.tpOrderId;
  }

  async reconcile(): Promise<void> {
    // Sim mode has no external state to reconcile.
  }

  onPriceUpdate(symbol: string, candle: Candle): void {
    this.markPrices.set(symbol, candle.close);
    this.checkIntrabar(candle);
  }

  checkIntrabar(candle: Candle): void {
    const pos = this.positions.get(candle.symbol);
    if (!pos) {
      return;
    }

    const slHit = this.isStopHit(pos, candle);
    const tpHit = this.isTakeProfitHit(pos, candle);

    if (!slHit && !tpHit) {
      return;
    }

    if (slHit && tpHit) {
      this.closePosition(pos, pos.stopLoss, 'SL');
      return;
    }

    if (slHit) {
      this.closePosition(pos, pos.stopLoss, 'SL');
      return;
    }

    this.closePosition(pos, pos.takeProfit, 'TP');
  }

  private isStopHit(pos: InternalPosition, candle: Candle): boolean {
    if (pos.side === 'LONG') {
      return candle.low <= pos.stopLoss;
    }
    return candle.high >= pos.stopLoss;
  }

  private isTakeProfitHit(pos: InternalPosition, candle: Candle): boolean {
    if (pos.side === 'LONG') {
      return candle.high >= pos.takeProfit;
    }
    return candle.low <= pos.takeProfit;
  }

  private closePosition(
    pos: InternalPosition,
    exitBasePrice: number,
    _reason: 'SL' | 'TP',
  ): void {
    const exitPrice = applyExitSlippage(
      exitBasePrice,
      pos.side,
      this.config.sim.slippageBps,
      this.config.sim.fillModel,
    );
    const exitFee = exitPrice * pos.quantity * this.config.sim.feeRate;
    const direction = pos.side === 'LONG' ? 1 : -1;
    const grossPnl = (exitPrice - pos.entryPrice) * pos.quantity * direction;
    const netPnl = grossPnl - pos.entryFee - exitFee;

    this.balanceUsdt += grossPnl - exitFee;
    this.positions.delete(pos.symbol);

    const closed: PositionClosedEvent = {
      symbol: pos.symbol,
      pnl: netPnl,
      exitPrice,
      feesUsdt: pos.entryFee + exitFee,
    };
    this.callbacks.onPositionClosed?.(closed);
  }

  private computeEquity(): number {
    let equity = this.balanceUsdt;
    for (const pos of this.positions.values()) {
      const mark = this.markPrices.get(pos.symbol) ?? pos.entryPrice;
      const direction = pos.side === 'LONG' ? 1 : -1;
      equity += (mark - pos.entryPrice) * pos.quantity * direction;
    }
    return equity;
  }

  private toPublicPosition(pos: InternalPosition): Position {
    const mark = this.markPrices.get(pos.symbol) ?? pos.entryPrice;
    const direction = pos.side === 'LONG' ? 1 : -1;
    const unrealizedPnl = (mark - pos.entryPrice) * pos.quantity * direction - pos.entryFee;
    return {
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      unrealizedPnl,
    };
  }

  private requirePosition(symbol: string): InternalPosition {
    const pos = this.positions.get(symbol);
    if (!pos) {
      throw new Error(`No open position for ${symbol}`);
    }
    return pos;
  }

  private nextOrderId(): string {
    this.orderSeq += 1;
    return `sim-${randomUUID().slice(0, 8)}-${this.orderSeq}`;
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('SimBroker not connected');
    }
  }
}
