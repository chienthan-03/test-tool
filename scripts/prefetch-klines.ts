/**
 * Download kline cache files for all configured symbols and backtest timeframes.
 *
 * Usage:
 *   npm run prefetch-klines -- --from 2024-10-01 --to 2024-12-31
 *   npm run prefetch-klines -- --config config/default.yaml
 */
import { loadConfig } from '../src/config/loader.js';
import { parseStrictIsoDate } from '../src/cli/backtest-dates.js';
import { downloadKlines, loadKlines } from '../src/market/kline-cache.js';
import { intervalToMs } from '../src/market/timeframe.js';

const WARMUP_BARS = 200;

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let configPath = 'config/default.yaml';
  let from = '2024-10-01';
  let to = '2024-12-31';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && args[i + 1]) configPath = args[++i]!;
    else if (arg === '--from' && args[i + 1]) from = args[++i]!;
    else if (arg === '--to' && args[i + 1]) to = args[++i]!;
  }

  const config = loadConfig(configPath);
  const fromDate = parseStrictIsoDate(from, 'from');
  const toDate = parseStrictIsoDate(to, 'to');
  const contextTf = config.timeframes.context;
  const entryTf = config.timeframes.entry;
  const warmupMs = Math.max(
    WARMUP_BARS * intervalToMs(contextTf),
    WARMUP_BARS * intervalToMs(entryTf),
  );
  const downloadFrom = new Date(fromDate.getTime() - warmupMs);
  const intervals = [...new Set([contextTf, entryTf])];
  const baseUrl = config.binance.baseUrl;
  const cacheDir = config.backtest.klineCacheDir;

  console.log(
    `Prefetch ${config.symbols.length} symbols, intervals [${intervals.join(', ')}], ${downloadFrom.toISOString().slice(0, 10)} → ${to}`,
  );

  for (const symbol of config.symbols) {
    for (const interval of intervals) {
      const path = await downloadKlines(
        baseUrl,
        symbol,
        interval,
        downloadFrom,
        toDate,
        cacheDir,
      );
      const candles = await loadKlines(path);
      console.log(`  ${symbol} ${interval}: ${candles.length} bars → ${path}`);
    }
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
