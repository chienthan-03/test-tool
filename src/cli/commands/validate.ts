import type { Command } from 'commander';
import { fetch } from 'undici';
import { loadConfigWithEnv } from '../../config/loader.js';
import type { AppConfig } from '../../config/schema.js';
import type { FetchFn } from '../../news/rss-poller.js';
import { createNewsStack } from '../news-stack.js';

type FetchLike = typeof fetch;

export const validateOpenRouter = async (
  config: AppConfig,
  fetchFn: FetchLike = fetch,
): Promise<void> => {
  if (!config.sentiment.llm.enabled) {
    console.warn('OpenRouter: disabled (sentiment.llm.enabled is false)');
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('OpenRouter: disabled (OPENROUTER_API_KEY not set)');
    return;
  }

  const url = `${config.sentiment.llm.baseUrl}/models`;
  const response = await fetchFn(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(config.sentiment.llm.timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter validation failed: HTTP ${response.status}`);
  }

  console.log('OpenRouter: OK');
};

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

        await validateOpenRouter(config);

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
