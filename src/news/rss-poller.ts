import { fetch } from 'undici';
import Parser from 'rss-parser';
import { retry } from '../core/retry.js';
import type { RssRawItem } from '../core/types.js';

export const RSS_USER_AGENT = 'crypto-news-trader/1.0';
export const RSS_FETCH_TIMEOUT_MS = 10_000;

export type FetchFn = (url: string) => Promise<string>;

export const defaultFetch: FetchFn = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': RSS_USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RSS fetch failed: HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
};

const mapParserItem = (item: Parser.Item): RssRawItem => ({
  title: item.title ?? '',
  link: item.link ?? item.guid ?? '',
  content: item.content,
  contentSnippet: item.contentSnippet,
  summary: item.summary,
  pubDate: item.pubDate,
  isoDate: item.isoDate,
});

export class RssPoller {
  private readonly parser: Parser;

  constructor(
    private readonly fetchFn: FetchFn = defaultFetch,
    parser?: Parser,
  ) {
    this.parser = parser ?? new Parser();
  }

  async poll(url: string): Promise<RssRawItem[]> {
    return retry(
      async () => {
        const xml = await this.fetchFn(url);
        const feed = await this.parser.parseString(xml);
        return (feed.items ?? []).map(mapParserItem);
      },
      {
        attempts: 3,
        delaysMs: [1_000, 2_000, 4_000],
      },
    );
  }
}
