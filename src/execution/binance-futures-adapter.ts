import type { AppConfig } from '../config/schema.js';
import { CircuitBreaker } from '../core/circuit-breaker.js';
import type {
  Balance,
  Fill,
  OrderPlan,
  OrderSide,
  Position,
  PositionClosedEvent,
} from '../core/types.js';
import { createLogger } from '../core/logger.js';
import { getServerTime } from '../market/binance-rest.js';
import { BinanceFuturesClient, type FuturesFetch } from './binance-futures.js';
import type { ExecutionAdapter } from './adapter.interface.js';
import {
  getSymbolFilters,
  loadExchangeInfo,
  roundPrice,
  roundQuantity,
} from './exchange-info.js';

const RECONCILE_INTERVAL_MS = 30_000;

export type BinanceFuturesCallbacks = {
  onFill?: (fill: Fill) => void;
  onPositionClosed?: (event: PositionClosedEvent) => void;
};

type TrackedEntry = {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  entryFee: number;
  slOrderId?: string;
  tpOrderId?: string;
};

export class BinanceFuturesAdapter implements ExecutionAdapter {
  readonly mode: 'testnet' | 'live';

  private readonly client: BinanceFuturesClient;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly log = createLogger({ level: 'info', pretty: false });
  private connected = false;
  private reconcileTimer: ReturnType<typeof setInterval> | undefined;
  private readonly trackedEntries = new Map<string, TrackedEntry>();
  private readonly lastPositions = new Map<string, Position>();

  constructor(
    mode: 'testnet' | 'live',
    private readonly baseUrl: string,
    private readonly config: AppConfig,
    apiKey: string,
    apiSecret: string,
    private readonly callbacks: BinanceFuturesCallbacks = {},
    fetchFn?: FuturesFetch,
  ) {
    this.mode = mode;
    this.client = new BinanceFuturesClient(
      baseUrl,
      apiKey,
      apiSecret,
      config.binance.recvWindow,
      fetchFn,
    );
    this.circuitBreaker = new CircuitBreaker(config.binance.circuitBreaker);
  }

