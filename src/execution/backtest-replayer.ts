import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config/schema.js';
import { AppEventBus } from '../core/event-bus.js';
import type {
  BacktestReport,
  BacktestTradeRecord,
  Candle,
  Fill,
  GateRejectRecord,
  NewsSignal,
  OrderPlan,
  OrderSide,
  TradeIntent,
} from '../core/types.js';
import { getDefaultFilters } from '../execution/exchange-info.js';
import { SimBroker } from '../execution/sim-broker.js';
import { cacheFilePath, downloadKlines, loadKlines } from '../market/kline-cache.js';
import { KlineStore } from '../market/kline-store.js';
import { intervalToMs } from '../market/timeframe.js';
import { RiskEngine } from '../risk/risk-engine.js';
import { MtfEngine } from '../strategy/mtf-engine.js';
import { PendingSignalStore } from '../strategy/pending-signals.js';
import { SymbolCooldownTracker } from '../strategy/symbol-cooldown.js';
import { StrategyEngine } from '../strategy/strategy-engine.js';
import { SignalRepository } from '../storage/repositories/signal-repo.js';

export type BacktestReplayerOptions = {
  config: AppConfig;
  db: Database.Database;
  from: Date;
  to: Date;
  symbols: string[];
  mockSentiment?: boolean;
  mockSentimentIntervalHours?: number;
  baseUrl?: string;
  skipDownload?: boolean;
};

const MOCK_SENTIMENT_INTERVAL_HOURS = 6;
const WARMUP_BARS = 200;

const flushAsyncHandlers = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
};

const generateMockSignals = (
  from: Date,
  to: Date,
  symbols: string[],
  intervalHours: number,
): NewsSignal[] => {
  const signals: NewsSignal[] = [];
  let cursor = from.getTime();
  let seq = 0;

  while (cursor <= to.getTime()) {
    const direction: NewsSignal['direction'] = seq % 2 === 0 ? 'long' : 'short';
    for (const symbol of symbols) {
      signals.push({
        id: `mock-${seq}-${symbol}`,
        newsId: `mock-news-${seq}`,
        symbols: [symbol],
        direction,
        strength: 0.85,
        expiresAt: new Date(cursor + intervalHours * 3_600_000),
        source: 'rule',
        createdAt: new Date(cursor),
      });
    }
    cursor += intervalHours * 3_600_000;
    seq += 1;
  }

  return signals;
};

const signalsInBar = (
  signals: NewsSignal[],
  candle: Candle,
): NewsSignal[] =>
  signals.filter(
    (signal) =>
      signal.createdAt.getTime() >= candle.openTime.getTime() &&
      signal.createdAt.getTime() <= candle.closeTime.getTime(),
  );

