/**
 * Seed news_signals from RSS fixtures for sentiment backtests.
 *
 * Usage:
 *   npm run seed-signals -- --config config/experiments/sentiment-baseline.yaml \
 *     --db data/reports/experiments/sentiment-phase3/signals.db \
 *     --from 2024-10-01 --to 2024-12-31 [--repeat 30] [--no-llm]
 */
import { seedSignalsFromConfigPath } from './lib/seed-signals-from-fixtures.js';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  let configPath = 'config/experiments/sentiment-baseline.yaml';
  let dbPath = 'data/reports/experiments/sentiment-phase3/signals.db';
  let from = '2024-10-01';
  let to = '2024-12-31';
  let repeat = 30;
  let noLlm = false;
  let discardsPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config' && args[i + 1]) configPath = args[++i]!;
    else if (arg === '--db' && args[i + 1]) dbPath = args[++i]!;
    else if (arg === '--from' && args[i + 1]) from = args[++i]!;
    else if (arg === '--to' && args[i + 1]) to = args[++i]!;
    else if (arg === '--repeat' && args[i + 1]) repeat = Number(args[++i]);
    else if (arg === '--no-llm') noLlm = true;
    else if (arg === '--discards' && args[i + 1]) discardsPath = args[++i]!;
  }

  const result = await seedSignalsFromConfigPath({
    configPath,
    dbPath,
    from,
    to,
    repeat,
    noLlm,
    discardsPath,
  });

  console.log(
    `seed-signals: processed=${result.itemsProcessed} inserted=${result.signalsInserted} discards=${result.discards} db=${dbPath}`,
  );

  if (result.signalsInserted === 0) {
    console.error('warning: zero signals inserted — backtest with mockSentiment:false will fail');
    process.exitCode = 1;
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
