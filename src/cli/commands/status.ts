import type { Command } from 'commander';
import { loadConfigWithEnv } from '../../config/loader.js';
import { isPaused } from '../../core/pause-flag.js';
import { createAdapter } from '../../execution/adapter-factory.js';
import { openDatabase } from '../../storage/db.js';
import { migrate } from '../../storage/migrate.js';
import { FeedRepository } from '../../storage/repositories/feed-repo.js';
import { SignalRepository } from '../../storage/repositories/signal-repo.js';
import { TradeRepository } from '../../storage/repositories/trade-repo.js';
import { printFeedsTable } from './feeds.js';

const formatMoney = (value: number): string => value.toFixed(2);

export const registerStatusCommand = (program: Command): void => {
  program
    .command('status')
    .description('Show balance, positions, feeds, and recent signal count')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .option('--mode <mode>', 'Adapter mode for balance/positions', 'sim')
    .action(async (options: { config: string; mode: string }) => {
      const config = loadConfigWithEnv(options.config);
      const db = openDatabase(config.storage.sqlitePath);

      try {
        migrate(db);

        const adapter = createAdapter(options.mode as 'sim', config, db);
        await adapter.connect();

        const balance = await adapter.getBalance();
        const positions = await adapter.getAllPositions();
        const feedRepo = new FeedRepository(db);
        const signalRepo = new SignalRepository(db);
        const tradeRepo = new TradeRepository(db);

        const statusByFeedId = new Map(feedRepo.listAll().map((s) => [s.feedId, s]));
        const feedIds = config.feeds.map((f) => f.id);
        const signals24h = signalRepo.countLast24Hours();
        const openTradesDb = tradeRepo.countOpen();

        console.log(`Mode: ${options.mode}`);
        console.log(`Paused: ${isPaused() ? 'yes' : 'no'}`);
        console.log(`Balance (available): ${formatMoney(balance.available)} USDT`);
        console.log(`Balance (total): ${formatMoney(balance.total)} USDT`);
        console.log(`Open positions (adapter): ${positions.length}`);
        console.log(`Open trades (database): ${openTradesDb}`);
        console.log(`Signals (24h): ${signals24h}`);
        console.log('');

        if (positions.length > 0) {
          console.log('Positions:');
          for (const pos of positions) {
            const pnl =
              pos.unrealizedPnl != null ? formatMoney(pos.unrealizedPnl) : '-';
            console.log(
              `  ${pos.symbol} ${pos.side} qty=${pos.quantity} entry=${pos.entryPrice} uPnL=${pnl}`,
            );
          }
          console.log('');
        }

        console.log('Feeds:');
        printFeedsTable(feedIds, statusByFeedId);

        await adapter.disconnect();
        db.close();
        process.exit(0);
      } catch (err) {
        db.close();
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
