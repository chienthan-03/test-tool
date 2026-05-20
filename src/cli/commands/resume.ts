import { existsSync, unlinkSync } from 'node:fs';
import type { Command } from 'commander';
import { PAUSE_FLAG_PATH } from '../../core/pause-flag.js';

export const resumeTrading = (): void => {
  if (existsSync(PAUSE_FLAG_PATH)) {
    unlinkSync(PAUSE_FLAG_PATH);
  }
};

export const registerResumeCommand = (program: Command): void => {
  program
    .command('resume')
    .description('Resume trading (removes data/.paused)')
    .action(() => {
      try {
        resumeTrading();
        console.log('Trading resumed.');
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
