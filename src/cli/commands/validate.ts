import type { Command } from 'commander';
import { loadConfigWithEnv } from '../../config/loader.js';

export const registerValidateCommand = (program: Command): void => {
  program
    .command('validate')
    .description('Validate configuration file')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .action((options: { config: string }) => {
      try {
        const config = loadConfigWithEnv(options.config);
        console.log('Config valid.');
        console.log(`Symbols: ${config.symbols.join(', ')}`);
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
