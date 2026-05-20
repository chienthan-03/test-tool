import type { Command } from 'commander';
import { loadConfigWithEnv } from '../../config/loader.js';
import { runBacktest } from '../../execution/backtest-replayer.js';
import { openDatabase } from '../../storage/db.js';
import { migrate } from '../../storage/migrate.js';

const parseIsoDate = (value: string, flag: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${flag} date: ${value}. Use ISO format (e.g. 2025-01-01).`);
  }
  return date;
};

export const registerBacktestCommand = (program: Command): void => {
  program
    .command('backtest')
    .description('Run a historical backtest')
    .requiredOption('--from <iso>', 'Start date (ISO)')
    .requiredOption('--to <iso>', 'End date (ISO)')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .option('--mock-sentiment', 'Generate synthetic long signals every 6 hours')
    .action(
      async (options: { from: string; to: string; config: string; mockSentiment?: boolean }) => {
        try {
          const from = parseIsoDate(options.from, '--from');
          const to = parseIsoDate(options.to, '--to');

          if (from.getTime() >= to.getTime()) {
            throw new Error('--from must be before --to');
          }

          const config = loadConfigWithEnv(options.config);
          const db = openDatabase(config.storage.sqlitePath);
          migrate(db);

          const report = await runBacktest({
            config,
            db,
            from,
            to,
            symbols: config.symbols,
            mockSentiment: options.mockSentiment ?? false,
          });

          console.log(
            JSON.stringify(
              {
                totalTrades: report.totalTrades,
                wins: report.wins,
                losses: report.losses,
                winRate: report.winRate,
                totalPnlUsdt: report.totalPnlUsdt,
                maxDrawdownPct: report.maxDrawdownPct,
              },
              null,
              2,
            ),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(message);
          process.exit(1);
        }
      },
    );
};
