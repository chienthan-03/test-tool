import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Command } from 'commander';
import { PAUSE_FLAG_PATH } from '../../core/pause-flag.js';

export const pauseTrading = (): void => {
  mkdirSync(dirname(PAUSE_FLAG_PATH), { recursive: true });
  writeFileSync(PAUSE_FLAG_PATH, new Date().toISOString(), 'utf8');
};

export const registerPauseCommand = (program: Command): void => {
  program
    .command('pause')
    .description('Pause new trades (writes data/.paused)')
    .action(() => {
      try {
        pauseTrading();
        console.log('Trading paused. New entries are blocked until resume.');
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
