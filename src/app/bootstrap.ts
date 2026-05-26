import { assertRuntimeSecrets, loadConfigWithEnv } from '../config/loader.js';
import type { AppConfig } from '../config/schema.js';
import { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { isPaused } from '../core/pause-flag.js';
import type { Fill, OrderPlan, TradeIntent } from '../core/types.js';
import { createAdapter } from '../execution/adapter-factory.js';
import { getSymbolFilters } from '../execution/exchange-info.js';
import { SimBroker } from '../execution/sim-broker.js';
import { BinanceMarket } from '../market/binance-market.js';
import { KlineStore } from '../market/kline-store.js';
import { RssPoller } from '../news/rss-poller.js';
import { RssPollerManager } from '../news/rss-poller-manager.js';
import { SymbolMapper } from '../news/symbol-mapper.js';
import { LlmGateway } from '../sentiment/llm-gateway.js';
import { NewsPipeline } from '../sentiment/news-pipeline.js';
import { RuleScorer } from '../sentiment/rule-scorer.js';
import { SignalMerger } from '../sentiment/signal-merger.js';
import { RiskEngine } from '../risk/risk-engine.js';
import { EntryGate } from '../strategy/entry-gate.js';
import { buildEntryPathRegistry } from '../strategy/entries/registry.js';
import { MtfEngine } from '../strategy/mtf-engine.js';
import { PendingSignalStore } from '../strategy/pending-signals.js';
import { SymbolCooldownTracker } from '../strategy/symbol-cooldown.js';
import { StrategyEngine } from '../strategy/strategy-engine.js';
import { openDatabase } from '../storage/db.js';
import { migrate } from '../storage/migrate.js';
import { FeedRepository } from '../storage/repositories/feed-repo.js';
import { LlmRepository } from '../storage/repositories/llm-repo.js';
import { NewsRepository } from '../storage/repositories/news-repo.js';
import { SignalRepository } from '../storage/repositories/signal-repo.js';
import { TradeRepository } from '../storage/repositories/trade-repo.js';
import type { RuntimeContext } from './runtime-context.js';
import { registerShutdown } from './shutdown.js';

const pendingPlans = new Map<string, OrderPlan>();
const intentMeta = new Map<
  string,
  { newsId: string; newsSignalId: string; entryPath?: string }
>();

type TradingMode = 'sim' | 'testnet' | 'live';

const wireExecution = (
  bus: AppEventBus,
  adapter: ReturnType<typeof createAdapter>,
  tradeRepo: TradeRepository,
  mode: string,
  log: ReturnType<typeof createLogger>,
): void => {
  bus.on('strategy:intent', (intent: TradeIntent) => {
    intentMeta.set(intent.id, {
      newsId: intent.newsId,
      newsSignalId: intent.newsSignalId,
      entryPath: intent.entryPath,
    });
  });

  bus.on('risk:orderPlan', (plan) => {
    void handleOrderPlan(plan, adapter, log);
  });

  bus.on('execution:fill', (fill: Fill) => {
    persistOpenTrade(fill, tradeRepo, mode, log);
  });

  bus.on('execution:positionClosed', (event) => {
    const open = tradeRepo.findOpenBySymbol(event.symbol);
    if (!open) {
      log.warn({ symbol: event.symbol }, 'no_open_trade_for_position_closed');
      return;
    }
    tradeRepo.close({
      id: open.id,
      exitPrice: event.exitPrice,
      pnlUsdt: event.pnl,
      feesUsdt: event.feesUsdt,
    });
    pendingPlans.delete(event.symbol);
    intentMeta.delete(open.id);
    log.info({ symbol: event.symbol, pnl: event.pnl }, 'trade_closed');
  });
};

const handleOrderPlan = async (
  plan: OrderPlan,
  adapter: ReturnType<typeof createAdapter>,
  log: ReturnType<typeof createLogger>,
): Promise<void> => {
  pendingPlans.set(plan.symbol, plan);
  const exitSide = plan.side === 'BUY' ? 'SELL' : 'BUY';

  try {
    await adapter.placeEntry(plan);
    await adapter.placeStopLoss(plan.symbol, exitSide, plan.stopLoss, plan.quantity);
    await adapter.placeTakeProfit(plan.symbol, exitSide, plan.takeProfit, plan.quantity);
    log.info(
      {
        symbol: plan.symbol,
        side: plan.side,
        quantity: plan.quantity,
        stopLoss: plan.stopLoss,
        takeProfit: plan.takeProfit,
      },
      'order_plan_executed',
    );
  } catch (err) {
    pendingPlans.delete(plan.symbol);
    const message = err instanceof Error ? err.message : String(err);
    log.error({ symbol: plan.symbol, err: message }, 'order_plan_failed');
  }
};

const persistOpenTrade = (
  fill: Fill,
  tradeRepo: TradeRepository,
  mode: string,
  log: ReturnType<typeof createLogger>,
): void => {
  const plan = pendingPlans.get(fill.symbol);
  if (!plan) {
    log.warn({ symbol: fill.symbol }, 'fill_without_pending_plan');
    return;
  }

  const meta = intentMeta.get(plan.intentId);
  tradeRepo.insertOpen({
    id: plan.intentId,
    mode,
    symbol: fill.symbol,
    side: fill.side,
    quantity: fill.quantity,
    entryPrice: fill.price,
    stopLoss: plan.stopLoss,
    takeProfit: plan.takeProfit,
    newsId: meta?.newsId,
    newsSignalId: meta?.newsSignalId,
    entryPath: meta?.entryPath,
    openedAt: fill.timestamp,
  });
  log.info({ tradeId: plan.intentId, symbol: fill.symbol }, 'trade_opened');
};

const binanceRestBaseUrl = (config: AppConfig): string =>
  config.mode === 'testnet' ? config.binance.testnetBaseUrl : config.binance.baseUrl;

const wireTradingStack = async (
  configPath: string,
  mode: TradingMode,
  symbolOverride?: string[],
): Promise<RuntimeContext> => {
  const config = loadConfigWithEnv(configPath);
  config.mode = mode;

  if (symbolOverride && symbolOverride.length > 0) {
    config.symbols = symbolOverride;
  }

  const db = openDatabase(config.storage.sqlitePath);
  migrate(db);

  const bus = new AppEventBus();
  const log = createLogger({
    level: config.logging.level,
    pretty: config.logging.pretty,
  });

  const tradeRepo = new TradeRepository(db);
  const adapter = createAdapter(mode, config, db, bus);
  await adapter.connect();

  wireExecution(bus, adapter, tradeRepo, mode, log);

  const mapper = new SymbolMapper(config.symbols);
  const scorer = new RuleScorer(config.sentiment.rules);
  const merger = new SignalMerger({
    symbols: config.symbols,
    rules: { minStrength: config.sentiment.rules.minStrength },
    llm: {
      minConfidence: config.sentiment.llm.minConfidence,
      defaultTtlMinutes: config.sentiment.llm.defaultTtlMinutes,
    },
  });

  const llmGateway = config.sentiment.llm.enabled
    ? new LlmGateway(config.sentiment.llm, new LlmRepository(db))
    : null;

  const newsPipeline = new NewsPipeline({
    mapper,
    scorer,
    merger,
    llmGateway,
    newsRepo: new NewsRepository(db),
    signalRepo: new SignalRepository(db),
    bus,
    config,
    log,
  });

  const rssManager = new RssPollerManager({
    config,
    poller: new RssPoller(),
    pipeline: newsPipeline,
    feedRepo: new FeedRepository(db),
    bus,
    log,
  });

  const store = new KlineStore();
  const market = new BinanceMarket(store, bus, config, log);

  if (adapter instanceof SimBroker) {
    bus.on('market:candleClose', (event) => {
      adapter.onPriceUpdate(event.symbol, event.candle);
    });
  }

  const mtf = new MtfEngine(config, store);
  const registry = buildEntryPathRegistry(config, mtf, store);
  const entryGate = new EntryGate(config, mtf, registry, store, bus);
  const pending = new PendingSignalStore();
  const cooldown = new SymbolCooldownTracker(config);
  cooldown.wire(bus);
  const strategy = new StrategyEngine(
    config,
    bus,
    store,
    entryGate,
    pending,
    async (symbol) => (await adapter.getPosition(symbol)) !== null,
    (symbol) => cooldown.isBlocked(symbol),
    isPaused,
  );

  const restBase = binanceRestBaseUrl(config);
  const risk = new RiskEngine(
    config,
    bus,
    () => adapter.getBalance(),
    async (symbol) => {
      const filters = await getSymbolFilters(restBase, symbol);
      return {
        stepSize: filters.stepSize,
        minQty: filters.minQty,
        tickSize: filters.tickSize,
      };
    },
  );

  const intervals = [config.timeframes.context, config.timeframes.entry];
  await market.start(config.symbols, intervals);
  rssManager.start();

  const ctx: RuntimeContext = {
    config,
    mode,
    bus,
    log,
    db,
    adapter,
    newsPipeline,
    rssManager,
    market,
    strategy,
    risk,
    startedAt: new Date(),
  };

  registerShutdown(ctx);
  log.info({ symbols: config.symbols, mode }, `${mode}_runtime_started`);

  return ctx;
};

export const bootstrapSim = async (
  configPath: string,
  symbolOverride?: string[],
): Promise<RuntimeContext> => wireTradingStack(configPath, 'sim', symbolOverride);

export const bootstrapTestnet = async (
  configPath: string,
  symbolOverride?: string[],
): Promise<RuntimeContext> => wireTradingStack(configPath, 'testnet', symbolOverride);

export const bootstrapLive = async (
  configPath: string,
  symbolOverride?: string[],
): Promise<RuntimeContext> => {
  const config = loadConfigWithEnv(configPath);
  if (!config.allowLive) {
    throw new Error('Refusing live mode: set allowLive: true in config');
  }
  assertRuntimeSecrets(config, 'live');
  return wireTradingStack(configPath, 'live', symbolOverride);
};
