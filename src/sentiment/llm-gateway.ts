import type { AppConfig } from '../config/schema.js';
import type { LlmSentiment, NewsItem, RuleScoreResult } from '../core/types.js';
import type { LlmRepository } from '../storage/repositories/llm-repo.js';
import { buildUserPrompt, STRICT_SYSTEM_PROMPT, SYSTEM_PROMPT } from './llm-prompts.js';
import { LlmSentimentSchema } from './llm-schema.js';

export type LlmConfig = AppConfig['sentiment']['llm'];

type FetchFn = typeof fetch;

const HTTP_REFERER = 'https://github.com/local/crypto-news-trader';
const X_TITLE = 'crypto-news-trader';
const RETRY_BACKOFF_MS = [1_000, 3_000] as const;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const isRetryableStatus = (status: number): boolean => status === 429 || status >= 500;

export class LlmGateway {
  private callTimestamps: number[] = [];

  constructor(
    private readonly config: LlmConfig,
    private readonly llmRepo: LlmRepository,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  canCall(): boolean {
    const hourAgo = Date.now() - 3_600_000;
    this.callTimestamps = this.callTimestamps.filter((timestamp) => timestamp > hourAgo);
    const total = this.llmRepo.countLastHour() + this.callTimestamps.length;
    return total < this.config.maxCallsPerHour;
  }

  async analyze(
    item: NewsItem,
    rule: RuleScoreResult,
    whitelist: string[],
  ): Promise<LlmSentiment | null> {
    if (!this.canCall()) {
      return null;
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return null;
    }

    this.callTimestamps.push(Date.now());
    const startedAt = Date.now();

    let result = await this.requestCompletion(
      apiKey,
      item,
      rule,
      whitelist,
      SYSTEM_PROMPT,
      startedAt,
    );

    if (result.sentiment === null && result.invalidJson) {
      result = await this.requestCompletion(
        apiKey,
        item,
        rule,
        whitelist,
        STRICT_SYSTEM_PROMPT,
        startedAt,
      );
    }

    return result.sentiment;
  }

  private async requestCompletion(
    apiKey: string,
    item: NewsItem,
    rule: RuleScoreResult,
    whitelist: string[],
    systemPrompt: string,
    startedAt: number,
  ): Promise<{ sentiment: LlmSentiment | null; invalidJson: boolean }> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: this.config.model,
      temperature: 0.1,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system' as const, content: systemPrompt },
        { role: 'user' as const, content: buildUserPrompt(item, rule, whitelist) },
      ],
    };

    let response: Response | null = null;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt += 1) {
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': HTTP_REFERER,
            'X-Title': X_TITLE,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });

        if (response.ok) {
          break;
        }

        lastError = `HTTP ${response.status}`;
        if (!isRetryableStatus(response.status) || attempt === RETRY_BACKOFF_MS.length) {
          break;
        }

        await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!);
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'request failed';
        if (attempt === RETRY_BACKOFF_MS.length) {
          break;
        }
        await sleep(RETRY_BACKOFF_MS[attempt] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!);
      }
    }

    const latencyMs = Date.now() - startedAt;

    if (!response?.ok) {
      this.llmRepo.insertCall({
        newsId: item.id,
        model: this.config.model,
        latencyMs,
        success: false,
        error: lastError ?? `HTTP ${response?.status ?? 'unknown'}`,
      });
      return { sentiment: null, invalidJson: false };
    }

    let payload: ChatCompletionResponse;
    try {
      payload = (await response.json()) as ChatCompletionResponse;
    } catch {
      this.llmRepo.insertCall({
        newsId: item.id,
        model: this.config.model,
        latencyMs,
        success: false,
        error: 'invalid response json',
      });
      return { sentiment: null, invalidJson: true };
    }

    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      this.llmRepo.insertCall({
        newsId: item.id,
        model: this.config.model,
        latencyMs,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        success: false,
        error: 'missing message content',
      });
      return { sentiment: null, invalidJson: true };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(content);
    } catch {
      this.llmRepo.insertCall({
        newsId: item.id,
        model: this.config.model,
        latencyMs,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        success: false,
        error: 'invalid content json',
      });
      return { sentiment: null, invalidJson: true };
    }

    const validated = LlmSentimentSchema.safeParse(parsedJson);
    if (!validated.success) {
      this.llmRepo.insertCall({
        newsId: item.id,
        model: this.config.model,
        latencyMs,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
        success: false,
        error: 'schema validation failed',
      });
      return { sentiment: null, invalidJson: true };
    }

    this.llmRepo.insertCall({
      newsId: item.id,
      model: this.config.model,
      latencyMs,
      promptTokens: payload.usage?.prompt_tokens,
      completionTokens: payload.usage?.completion_tokens,
      success: true,
    });

    return { sentiment: validated.data, invalidJson: false };
  }
}
