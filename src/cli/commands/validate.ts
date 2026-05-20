import type { Command } from 'commander';
import { loadConfigWithEnv } from '../../config/loader.js';
import type { FetchFn } from '../../news/rss-poller.js';
import { createNewsStack } from '../news-stack.js';

export const runValidateDryPoll = async (
  configPath: string,
  fetchFn?: FetchFn,
): Promise<{ itemsFetched: number; signalsCreated: number }> => {
  const config = loadConfigWithEnv(configPath);
  const { db, manager } = createNewsStack(config, fetchFn);

  try {
    return await manager.pollAllEnabledOnce();
  } finally {
    db.close();
  }
};

export const registerValidateCommand = (program: Command): void => {
  program
    .command('validate')
    .description('Validate configuration file')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .option('--dry-poll', 'Poll all enabled feeds once and report pipeline stats')
    .action(async (options: { config: string; dryPoll?: boolean }) => {
      try {
        const config = loadConfigWithEnv(options.config);

        if (!options.dryPoll) {
          console.log('Config valid.');
          console.log(`Symbols: ${config.symbols.join(', ')}`);
          process.exit(0);
          return;
        }

        const { itemsFetched, signalsCreated } = await runValidateDryPoll(options.config);
        console.log('Config valid.');
        console.log(`Symbols: ${config.symbols.join(', ')}`);
        console.log(`Items fetched: ${itemsFetched}`);
        console.log(`Signals created: ${signalsCreated}`);
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
