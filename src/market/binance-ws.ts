import WebSocket from 'ws';
import type { Logger } from '../core/logger.js';
import type { Candle } from '../core/types.js';

export type KlineWsHandler = (candle: Candle) => void;

type KlineEvent = {
  e: string;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    o: string;
    h: string;
    l: string;
    c: string;
    v: string;
    x: boolean;
  };
};

type CombinedStreamMessage = {
  stream?: string;
  data?: KlineEvent;
};

const mapWsKline = (k: KlineEvent['k']): Candle => ({
  symbol: k.s,
  interval: k.i,
  openTime: new Date(k.t),
  closeTime: new Date(k.T),
  open: Number(k.o),
  high: Number(k.h),
  low: Number(k.l),
  close: Number(k.c),
  volume: Number(k.v),
  isClosed: true,
});

const trimWsBaseUrl = (wsBaseUrl: string): string => wsBaseUrl.replace(/\/$/, '');

const buildStreamUrl = (wsBaseUrl: string, streams: string[]): string =>
  `${trimWsBaseUrl(wsBaseUrl)}/stream?streams=${streams.join('/')}`;

const reconnectDelayMs = (attempt: number): number => {
  const base = Math.min(1000 * 2 ** attempt, 30_000);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(base * jitter);
};

export class BinanceWsClient {
  private ws: WebSocket | null = null;
  private streams: string[] = [];
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(
    private readonly wsBaseUrl: string,
    private readonly onMessage: KlineWsHandler,
    private readonly log: Logger,
    private readonly maxReconnectRetries: number,
  ) {}

  subscribeKlines(streams: string[]): void {
    this.streams = streams;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.openConnection();
  }

  close(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.teardownSocket();
    this.streams = [];
  }

  private openConnection(): void {
    if (this.intentionalClose || this.streams.length === 0) {
      return;
    }

    this.teardownSocket();

    const url = buildStreamUrl(this.wsBaseUrl, this.streams);
    const socket = new WebSocket(url);
    this.ws = socket;

    socket.on('open', () => {
      this.reconnectAttempt = 0;
      this.log.debug({ streams: this.streams.length }, 'binance ws connected');
    });

    socket.on('message', (raw) => {
      this.handleMessage(raw);
    });

    socket.on('error', (error) => {
      this.log.warn({ err: error }, 'binance ws error');
    });

    socket.on('close', () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let parsed: CombinedStreamMessage;
    try {
      parsed = JSON.parse(String(raw)) as CombinedStreamMessage;
    } catch {
      this.log.warn('binance ws: failed to parse message');
      return;
    }

    const event = parsed.data;
    if (!event?.k || event.k.x !== true) {
      return;
    }

    this.onMessage(mapWsKline(event.k));
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.streams.length === 0) {
      return;
    }

    if (this.reconnectAttempt >= this.maxReconnectRetries) {
      this.log.error(
        { attempts: this.reconnectAttempt },
        'binance ws: max reconnect retries exceeded',
      );
      return;
    }

    const delayMs = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.log.info({ attempt: this.reconnectAttempt, delayMs }, 'binance ws reconnect scheduled');

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openConnection();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    if (!this.ws) {
      return;
    }

    const socket = this.ws;
    socket.removeAllListeners();
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
    this.ws = null;
  }
}
