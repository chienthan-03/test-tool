import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import { SymbolCooldownTracker } from '../../src/strategy/symbol-cooldown.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const defaultConfigPath = join(projectRoot, 'config/default.yaml');

describe('SymbolCooldownTracker', () => {
  let config: AppConfig;
  let now: Date;

  beforeEach(() => {
    config = loadConfig(defaultConfigPath);
    config = {
      ...config,
      risk: {
        ...config.risk,
        cooldownAfterLoss: { enabled: true, durationHours: 12 },
      },
    };
    now = new Date('2026-01-15T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks symbol until duration elapses after losing close', () => {
    const bus = new AppEventBus();
    const tracker = new SymbolCooldownTracker(config, () => new Date());
    tracker.wire(bus);

    bus.emit('execution:positionClosed', {
      symbol: 'BTCUSDT',
      exitPrice: 99,
      pnl: -10,
      feesUsdt: 0.1,
    });

    expect(tracker.isBlocked('BTCUSDT')).toBe(true);
    expect(tracker.isBlocked('ETHUSDT')).toBe(false);

    vi.setSystemTime(new Date(now.getTime() + 11 * 3_600_000));
    expect(tracker.isBlocked('BTCUSDT')).toBe(true);

    vi.setSystemTime(new Date(now.getTime() + 12 * 3_600_000));
    expect(tracker.isBlocked('BTCUSDT')).toBe(false);
  });

  it('does not cooldown after winning close', () => {
    const bus = new AppEventBus();
    const tracker = new SymbolCooldownTracker(config, () => new Date());
    tracker.wire(bus);

    bus.emit('execution:positionClosed', {
      symbol: 'BTCUSDT',
      exitPrice: 110,
      pnl: 25,
      feesUsdt: 0.1,
    });

    expect(tracker.isBlocked('BTCUSDT')).toBe(false);
  });

  it('is no-op when disabled in config', () => {
    const offConfig: AppConfig = {
      ...config,
      risk: {
        ...config.risk,
        cooldownAfterLoss: { enabled: false, durationHours: 12 },
      },
    };
    const bus = new AppEventBus();
    const tracker = new SymbolCooldownTracker(offConfig, () => new Date());
    tracker.wire(bus);

    bus.emit('execution:positionClosed', {
      symbol: 'BTCUSDT',
      exitPrice: 99,
      pnl: -10,
      feesUsdt: 0.1,
    });

    expect(tracker.isBlocked('BTCUSDT')).toBe(false);
  });
});
