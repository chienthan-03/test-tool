import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { ZodError } from 'zod';
import { loadConfig } from '../../src/config/loader.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('config-loader', () => {
  it('loads default yaml', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.symbols).toContain('BTCUSDT');
  });

  it('loads binance.margin defaults', () => {
    const config = loadConfig(defaultConfigPath);
    expect(config.binance.margin.enabled).toBe(true);
    expect(config.binance.margin.mode).toBe('isolated');
    expect(config.binance.margin.leverage).toBe(5);
  });

  it('rejects empty symbols', () => {
    const parsed = parse(readFileSync(defaultConfigPath, 'utf8')) as Record<string, unknown>;
    parsed.symbols = [];

    const dir = mkdtempSync(join(tmpdir(), 'crypto-trader-cfg-'));
    const badPath = join(dir, 'invalid.yaml');
    writeFileSync(badPath, stringify(parsed));

    expect(() => loadConfig(badPath)).toThrow(ZodError);
  });
});
