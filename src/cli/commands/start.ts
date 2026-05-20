import type { Command } from 'commander';
import { assertRuntimeSecrets, loadConfigWithEnv } from '../../config/loader.js';
import { bootstrapSim, bootstrapTestnet } from '../../app/bootstrap.js';

const parseSymbols = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  return value
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);
};

export const registerStartCommand = (program: Command): void => {
  program
    .command('start')
    .description('Start the trading bot')
    .requiredOption('--mode <mode>', 'Runtime mode: sim, testnet, or live')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .option('--symbols <list>', 'Comma-separated symbol override (e.g. BTCUSDT,ETHUSDT)')
    .action(async (options: { mode: string; config: string; symbols?: string }) => {
      try {
        const mode = options.mode;
        if (mode !== 'sim' && mode !== 'testnet' && mode !== 'live') {
          throw new Error(`Invalid mode: ${mode}. Use sim, testnet, or live.`);
        }

        const config = loadConfigWithEnv(options.config);
        assertRuntimeSecrets(config, mode);

        const symbolOverride = parseSymbols(options.symbols);

        if (mode === 'sim') {
          const ctx = await bootstrapSim(options.config, symbolOverride);
          ctx.log.info('Press Ctrl+C to stop (open positions are not auto-closed).');
          return;
        }

        if (mode === 'testnet') {
          const ctx = await bootstrapTestnet(options.config, symbolOverride);
          ctx.log.info('Press Ctrl+C to stop (open positions are not auto-closed).');
          return;
        }

        throw new Error(`Start for mode "${mode}" is not implemented yet.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
