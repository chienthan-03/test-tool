import type { Command } from 'commander';
import { loadConfigWithEnv } from '../../config/loader.js';
import type { FeedStatus } from '../../storage/repositories/feed-repo.js';
import { createNewsStack } from '../news-stack.js';

const formatTimestamp = (date: Date | null): string => {
  if (date === null) {
    return '-';
  }

  return date.toISOString();
};

const truncate = (value: string | null, maxLen: number): string => {
  if (value === null || value === '') {
    return '-';
  }

  if (value.length <= maxLen) {
    return value;
  }

  return `${value.slice(0, maxLen - 3)}...`;
};

export const printFeedsTable = (
  feedIds: string[],
  statusByFeedId: Map<string, FeedStatus>,
): void => {
  const headers = ['feed id', 'last success', 'last error', 'consecutive failures'];
  const rows = feedIds.map((feedId) => {
    const status = statusByFeedId.get(feedId);
    return [
      feedId,
      formatTimestamp(status?.lastSuccessAt ?? null),
      truncate(status?.lastError ?? null, 48),
      String(status?.consecutiveFailures ?? 0),
    ];
  });

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );

  const formatRow = (cells: string[]): string =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join('  ');

  console.log(formatRow(headers));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(formatRow(row));
  }
};

export const registerFeedsCommand = (program: Command): void => {
  program
    .command('feeds')
    .description('List RSS feed status from the database')
    .option('--config <path>', 'Path to config YAML', 'config/default.yaml')
    .action((options: { config: string }) => {
      try {
        const config = loadConfigWithEnv(options.config);
        const { db, feedRepo } = createNewsStack(config);

        const statusByFeedId = new Map(feedRepo.listAll().map((status) => [status.feedId, status]));
        const feedIds = config.feeds.map((feed) => feed.id);

        printFeedsTable(feedIds, statusByFeedId);
        db.close();
        process.exit(0);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(1);
      }
    });
};
