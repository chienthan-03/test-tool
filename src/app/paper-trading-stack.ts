import type { AppConfig } from '../config/schema.js';
import { AppEventBus } from '../core/event-bus.js';
import type {
  BacktestTradeRecord,
  EntryPathId,
  Fill,
  GateRejectRecord,
  OrderPlan,
  OrderSide,
  TradeIntent,
} from '../core/types.js';
import type { SimBroker } from '../execution/sim-broker.js';
import { KlineStore } from '../market/kline-store.js';
import { RiskEngine, type SymbolFilters } from '../risk/risk-engine.js';
import { buildContextGate } from '../strategy/context/build-context-gate.js';
import { EntryGate } from '../strategy/entry-gate.js';
import { buildIntradayEntryChain } from '../strategy/entries/intraday-chain.js';
import { buildEntryPathRegistry } from '../strategy/entries/registry.js';
import { MtfEngine } from '../strategy/mtf-engine.js';
import { PendingSignalStore } from '../strategy/pending-signals.js';
import { SymbolCooldownTracker } from '../strategy/symbol-cooldown.js';
import { StrategyEngine } from '../strategy/strategy-engine.js';
import { wireNewsVeto } from '../strategy/wire-news-veto.js';

export type PaperTradingStack = {
  strategy: StrategyEngine;
  risk: RiskEngine;
  cooldown: SymbolCooldownTracker;
  pending: PendingSignalStore;
  mtf: MtfEngine;
};

export type SimPaperExecutionState = {
  trades: BacktestTradeRecord[];
  gateRejects: GateRejectRecord[];
  equityCurve: number[];
  pendingPlans: Map<string, OrderPlan>;
  intentMeta: Map<string, { newsId: string; entryPath: EntryPathId }>;
  openTradeMeta: Map<
    string,
    {
      newsId: string;
      entryPath: EntryPathId;
      side: OrderSide;
      entry: number;
      stopLoss: number;
      takeProfit: number;
    }
  >;
};

export const createSimPaperExecutionState = (
  initialBalanceUsdt: number,
): SimPaperExecutionState => ({
  trades: [],
  gateRejects: [],
  equityCurve: [initialBalanceUsdt],
  pendingPlans: new Map(),
  intentMeta: new Map(),
  openTradeMeta: new Map(),
});

export const createPaperTradingStack = (params: {
  config: AppConfig;
  bus: AppEventBus;
  store: KlineStore;
  broker: SimBroker;
  getNow: () => Date;
  getFilters: (symbol: string) => Promise<SymbolFilters>;
  isPaused?: () => boolean;
  onGateReject?: (reject: GateRejectRecord) => void;
}): PaperTradingStack => {
  const pending = new PendingSignalStore();
  const mtf = new MtfEngine(params.config, params.store);
  const registry = buildEntryPathRegistry(params.config, mtf, params.store);
  const intradayChain = buildIntradayEntryChain(params.config);
  const contextGate = buildContextGate(params.config, mtf);
  const entryGate = new EntryGate(
    params.config,
    mtf,
    registry,
    intradayChain,
    contextGate,
    params.store,
    params.bus,
    params.getNow,
  );
  const cooldown = new SymbolCooldownTracker(params.config, params.getNow);
  cooldown.wire(params.bus);

  if (params.onGateReject) {
    params.bus.on('strategy:gateReject', params.onGateReject);
  }

  const newsVeto = wireNewsVeto(params.config, params.bus);
  const strategy = new StrategyEngine(
    params.config,
    params.bus,
    params.store,
    entryGate,
    pending,
    async (symbol) => (await params.broker.getPosition(symbol)) !== null,
    (symbol) => cooldown.isBlocked(symbol),
    params.isPaused ?? (() => false),
    params.getNow,
    newsVeto,
  );

  const risk = new RiskEngine(
    params.config,
    params.bus,
    () => params.broker.getBalance(),
    params.getFilters,
  );

  return { strategy, risk, cooldown, pending, mtf };
};

export const wireSimPaperExecution = (
  bus: AppEventBus,
  broker: SimBroker,
  state: SimPaperExecutionState,
): void => {
  bus.on('strategy:intent', (intent: TradeIntent) => {
    state.intentMeta.set(intent.id, {
      newsId: intent.newsId,
      entryPath: intent.entryPath,
    });
  });

  bus.on('risk:orderPlan', (plan) => {
    void handleOrderPlan(bus, broker, state, plan);
  });

  bus.on('execution:fill', (fill: Fill) => {
    const plan = state.pendingPlans.get(fill.symbol);
    const meta = plan ? state.intentMeta.get(plan.intentId) : undefined;
    state.openTradeMeta.set(fill.symbol, {
      newsId: meta?.newsId ?? 'unknown',
      entryPath: meta?.entryPath ?? 'fib',
      side: fill.side,
      entry: fill.price,
      stopLoss: plan?.stopLoss ?? 0,
      takeProfit: plan?.takeProfit ?? 0,
    });
  });

  bus.on('execution:positionClosed', async (event) => {
    const meta = state.openTradeMeta.get(event.symbol);
    if (meta) {
      state.trades.push({
        symbol: event.symbol,
        side: meta.side,
        entry: meta.entry,
        exit: event.exitPrice,
        pnl: event.pnl,
        newsId: meta.newsId,
        exitReason: event.exitReason,
        stopLoss: meta.stopLoss,
        takeProfit: meta.takeProfit,
        entryPath: meta.entryPath,
      });
      state.openTradeMeta.delete(event.symbol);
    }

    state.pendingPlans.delete(event.symbol);
    const balance = await broker.getBalance();
    state.equityCurve.push(balance.total);
  });
};

const handleOrderPlan = async (
  bus: AppEventBus,
  broker: SimBroker,
  state: SimPaperExecutionState,
  plan: OrderPlan,
): Promise<void> => {
  state.pendingPlans.set(plan.symbol, plan);
  const exitSide = plan.side === 'BUY' ? 'SELL' : 'BUY';

  try {
    await broker.placeEntry(plan);
    await broker.placeStopLoss(plan.symbol, exitSide, plan.stopLoss, plan.quantity);
    await broker.placeTakeProfit(plan.symbol, exitSide, plan.takeProfit, plan.quantity);
  } catch {
    state.pendingPlans.delete(plan.symbol);
  }
};
