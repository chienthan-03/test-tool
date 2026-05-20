import { newsId } from '../core/hash.js';
import type { NewsItem, RssRawItem } from '../core/types.js';
import type { SymbolMapper } from './symbol-mapper.js';

const parsePublishedAt = (raw: RssRawItem): Date => {
  const dateStr = raw.isoDate ?? raw.pubDate;
  if (!dateStr) {
    return new Date();
  }

  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
};

export const normalizeRssItem = (
  raw: RssRawItem,
  sourceId: string,
  mapper: SymbolMapper,
): NewsItem => {
  const title = (raw.title ?? '').trim();
  const url = (raw.link ?? '').trim();
  const snippet = (raw.contentSnippet ?? raw.summary ?? '').trim();
  const summary = snippet.length > 0 ? snippet : undefined;
  const publishedAt = parsePublishedAt(raw);
  const fetchedAt = new Date();
  const text = summary ? `${title} ${summary}` : title;
  const symbols = mapper.extractSymbols(text);
  const id = newsId(sourceId, title, publishedAt);

  return {
    id,
    sourceId,
    title,
    summary,
    url,
    publishedAt,
    fetchedAt,
    symbols,
    tags: [],
  };
};
