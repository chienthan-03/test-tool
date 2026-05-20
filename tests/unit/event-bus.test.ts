import { describe, it, expect, vi } from 'vitest';
import { AppEventBus } from '../../src/core/event-bus.js';
import type { NewsSignal } from '../../src/core/types.js';

describe('event-bus', () => {
  it('emits news:signal', () => {
    const bus = new AppEventBus();
    const handler = vi.fn();
    const signal: NewsSignal = {
      id: 'sig-1',
      newsId: 'news-1',
      symbols: ['BTCUSDT'],
      direction: 'long',
      strength: 0.8,
      expiresAt: new Date('2026-05-20T12:00:00.000Z'),
      source: 'rule',
      createdAt: new Date('2026-05-20T11:00:00.000Z'),
    };

    bus.on('news:signal', handler);
    bus.emit('news:signal', signal);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(signal);
  });
});
