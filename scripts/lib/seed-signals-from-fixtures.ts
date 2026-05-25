import { appendFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config/loader.js';
import type { AppConfig } from '../../src/config/schema.js';
import { AppEventBus } from '../../src/core/event-bus.js';
import { createLogger } from '../../src/core/logger.js';
import type { RssRawItem } from '../../src/core/types.js';
import { normalizeRssItem } from '../../src/news/normalizer.js';
import { RssPoller, type FetchFn } from '../../src/news/rss-poller.js';
import { SymbolMapper } from '../../src/news/symbol-mapper.js';
import { parseStrictIsoDate } from '../../src/cli/backtest-dates.js';
import type { RuleScoreDiscard } from '../../src/sentiment/rule-scorer.js';
import { RuleScorer } from '../../src/sentiment/rule-scorer.js';
import { SignalMerger } from '../../src/sentiment/signal-merger.js';
import { openDatabase } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { NewsRepository } from '../../src/storage/repositories/news-repo.js';
import { SignalRepository } from '../../src/storage/repositories/signal-repo.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = join(projectRoot, 'tests/fixtures/rss');

export type DiscardReason =
  | 'no_symbols'
  | 'blacklist'
  | 'rule_discard'
  | 'rule_null'
  | 'neutral_sentiment'
  | 'below_min_strength'
  | 'dedupe';

export type SeedSignalsOptions = {
  config: AppConfig;
  dbPath: string;
  from: Date;
  to: Date;
  repeat?: number;
  noLlm?: boolean;
  discardsPath?: string;
};

export type SeedSignalsResult = {
  itemsProcessed: number;
  signalsInserted: number;
  discards: number;
};

const isDiscard = (result: unknown): result is RuleScoreDiscard =>
  result !== null && typeof result === 'object' && 'discard' in result && result.discard === true;

const fixtureFetch =
  (fixturePath: string): FetchFn =>
  async () =>
    readFile(fixturePath, 'utf8');

const spreadDate = (from: Date, to: Date, index: number, total: number): Date => {
  if (total <= 1) {
    return new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
  }
  const ratio = index / (total - 1);
  return new Date(from.getTime() + ratio * (to.getTime() - from.getTime()));
};

const appendDiscard = async (
  path: string,
  entry: Record<string, unknown>,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(entry)}\n`, 'utf8');
};

const withRepeatTitle = (raw: RssRawItem, repeatIndex: number): RssRawItem => {
  if (repeatIndex === 0) {
    return raw;
  }
  const suffix = ` [seed-${repeatIndex}]`;
  return {
    ...raw,
    title: `${raw.title ?? ''}${suffix}`.trim(),
  };
};

export const seedSignalsFromFixtures = async (
  options: SeedSignalsOptions,
): Promise<SeedSignalsResult> => {
  const {
    config,
    dbPath,
    from,
    to,
    repeat = 1,
    noLlm = false,
    discardsPath,
  } = options;

  await rm(dbPath, { force: true });
  await mkdir(dirname(dbPath), { recursive: true });

  const db = openDatabase(dbPath);
  migrate(db);

  const bus = new AppEventBus();
  const log = createLogger({ level: 'silent', pretty: false });
  const mapper = new SymbolMapper(config.symbols);
  const scorer = new RuleScorer(config.sentiment.rules);
  const merger = new SignalMerger({
    symbols: config.symbols,
    rules: { minStrength: config.sentiment.rules.minStrength },
    llm: {
      minConfidence: config.sentiment.llm.minConfidence,
      defaultTtlMinutes: config.sentiment.llm.defaultTtlMinutes,
    },
  });
  const newsRepo = new NewsRepository(db);
  const signalRepo = new SignalRepository(db);
  const seenNews = new Set<string>();

  const files = (await readdir(fixturesDir))
    .filter((f) => f.endsWith('.xml'))
    .sort();

  const expanded: { raw: RssRawItem; sourceId: string; repeatIndex: number }[] = [];

  for (const file of files) {
    const fixturePath = join(fixturesDir, file);
    const sourceId = basename(file, '.xml');
    const poller = new RssPoller(fixtureFetch(fixturePath));
    const items = await poller.poll(`https://fixture.local/${file}`);
    for (let r = 0; r < repeat; r++) {
      for (const raw of items) {
        expanded.push({ raw: withRepeatTitle(raw, r), sourceId, repeatIndex: r });
      }
    }
  }

  let signalsInserted = 0;
  let discards = 0;

  for (let i = 0; i < expanded.length; i++) {
    const { raw, sourceId } = expanded[i]!;
    const createdAt = spreadDate(from, to, i, expanded.length);
    const news = normalizeRssItem(raw, sourceId, mapper);

    if (news.symbols.length === 0) {
      discards++;
      if (discardsPath) {
        await appendDiscard(discardsPath, {
          reason: 'no_symbols',
          title: news.title,
          sourceId,
        });
      }
      continue;
    }

    if (seenNews.has(news.id)) {
      discards++;
      if (discardsPath) {
        await appendDiscard(discardsPath, {
          reason: 'dedupe',
          title: news.title,
          newsId: news.id,
        });
      }
      continue;
    }
    seenNews.add(news.id);

    newsRepo.insertRaw(news, JSON.stringify(raw));

    const scoreResult = scorer.score(news);
    if (isDiscard(scoreResult)) {
      discards++;
      newsRepo.markProcessed(news.id);
      if (discardsPath) {
        await appendDiscard(discardsPath, {
          reason: 'blacklist',
          title: news.title,
          newsId: news.id,
        });
      }
      continue;
    }

    if (scoreResult === null) {
      discards++;
      newsRepo.markProcessed(news.id);
      if (discardsPath) {
        await appendDiscard(discardsPath, {
          reason: 'rule_null',
          title: news.title,
        });
      }
      continue;
    }

    const llm =
      !noLlm &&
      scoreResult.needsLlm &&
      config.sentiment.llm.enabled
        ? null
        : null;

    const signal = merger.build(scoreResult, news, llm);
    if (signal === null) {
      discards++;
      newsRepo.markProcessed(news.id);
      const reason =
        scoreResult.ruleSentiment === 0 ? 'neutral_sentiment' : 'below_min_strength';
      if (discardsPath) {
        await appendDiscard(discardsPath, {
          reason,
          title: news.title,
          impactScore: scoreResult.impactScore,
          ruleSentiment: scoreResult.ruleSentiment,
          needsLlm: scoreResult.needsLlm,
        });
      }
      continue;
    }

    signal.createdAt = createdAt;
    signal.expiresAt = new Date(createdAt.getTime() + config.sentiment.llm.defaultTtlMinutes * 60_000);
    signalRepo.insert(signal);
    bus.emit('news:signal', signal);
    newsRepo.markProcessed(news.id);
    signalsInserted++;
  }

  db.close();

  return {
    itemsProcessed: expanded.length,
    signalsInserted,
    discards,
  };
};

export const seedSignalsFromConfigPath = async (params: {
  configPath: string;
  dbPath: string;
  from: string;
  to: string;
  repeat?: number;
  noLlm?: boolean;
  discardsPath?: string;
}): Promise<SeedSignalsResult> => {
  const config = loadConfig(params.configPath);
  return seedSignalsFromFixtures({
    config,
    dbPath: params.dbPath,
    from: parseStrictIsoDate(params.from, 'from'),
    to: parseStrictIsoDate(params.to, 'to'),
    repeat: params.repeat,
    noLlm: params.noLlm,
    discardsPath: params.discardsPath,
  });
};
