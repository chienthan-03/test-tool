import { describe, it, expect, vi, afterEach } from 'vitest';
import { printFeedsTable } from '../../src/cli/commands/feeds.js';
import type { FeedStatus } from '../../src/storage/repositories/feed-repo.js';

describe('printFeedsTable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints configured feeds with status columns', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const statusByFeedId = new Map<string, FeedStatus>([
      [
        'coindesk',
        {
          feedId: 'coindesk',
          lastSuccessAt: new Date('2026-05-20T10:00:00.000Z'),
          lastErrorAt: null,
          lastError: null,
          consecutiveFailures: 0,
        },
      ],
    ]);

    printFeedsTable(['coindesk', 'missing'], statusByFeedId);

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('feed id');
    expect(output).toContain('coindesk');
    expect(output).toContain('missing');
    expect(output).toContain('2026-05-20T10:00:00.000Z');
  });
});
