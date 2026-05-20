import { describe, it, expect } from 'vitest';
import { newsId } from '../../src/core/hash.js';

describe('hash', () => {
  it('stable news id', () => {
    const publishedAt = new Date('2026-05-20T10:00:00.000Z');
    const first = newsId('coindesk', 'Bitcoin hits new high', publishedAt);
    const second = newsId('coindesk', 'Bitcoin hits new high', publishedAt);

    expect(first).toBe(second);
    expect(first).toHaveLength(32);
  });
});
