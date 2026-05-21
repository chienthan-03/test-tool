import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/** Load `.env` from project root (cwd) before reading process.env secrets. */
export const loadEnvFile = (): void => {
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
};
