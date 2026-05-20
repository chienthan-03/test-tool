import { loadConfigWithEnv } from '../config/loader.js';
import { AppEventBus } from '../core/event-bus.js';
import { createLogger } from '../core/logger.js';
import { BinanceMarket } from '../market/binance-market.js';
import { KlineStore } from '../market/kline-store.js';

const CONFIG_PATH = process.env.CONFIG_PATH ?? 'config/default.yaml';
const MAX_CLOSES = 3;
const TIMEOUT_MS = 45_000;

const main = async (): Promise<void> => {
  const config = loadConfigWithEnv(CONFIG_PATH);
  const bus = new AppEventBus();
  const log = createLogger({
    level: config.logging.level,
    pretty: config.logging.pretty,
  });
  const store = new KlineStore();
  const market = new BinanceMarket(store, bus, config, log);

  let closeCount = 0;
  let finished = false;

  const finish = (reason: string): void => {
    if (finished) {
      return;
    }
    finished = true;
    clearTimeout(timeout);
    market.stop();
    console.log(reason);
    process.exit(closeCount > 0 ? 0 : 1);
  };

  const timeout = setTimeout(() => {
    finish(`Stopped after ${TIMEOUT_MS / 1000}s (${closeCount} closes logged)`);
  }, TIMEOUT_MS);

  bus.on('market:candleClose', ({ candle }) => {
    closeCount += 1;
    console.log(
      `[${closeCount}/${MAX_CLOSES}] ${candle.symbol} ${candle.interval} close=${candle.close}`,
    );
    if (closeCount >= MAX_CLOSES) {
      finish(`Logged ${MAX_CLOSES} candle closes`);
    }
  });

  console.log('Starting BinanceMarket BTCUSDT 15m (public klines)...');
  await market.start(['BTCUSDT'], ['15m']);
  console.log('Subscribed; waiting for closed candles...');
};

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
