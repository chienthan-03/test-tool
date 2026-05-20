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

## Phase 7 — Live mode (mainnet)

**Real money.** Orders execute on Binance USDⓈ-M Futures mainnet. Only enable after validating on testnet.

### Safety gate

Set in your config YAML (not only env):

```yaml
allowLive: true
```

Without `allowLive: true`, `start --mode live` exits with: `Refusing live mode: set allowLive: true in config`.

### API keys

1. Create **Futures** API keys at https://www.binance.com → API Management.
2. **Disable withdrawals** on the key (recommended).
3. Restrict IP if possible; never commit keys.
4. Set in `.env`:

```bash
BINANCE_API_KEY=your_mainnet_key
BINANCE_API_SECRET=your_mainnet_secret
```

### Run

```bash
# Edit config: allowLive: true
npm run dev -- start --mode live
npm run dev -- status --mode live
```

Uses `binance.baseUrl` / `mainnetWsUrl`. On connect the adapter logs: **LIVE TRADING ENABLED - real funds at risk**.

### Risk warnings

- Start with a **very small** `risk.positionPercent` (e.g. `0.1`–`0.5`).
- Circuit breaker halts new entries after repeated API failures; it does not close open positions.
- Open positions are **not** auto-closed on Ctrl+C shutdown.
- You are responsible for SL/TP visibility in the Binance UI and for account margin.
