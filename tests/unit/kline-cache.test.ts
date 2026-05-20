import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { downloadKlines, loadKlines } from '../../src/market/kline-cache.js';

const sampleKlineRow = (
  openTime: number,
  close: string,
): [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
] => [
  openTime,
  close,
  String(Number(close) + 10),
  String(Number(close) - 10),
  close,
  '100',
  openTime + 899_999,
  '1000',
  10,
  '500',
  '50',
  '0',
];

describe('kline-cache', () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'kline-cache-'));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('paginates REST klines and saves JSON cache', async () => {
    const from = new Date('2025-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + 1600 * 900_000);
    let call = 0;

    const fetchFn = vi.fn(async (input) => {
      call += 1;
      const url = String(input);
      expect(url).toContain('/fapi/v1/klines');

      if (call === 1) {
        const rows = Array.from({ length: 1500 }, (_, i) =>
          sampleKlineRow(from.getTime() + i * 900_000, String(100 + i)),
        );
        return { ok: true, json: async () => rows } as Response;
      }

      return {
        ok: true,
        json: async () => [sampleKlineRow(from.getTime() + 1500 * 900_000, '1600')],
      } as Response;
    }) as typeof fetch;

    const path = await downloadKlines(
      'https://fapi.binance.com',
      'BTCUSDT',
      '15m',
      from,
      to,
      cacheDir,
      fetchFn,
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const raw = JSON.parse(await readFile(path, 'utf8')) as unknown[];
    expect(raw).toHaveLength(1501);

    const candles = await loadKlines(path);
    expect(candles[0]?.symbol).toBe('BTCUSDT');
    expect(candles[0]?.interval).toBe('15m');
    expect(candles[0]?.openTime).toEqual(new Date(from.getTime()));
    expect(candles.every((c) => c.isClosed)).toBe(true);
  });
});
