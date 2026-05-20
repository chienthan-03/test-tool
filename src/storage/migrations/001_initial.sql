-- Raw ingested news
CREATE TABLE news_raw (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  symbols_json TEXT,
  tags_json TEXT,
  raw_json TEXT
);

-- Processed marker
CREATE TABLE news_processed (
  news_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);

-- Emitted signals
CREATE TABLE news_signals (
  id TEXT PRIMARY KEY,
  news_id TEXT NOT NULL,
  symbols_json TEXT NOT NULL,
  direction TEXT NOT NULL,
  strength REAL NOT NULL,
  source TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- LLM audit
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_id TEXT NOT NULL,
  model TEXT NOT NULL,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  success INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

-- Trades
CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  pnl_usdt REAL,
  fees_usdt REAL,
  news_id TEXT,
  news_signal_id TEXT,
  status TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  closed_at TEXT
);

-- Feed health
CREATE TABLE feed_status (
  feed_id TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0
);

-- Schema version tracking
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