  async connect(): Promise<void> {
    try {
      await getServerTime(this.baseUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn({ err: message, mode: this.mode }, 'binance_server_time_sync_skipped');
    }

    await loadExchangeInfo(this.baseUrl, this.config.symbols);
    this.connected = true;

    await this.reconcile();

    this.reconcileTimer = setInterval(() => {
      void this.reconcile().catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error({ err: message, mode: this.mode }, 'binance_reconcile_failed');
      });
    }, RECONCILE_INTERVAL_MS);
  }

  async disconnect(): Promise<void> {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
    }
    this.connected = false;
  }

  async getBalance(): Promise<Balance> {
    this.assertConnected();
    const available = await this.callApi(() => this.client.getBalance());
    return { available, total: available };
  }

  async getPosition(symbol: string): Promise<Position | null> {
    this.assertConnected();
    return this.callApi(() => this.client.getPositionRisk(symbol));
  }

  async getAllPositions(): Promise<Position[]> {
    this.assertConnected();
    return this.callApi(() => this.client.getAllPositionRisk());
  }

  async placeEntry(plan: OrderPlan): Promise<Fill> {
    this.assertConnected();
    this.assertCircuitClosed('placeEntry');

    const filters = await getSymbolFilters(this.baseUrl, plan.symbol);
    const quantity = roundQuantity(plan.quantity, filters.stepSize);
    const stopLoss = roundPrice(plan.stopLoss, filters.tickSize);
    const takeProfit = roundPrice(plan.takeProfit, filters.tickSize);

    if (quantity < filters.minQty) {
      throw new Error(`Quantity ${quantity} below minQty ${filters.minQty} for ${plan.symbol}`);
    }

    const existing = await this.getPosition(plan.symbol);
    if (existing) {
      throw new Error(`Position already open for ${plan.symbol}`);
    }

    const order = await this.callApi(() =>
      this.client.placeMarketOrder(plan.symbol, plan.side, quantity),
    );

    const fillPrice = order.avgPrice ? Number(order.avgPrice) : plan.notionalUsdt / quantity;
    const fillQty = order.executedQty ? Number(order.executedQty) : quantity;
    const fill: Fill = {
      orderId: String(order.orderId),
      symbol: plan.symbol,
      side: plan.side,
      price: fillPrice,
      quantity: fillQty,
      fee: 0,
      timestamp: new Date(),
    };

    this.trackedEntries.set(plan.symbol, {
      symbol: plan.symbol,
      side: plan.side,
      quantity: fillQty,
      entryPrice: fillPrice,
      entryFee: 0,
    });

    const exitSide: OrderSide = plan.side === 'BUY' ? 'SELL' : 'BUY';
    const slId = await this.placeStopLoss(plan.symbol, exitSide, stopLoss, fillQty);
    const tpId = await this.placeTakeProfit(plan.symbol, exitSide, takeProfit, fillQty);

    const tracked = this.trackedEntries.get(plan.symbol);
    if (tracked) {
      tracked.slOrderId = slId;
      tracked.tpOrderId = tpId;
    }
    this.callbacks.onFill?.(fill);
    return fill;
  }

  async placeStopLoss(
    symbol: string,
    side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string> {
    this.assertConnected();
    const tracked = this.trackedEntries.get(symbol);
    if (tracked?.slOrderId) {
      return tracked.slOrderId;
    }

    this.assertCircuitClosed('placeStopLoss');
    const filters = await getSymbolFilters(this.baseUrl, symbol);
    const roundedQty = roundQuantity(quantity, filters.stepSize);
    const roundedStop = roundPrice(stopPrice, filters.tickSize);

    const order = await this.callApi(() =>
      this.client.placeStopMarket(symbol, side as OrderSide, roundedStop, roundedQty),
    );
    const orderId = String(order.orderId);
    if (tracked) {
      tracked.slOrderId = orderId;
    }
    return orderId;
  }

  async placeTakeProfit(
    symbol: string,
    side: string,
    stopPrice: number,
    quantity: number,
  ): Promise<string> {
    this.assertConnected();
    const tracked = this.trackedEntries.get(symbol);
    if (tracked?.tpOrderId) {
      return tracked.tpOrderId;
    }

    this.assertCircuitClosed('placeTakeProfit');
    const filters = await getSymbolFilters(this.baseUrl, symbol);
    const roundedQty = roundQuantity(quantity, filters.stepSize);
    const roundedStop = roundPrice(stopPrice, filters.tickSize);

    const order = await this.callApi(() =>
      this.client.placeTakeProfitMarket(symbol, side as OrderSide, roundedStop, roundedQty),
    );
    const orderId = String(order.orderId);
    if (tracked) {
      tracked.tpOrderId = orderId;
    }
    return orderId;
  }

  async reconcile(): Promise<void> {
    if (!this.connected) {
      return;
    }

    const positions = await this.callApi(() => this.client.getAllPositionRisk());
    const openSymbols = new Set(positions.map((p) => p.symbol));

    if (this.lastPositions.size === 0) {
      for (const pos of positions) {
        this.lastPositions.set(pos.symbol, pos);
      }
      return;
    }

    for (const [symbol, prev] of this.lastPositions) {
      if (!openSymbols.has(symbol) && this.trackedEntries.has(symbol)) {
        const entry = this.trackedEntries.get(symbol)!;
        const exitPrice = prev.entryPrice;
        const direction = entry.side === 'BUY' ? 1 : -1;
        const grossPnl = (exitPrice - entry.entryPrice) * entry.quantity * direction;
        const closed: PositionClosedEvent = {
          symbol,
          pnl: grossPnl - entry.entryFee,
          exitPrice,
          feesUsdt: entry.entryFee,
        };
        this.callbacks.onPositionClosed?.(closed);
        this.trackedEntries.delete(symbol);
      }
    }

    this.lastPositions.clear();
    for (const pos of positions) {
      this.lastPositions.set(pos.symbol, pos);
    }
  }

  private assertCircuitClosed(action: string): void {
    if (this.circuitBreaker.isOpen()) {
      this.log.warn({ action, mode: this.mode }, 'circuit_breaker_halt');
      throw new Error('circuit_breaker_open');
    }
  }

  private async callApi<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.circuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      this.circuitBreaker.recordFailure();
      throw err;
    }
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error(`BinanceFuturesAdapter (${this.mode}) not connected`);
    }
  }
}
