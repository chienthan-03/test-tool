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
