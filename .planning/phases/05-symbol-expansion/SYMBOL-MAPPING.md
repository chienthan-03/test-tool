# Symbol Mapping (RSS → USDT futures)

**Module:** `src/news/symbol-mapper.ts`

## Alias table (`DEFAULT_ALIASES`)

| Alias (word boundary) | Ticker | USDT symbol |
|----------------------|--------|-------------|
| bitcoin, btc | BTC | BTCUSDT |
| ethereum, eth | ETH | ETHUSDT |
| solana, sol | SOL | SOLUSDT |
| ripple, xrp | XRP | XRPUSDT |
| binance, bnb | BNB | BNBUSDT |

Custom aliases: pass `aliases` to `SymbolMapper` constructor (not used in config yet).

## Fixtures

| File | Expected symbols |
|------|------------------|
| `tests/fixtures/rss/sol-alt-headline.xml` | SOLUSDT (when whitelisted) |
| `tests/fixtures/rss/bnb-xrp-headline.xml` | BNBUSDT, XRPUSDT |

Included automatically by `seed-signals-from-fixtures.ts` (all `tests/fixtures/rss/*.xml`).

## Tests

`tests/unit/symbol-mapper.test.ts` — expanded whitelist coverage.
