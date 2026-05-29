/** Sentiment score: bearish (-1), neutral (0), bullish (+1). */
export type SentimentDirection = -1 | 0 | 1;

/** How a news signal was produced. */
export type SignalSource = 'rule' | 'llm' | 'merged';

export type SignalDirection = 'long' | 'short';

export type RulePriority = 'low' | 'medium' | 'high';

export type OrderSide = 'BUY' | 'SELL';

export type PositionSide = 'LONG' | 'SHORT';

export type EntryType = 'MARKET';

export type EntryPathId = 'fib' | 'breakout' | 'emaMomentum';

export interface NewsItem {
  id: string;
  sourceId: string;
  title: string;
  summary?: string;
  url: string;
  publishedAt: Date;
  fetchedAt: Date;
  symbols: string[];
  tags: string[];
}

export interface RuleScoreResult {
  newsId: string;
  impactScore: number;
  ruleSentiment: SentimentDirection;
  priority: RulePriority;
  tags: string[];
  needsLlm: boolean;
  needsLlmReason?: string;
}

export interface LlmSentiment {
  sentiment: SentimentDirection;
  confidence: number;
  affectedSymbols: string[];
  rationale: string;
  ttlMinutes: number;
}

export interface NewsSignal {
  id: string;
  newsId: string;
  symbols: string[];
  direction: SignalDirection;
  strength: number;
  expiresAt: Date;
  source: SignalSource;
  createdAt: Date;
  tags: string[];
}

export interface Candle {
  symbol: string;
  interval: string;
  openTime: Date;
  closeTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface TradeIntent {
  id: string;
  symbol: string;
  side: OrderSide;
  newsSignalId: string;
  newsId: string;
  entryPrice: number;
  atr: number;
  stopLoss?: number;
  takeProfit?: number;
  contextTimeframe: string;
  entryTimeframe: string;
  entryPath: EntryPathId;
  createdAt: Date;
}

export interface OrderPlan {
  intentId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryType: EntryType;
  stopLoss: number;
  takeProfit: number;
  notionalUsdt: number;
}

export interface Fill {
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
  timestamp: Date;
}

export interface Position {
  symbol: string;
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  unrealizedPnl?: number;
}

export type ExitReason = 'SL' | 'TP';

export interface GateRejectRecord {
  symbol: string;
  direction: SignalDirection;
  reason: string;
  stage: 'context' | 'entry';
  at: string;
}

export interface BacktestTradeRecord {
  symbol: string;
  side: OrderSide;
  entry: number;
  exit: number;
  pnl: number;
  newsId: string;
  exitReason?: ExitReason;
  stopLoss?: number;
  takeProfit?: number;
  entryPath?: EntryPathId;
}

export type EntryPathMetrics = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
};

export interface BacktestReport {
  from: string;
  to: string;
  symbols: string[];
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlUsdt: number;
  maxDrawdownPct: number;
  sharpe?: number;
  trades: BacktestTradeRecord[];
  gateRejects?: GateRejectRecord[];
  byEntryPath?: Record<string, EntryPathMetrics>;
  /** Absolute path to the written JSON report file, when persisted. */
  reportPath?: string;
}

/** Binance LOT_SIZE / PRICE_FILTER / MIN_NOTIONAL for a symbol. */
export interface ExchangeFilters {
  symbol: string;
  stepSize: number;
  minQty: number;
  tickSize: number;
  minPrice: number;
  maxPrice: number;
  minNotional: number;
}

/** Raw item from rss-parser before normalization. */
export interface RssRawItem {
  title: string;
  link: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  pubDate?: string;
  isoDate?: string;
}

export interface Balance {
  available: number;
  total: number;
}

export interface CandleCloseEvent {
  symbol: string;
  tf: string;
  candle: Candle;
}

export interface PositionClosedEvent {
  symbol: string;
  pnl: number;
  exitPrice: number;
  feesUsdt: number;
  exitReason?: ExitReason;
}

export interface AppEvents {
  'news:raw': NewsItem;
  'news:signal': NewsSignal;
  'market:candleClose': CandleCloseEvent;
  'strategy:gateReject': GateRejectRecord;
  'strategy:intent': TradeIntent;
  'risk:orderPlan': OrderPlan;
  'execution:fill': Fill;
  'execution:positionClosed': PositionClosedEvent;
  'system:pause': void;
}
