# Crypto News Auto-Trader

Node.js CLI that trades Binance USDⓈ-M Futures from RSS news sentiment.

## Phase 1

Validate configuration and exercise the RSS → rule-signal pipeline:

```bash
npm run dev -- validate
npm run dev -- validate --dry-poll
npm run dev -- feeds
```

`validate --dry-poll` polls every enabled feed once (no API keys required) and prints how many RSS items were fetched and how many signals were created.

`feeds` prints feed health from SQLite (`feed_status`): last success, last error, and consecutive failures.

## Phase 2

Exercise Binance kline REST bootstrap and WebSocket updates (public endpoints; no API keys in `sim` mode):

```bash
npx tsx src/scripts/smoke-klines.ts
```

Logs up to three closed 15m `BTCUSDT` candle closes, then exits (or stops after 45 seconds).

## Phase 4 — Sim mode

Run the full sim stack (RSS → signals → MTF strategy → sim broker, mainnet public klines only):

```bash
npm run dev -- start --mode sim
```

Optional: `--config config/default.yaml`, `--symbols BTCUSDT,ETHUSDT`.

Press **Ctrl+C** to stop. Open positions are **not** auto-closed on shutdown.

Other commands:

```bash
npm run dev -- status --mode sim
npm run dev -- pause
npm run dev -- resume
```

## Phase 6 — Testnet mode

Trade on [Binance Futures Testnet](https://testnet.binancefuture.com) with real signed orders (MARKET entry + reduce-only STOP_MARKET / TAKE_PROFIT_MARKET).

### API keys

1. Create Futures Testnet API keys at https://testnet.binancefuture.com → API Management.
2. Copy `.env.example` to `.env` and set:

```bash
BINANCE_API_KEY=your_testnet_key
BINANCE_API_SECRET=your_testnet_secret
```

Withdrawals are not applicable on testnet; still treat keys as secrets.

### Run

```bash
npm run dev -- start --mode testnet
npm run dev -- status --mode testnet
```

Optional: `--symbols BTCUSDT` to limit symbols. Klines and user REST use `binance.testnetBaseUrl` / `testnetWsUrl` from config.

### Risk warning

Use a **small** `risk.positionPercent` (e.g. `0.5`) while validating SL/TP in the testnet UI. Default config uses `2` (% of balance per trade). Multiple open positions each reserve full `positionPercent` — total exposure can exceed balance notionally.

Live mode (`--mode live`) is not implemented yet; the adapter factory refuses it until Phase 7.
