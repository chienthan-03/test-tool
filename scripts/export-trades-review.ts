import { writeFileSync } from 'node:fs';
import { loadEnvFile } from '../src/config/load-env.js';
import { loadConfigWithEnv } from '../src/config/loader.js';
import { openDatabase } from '../src/storage/db.js';
import { csvWithHeader, sideToDirection, type TradeReviewRow } from './lib/trade-review-csv.js';

loadEnvFile();

const parseArgs = (): { out: string; limit: number; configPath: string } => {
  const args = process.argv.slice(2);
  let out = '.planning/phases/01-entry-baseline/trades-export.csv';
  let limit = 50;
  let configPath = 'config/default.yaml';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) {
      out = args[++i]!;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = Math.max(1, parseInt(args[++i]!, 10));
    } else if (args[i] === '--config' && args[i + 1]) {
      configPath = args[++i]!;
    }
  }

  return { out, limit, configPath };
};

type TradeRow = {
  id: string;
  mode: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss: number;
  take_profit: number;
  pnl_usdt: number | null;
  fees_usdt: number | null;
  news_id: string | null;
  news_signal_id: string | null;
  opened_at: string;
  closed_at: string | null;
};

const { out, limit, configPath } = parseArgs();
const config = loadConfigWithEnv(configPath);
const db = openDatabase(config.storage.sqlitePath);

const rows = db
  .prepare(
    `SELECT id, mode, symbol, side, quantity, entry_price, exit_price, stop_loss, take_profit,
            pnl_usdt, fees_usdt, news_id, news_signal_id, opened_at, closed_at
     FROM trades
     WHERE status = 'closed'
     ORDER BY closed_at DESC
     LIMIT ?`,
  )
  .all(limit) as TradeRow[];

const csvRows: TradeReviewRow[] = rows.map((row) => ({
  id: row.id,
  source: 'sqlite',
  mode: row.mode,
  symbol: row.symbol,
  side: row.side,
  direction: sideToDirection(row.side),
  quantity: row.quantity,
  entry_price: row.entry_price,
  exit_price: row.exit_price ?? '',
  stop_loss: row.stop_loss,
  take_profit: row.take_profit,
  pnl_usdt: row.pnl_usdt ?? '',
  fees_usdt: row.fees_usdt ?? '',
  news_id: row.news_id ?? '',
  news_signal_id: row.news_signal_id ?? '',
  opened_at: row.opened_at,
  closed_at: row.closed_at ?? '',
}));

writeFileSync(out, csvWithHeader(csvRows), 'utf8');
console.error(`Exported ${rows.length} closed trade(s) to ${out}`);
db.close();
