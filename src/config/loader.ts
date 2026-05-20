import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { AppConfigSchema, type AppConfig } from './schema.js';

export function loadConfig(configPath: string): AppConfig {
  const raw = readFileSync(configPath, 'utf8');
  const parsed = parse(raw);
  return AppConfigSchema.parse(parsed);
}

export function loadConfigWithEnv(configPath: string): AppConfig {
  const config = loadConfig(configPath);
  if (process.env.SQLITE_PATH) {
    config.storage.sqlitePath = process.env.SQLITE_PATH;
  }
  return config;
}

export function assertRuntimeSecrets(config: AppConfig, mode: string): void {
  if (mode === 'testnet' || mode === 'live') {
    if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
      throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET required');
    }
  }
  if (config.sentiment.llm.enabled && !process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY required when llm.enabled');
  }
  if (mode === 'live' && !config.allowLive) {
    throw new Error('Refusing live mode: set allowLive: true in config');
  }
}