const computeMaxDrawdownPct = (equityCurve: number[]): number => {
  if (equityCurve.length === 0) {
    return 0;
  }

  let peak = equityCurve[0]!;
  let maxDrawdown = 0;

  for (const equity of equityCurve) {
    if (equity > peak) {
      peak = equity;
    }
    if (peak > 0) {
      const drawdown = ((peak - equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
};

const buildBacktestConfig = (config: AppConfig): AppConfig => ({
  ...config,
  sim: {
    ...config.sim,
    fillModel: config.backtest.fillModel,
  },
});

const resolveFilters = async (symbol: string) => {
  const filters = getDefaultFilters(symbol);
  if (!filters) {
    throw new Error(`No default exchange filters for ${symbol}`);
  }
  return {
    stepSize: filters.stepSize,
    minQty: filters.minQty,
    tickSize: filters.tickSize,
  };
};

export class BacktestReplayer {
  constructor(private readonly options: BacktestReplayerOptions) {}

  async run(): Promise<BacktestReport> {
    const {
      config,
      db,
      from,
      to,
      symbols,
      mockSentiment = false,
      mockSentimentIntervalHours = MOCK_SENTIMENT_INTERVAL_HOURS,
      baseUrl = config.binance.baseUrl,
      skipDownload = false,
    } = this.options;

    const signalRepo = new SignalRepository(db);
    let signals = signalRepo.listBetween(from, to);

    if (mockSentiment) {
      signals = generateMockSignals(from, to, symbols, mockSentimentIntervalHours);
    } else if (signals.length === 0) {
      throw new Error(
        'No news_signals in date range. Run sim first or pass --mock-sentiment.',
      );
    }

    const contextTf = config.timeframes.context;
    const entryTf = config.timeframes.entry;
    const warmupMs = Math.max(
      WARMUP_BARS * intervalToMs(contextTf),
      WARMUP_BARS * intervalToMs(entryTf),
    );
    const downloadFrom = new Date(from.getTime() - warmupMs);

    await mkdir(config.backtest.klineCacheDir, { recursive: true });

    const candlesByKey = new Map<string, Candle[]>();

    for (const symbol of symbols) {
      for (const interval of [contextTf, entryTf]) {
        const path = cacheFilePath(config.backtest.klineCacheDir, symbol, interval);
        if (!skipDownload) {
          await downloadKlines(baseUrl, symbol, interval, downloadFrom, to, config.backtest.klineCacheDir);
        }
        const candles = await loadKlines(path);
        candlesByKey.set(`${symbol}|${interval}`, candles);
      }
    }

    type TimedCandle = { candle: Candle; tf: string };
    const timeline: TimedCandle[] = [];

    const timelineTfs = contextTf === entryTf ? [entryTf] : [contextTf, entryTf];

    for (const symbol of symbols) {
      for (const tf of timelineTfs) {
        const candles = candlesByKey.get(`${symbol}|${tf}`) ?? [];
        for (const candle of candles) {
          if (candle.closeTime.getTime() <= to.getTime()) {
            timeline.push({ candle, tf });
          }
        }
      }
    }

    timeline.sort(
      (a, b) => a.candle.closeTime.getTime() - b.candle.closeTime.getTime(),
    );

    const backtestConfig = buildBacktestConfig(config);
    const bus = new AppEventBus();
    const store = new KlineStore();
    const pending = new PendingSignalStore();
    const mtf = new MtfEngine(backtestConfig, store);
    let simNow = from;
    const getNow = (): Date => simNow;

    const broker = new SimBroker(backtestConfig, {
      onFill: (fill) => {
        bus.emit('execution:fill', fill);
      },
      onPositionClosed: (event) => {
        bus.emit('execution:positionClosed', event);
      },
    });
    await broker.connect();

    const trades: BacktestTradeRecord[] = [];
    const gateRejects: GateRejectRecord[] = [];
    const equityCurve: number[] = [backtestConfig.sim.initialBalanceUsdt];
    const pendingPlans = new Map<string, OrderPlan>();
    const intentMeta = new Map<string, { newsId: string }>();
    const openTradeMeta = new Map<
      string,
      { newsId: string; side: OrderSide; entry: number; stopLoss: number; takeProfit: number }
    >();

    bus.on('strategy:gateReject', (reject) => {
      gateRejects.push(reject);
    });

    bus.on('strategy:intent', (intent: TradeIntent) => {
      intentMeta.set(intent.id, { newsId: intent.newsId });
    });

    bus.on('risk:orderPlan', (plan) => {
      void handleOrderPlan(plan);
    });

    bus.on('execution:fill', (fill: Fill) => {
      const plan = pendingPlans.get(fill.symbol);
      const meta = plan ? intentMeta.get(plan.intentId) : undefined;
      openTradeMeta.set(fill.symbol, {
        newsId: meta?.newsId ?? 'unknown',
        side: fill.side,
        entry: fill.price,
        stopLoss: plan?.stopLoss ?? 0,
        takeProfit: plan?.takeProfit ?? 0,
      });
    });

    bus.on('execution:positionClosed', async (event) => {
      const meta = openTradeMeta.get(event.symbol);
      if (meta) {
        trades.push({
          symbol: event.symbol,
          side: meta.side,
          entry: meta.entry,
          exit: event.exitPrice,
          pnl: event.pnl,
          newsId: meta.newsId,
          exitReason: event.exitReason,
          stopLoss: meta.stopLoss,
          takeProfit: meta.takeProfit,
        });
        openTradeMeta.delete(event.symbol);
      }

      pendingPlans.delete(event.symbol);
      const balance = await broker.getBalance();
      equityCurve.push(balance.total);
    });

    const handleOrderPlan = async (plan: OrderPlan): Promise<void> => {
      pendingPlans.set(plan.symbol, plan);
      const exitSide = plan.side === 'BUY' ? 'SELL' : 'BUY';

      try {
        await broker.placeEntry(plan);
        await broker.placeStopLoss(plan.symbol, exitSide, plan.stopLoss, plan.quantity);
        await broker.placeTakeProfit(plan.symbol, exitSide, plan.takeProfit, plan.quantity);
      } catch {
        pendingPlans.delete(plan.symbol);
      }
    };

    const cooldown = new SymbolCooldownTracker(backtestConfig, getNow);
    cooldown.wire(bus);

    new StrategyEngine(
      backtestConfig,
      bus,
      store,
      mtf,
      pending,
      async (symbol) => (await broker.getPosition(symbol)) !== null,
      (symbol) => cooldown.isBlocked(symbol),
      () => false,
      getNow,
    );

    new RiskEngine(
      backtestConfig,
      bus,
      () => broker.getBalance(),
      resolveFilters,
    );

    bus.on('market:candleClose', (event) => {
      broker.onPriceUpdate(event.symbol, event.candle);
    });

    for (const { candle, tf } of timeline) {
      simNow = candle.closeTime;
      store.update(candle.symbol, tf, candle);

      if (tf !== entryTf) {
        continue;
      }

      if (candle.closeTime.getTime() < from.getTime()) {
        continue;
      }

      for (const signal of signalsInBar(signals, candle)) {
        bus.emit('news:signal', signal);
      }

      await flushAsyncHandlers();

      bus.emit('market:candleClose', {
        symbol: candle.symbol,
        tf: entryTf,
        candle,
      });

      await flushAsyncHandlers();
    }

    const wins = trades.filter((t) => t.pnl > 0).length;
    const losses = trades.filter((t) => t.pnl <= 0).length;
    const totalPnlUsdt = trades.reduce((sum, t) => sum + t.pnl, 0);
    const finalBalance = await broker.getBalance();

    if (equityCurve.length === 1) {
      equityCurve.push(finalBalance.total);
    }

    const report: BacktestReport = {
      from: from.toISOString(),
      to: to.toISOString(),
      symbols,
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      totalPnlUsdt,
      maxDrawdownPct: computeMaxDrawdownPct(equityCurve),
      trades,
      gateRejects: gateRejects.length > 0 ? gateRejects : undefined,
    };

    await mkdir(config.backtest.reportDir, { recursive: true });
    const reportPath = join(
      config.backtest.reportDir,
      `backtest-${Date.now()}.json`,
    );
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    return report;
  }
}

/** Write synthetic ascending klines for offline tests. */
export const writeSyntheticKlines = async (
  cacheDir: string,
  symbol: string,
  interval: string,
  from: Date,
  barCount: number,
  startClose: number,
  step: number,
  waveAmplitude = 0,
): Promise<void> => {
  await mkdir(cacheDir, { recursive: true });
  const tfMs = intervalToMs(interval);
  const candles: Candle[] = [];

  for (let i = 0; i < barCount; i++) {
    const openTime = new Date(from.getTime() + i * tfMs);
    const closeTime = new Date(openTime.getTime() + tfMs - 1);
    const trend = startClose + step * i;
    const spread = Math.max(trend * 0.003, 1);

    let close = trend;
    let high = close + spread;
    let low = close - spread;

    if (waveAmplitude > 0) {
      const pivotCycle = 9;
      const pivotBar = Math.floor(pivotCycle / 2);
      const cycleIndex = i % pivotCycle;
      const cycleNum = Math.floor(i / pivotCycle);
      const isPivot = cycleIndex === pivotBar;
      const pivotIsHigh = cycleNum % 2 === 0;

      if (isPivot && pivotIsHigh) {
        close = trend + waveAmplitude * 0.55;
        high = close + spread * 2;
        low = close - spread * 0.35;
      } else if (isPivot) {
        close = trend - waveAmplitude * 0.45;
        low = close - spread * 2;
        high = close + spread * 0.35;
      } else {
        close = trend + (cycleIndex < pivotBar ? spread * 0.2 : -spread * 0.15);
        high = close + spread;
        low = close - spread;
      }
    }

    candles.push({
      symbol,
      interval,
      openTime,
      closeTime,
      open: close - spread * 0.25,
      high,
      low,
      close,
      volume: 100,
      isClosed: true,
    });
  }

  const path = cacheFilePath(cacheDir, symbol, interval);
  const serialized = candles.map((c) => ({
    ...c,
    openTime: c.openTime.toISOString(),
    closeTime: c.closeTime.toISOString(),
  }));
  await writeFile(path, JSON.stringify(serialized, null, 2), 'utf8');
};

export const runBacktest = (options: BacktestReplayerOptions): Promise<BacktestReport> =>
  new BacktestReplayer(options).run();
