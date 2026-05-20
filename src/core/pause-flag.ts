import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const PAUSE_FLAG_PATH = join(process.cwd(), 'data', '.paused');

export const isPaused = (): boolean => existsSync(PAUSE_FLAG_PATH);
