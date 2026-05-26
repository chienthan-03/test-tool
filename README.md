# Crypto News Auto-Trader

Bot CLI Node.js giao dịch **Binance USDⓈ-M Futures** dựa trên sentiment tin RSS (quy tắc + LLM tùy chọn). Dùng cho mô phỏng, testnet và live (có cổng an toàn).

English summary: automated futures trader driven by RSS news rules and optional OpenRouter LLM, with `sim` / `testnet` / `live` modes.

**Thiết kế đầy đủ:** [docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md](docs/superpowers/specs/2026-05-20-crypto-news-trader-design.md)

**Hướng dẫn Futures (tiếng Việt):** [docs/HUONG-DAN-FUTURES.md](docs/HUONG-DAN-FUTURES.md) — cách dùng đúng testnet/live, margin, leverage, size lệnh. **Tất cả lệnh + ví dụ:** [docs/LENH-THAM-CHIEU.md](docs/LENH-THAM-CHIEU.md). Checklist live: [docs/KIEM-TRA-LIVE.md](docs/KIEM-TRA-LIVE.md).

---

## Tổng quan / Project overview

Luồng chính:

1. Poll RSS (CoinDesk, CoinTelegraph, …) → lưu SQLite, dedupe theo hash.
2. Ánh xạ symbol whitelist (`BTCUSDT`, `ETHUSDT`, …) — tin không khớp symbol bị bỏ qua.
3. Rule scorer + (tùy chọn) OpenRouter khi vượt ngưỡng `thresholdLLM`.
4. Chiến lược MTF (mặc định **1d** context + **4h** entry) → intent.
5. Risk engine: % balance, SL/TP theo ATR → lệnh qua adapter (`sim` / `testnet` / `live`).

---

## Yêu cầu / Prerequisites

| Yêu cầu | Ghi chú |
|--------|---------|
| **Node.js 20+** | `engines` trong `package.json` |
| **Binance Futures Testnet** | API key cho `--mode testnet` — [testnet.binancefuture.com](https://testnet.binancefuture.com) |
| **Binance Futures Live** | API key mainnet cho `--mode live`; khuyến nghị tắt rút tiền trên key |
| **OpenRouter** (tùy chọn) | Chỉ khi `sentiment.llm.enabled: true`; không có key vẫn chạy rule-only |

---

## Cài đặt / Install

```bash
npm install
cp .env.example .env
```

Chỉnh `.env` (không commit):

```bash
BINANCE_API_KEY=          # testnet hoặc mainnet tùy mode
BINANCE_API_SECRET=
OPENROUTER_API_KEY=       # tùy chọn
CONFIG_PATH=./config/default.yaml
SQLITE_PATH=./data/trader.db
LOG_LEVEL=info
```

Build (tùy chọn, cho `npm start`):

```bash
npm run build
```

Chạy CLI trong dev:

```bash
npm run dev -- <command> [options]
```

---

## Win rate improvement (Phases 1–10)

Research cycle merged into production presets (rule-only sentiment, tighter Fib zone, 5 symbols, `EntryGate`, optional cooldown).

| Resource | Purpose |
|----------|---------|
| `config/production.yaml` | Recommended operator profile (`allowLive: false` until checklist done) |
| `config/default.yaml` | Same strategy settings; inline comments on win-rate fields |
| `docs/LIVE-SAFETY-CHECKLIST.md` | Required before mainnet `start --mode live` |
| `npm run export-trade-review` | CSV for manual trade review |
| `npm run backtest-matrix` | Compare experiment YAMLs |
| `npm run parity-check` | Backtest smoke on production risk baseline |
| `.planning/phases/08-trade-review-workflow/` | Review checklist & process |
| `.planning/phases/09-mode-parity-validation/MODE-PARITY.md` | Sim / backtest / testnet differences |

- **Alternate entry paths:** Fib-first fallback with optional `breakout` / `emaMomentum` behind `strategy.alternateEntries` (default `enabled: false`); `entry_path` in trade-review CSV. See [spec](docs/superpowers/specs/2026-05-25-alternate-entry-paths-design.md) and [implementation plan](docs/superpowers/plans/2026-05-25-alternate-entry-paths.md).
- **Entry profile (swing vs intraday):** switch `strategy.entryProfile` in one YAML — Elliott+Fib on `1d/4h` (default) or EMA-context momentum (`breakout` → `emaMomentum`) on `1h/15m` without Fib; `validate` warns on TF mismatch. See [spec](docs/superpowers/specs/2026-05-27-entry-profile-momentum-design.md) and operator notes in [HUONG-DAN-FUTURES.md](docs/HUONG-DAN-FUTURES.md) §7.7.

**Mode progression:** sim → testnet (≥1 week + trade review) → live only after checklist + `allowLive: true`.

```bash
# Use production profile
export CONFIG_PATH=./config/production.yaml
npm run dev -- validate --config config/production.yaml
npm run parity-check
npm run dev -- start --mode testnet
```

---

## Cấu hình / Configuration

File mặc định: `config/default.yaml` (hoặc `config/production.yaml` cho vận hành). Các trường quan trọng:

| Trường | Ý nghĩa |
|--------|---------|
| `mode` | Gợi ý mặc định (`sim`); runtime thực tế do `start --mode` |
| `allowLive` | **`false` by default**; set `true` only after `docs/LIVE-SAFETY-CHECKLIST.md` |
| `entryGates` | Phase 6 MTF veto layer (`enabled`, `captureRejects` for review exports) |
| `strategy.fibonacci.zoneTolerancePercent` | `0.02` production preset (Phase 4/6) |
| `risk.cooldownAfterLoss` | Optional per-symbol cooldown after loss (Phase 7; default off) |
| `symbols` | Danh sách cặp futures (whitelist RSS) |
| `symbolOverrides` | Ghi đè risk/strategy theo symbol |
| `feeds` | RSS: `id`, `url`, `pollIntervalSec`, `enabled` |
| `sentiment.rules` | Từ khóa, `thresholdLLM`, `minStrength`, tag rules |
| `sentiment.llm` | `enabled`, `model`, `maxCallsPerHour`, `minConfidence` |
| `risk.positionPercent` | % balance → notional mỗi lệnh (production: `15`; hạ khi testnet, xem [HUONG-DAN-FUTURES.md](docs/HUONG-DAN-FUTURES.md)) |
| `risk.slAtrMultiplier` / `tpAtrMultiplier` | SL/TP theo ATR |
| `binance.margin.enabled` | Bật/tắt set margin/leverage lúc connect (mặc định `true`) |
| `binance.margin.mode` | `isolated` hoặc `cross` (mặc định `isolated`) |
| `binance.margin.leverage` | Đòn bẩy 1–125 (mặc định `5`); bot cảnh báo nếu > 10 |
| `binance.*` | URL testnet/mainnet, circuit breaker |
| `sim.*` | Balance ảo, phí, slippage cho `--mode sim` |
| `storage.sqlitePath` | DB tin, signal, feed status |

Ví dụ giảm size khi thử testnet:

```yaml
risk:
  positionPercent: 0.5
```

Tắt LLM (rule-only):

```yaml
sentiment:
  llm:
    enabled: false
```

Margin / leverage (áp dụng lúc `connect` trên testnet/live; sim/backtest không đổi):

```yaml
binance:
  margin:
    enabled: true
    mode: isolated
    leverage: 5

symbolOverrides:
  BTCUSDT:
    margin:
      leverage: 3
```

Đặt `binance.margin.enabled: false` nếu bạn muốn giữ cấu hình margin/leverage thủ công trên sàn.

---

## Lệnh CLI / CLI commands

Tất cả ví dụ dùng `npm run dev --`. Sau `npm run build`, có thể dùng `npm start --` hoặc `npx crypto-trader`.

### `validate`

Kiểm tra YAML + schema; không cần API key.

```bash
npm run dev -- validate
npm run dev -- validate --config config/default.yaml
```

### `validate --dry-poll`

Poll **một lần** mọi feed `enabled`, chạy pipeline RSS → signal, in thống kê (không cần Binance/OpenRouter).

```bash
npm run dev -- validate --dry-poll
```

### `feeds`

Trạng thái feed từ SQLite (`feed_status`): lần poll OK lỗi, số lần fail liên tiếp.

```bash
npm run dev -- feeds
```

### `status`

Balance, vị thế, feed, số signal gần đây.

```bash
npm run dev -- status --mode sim
npm run dev -- status --mode testnet
npm run dev -- status --mode live
```

### `pause` / `resume`

Ghi/xóa `data/.paused` — bot vẫn poll tin nhưng không mở lệnh mới.

```bash
npm run dev -- pause
npm run dev -- resume
```

### `start`

Chạy bot đầy đủ. **Ctrl+C** dừng graceful; **không** tự đóng vị thế mở.

```bash
npm run dev -- start --mode sim
npm run dev -- start --mode sim --symbols BTCUSDT,ETHUSDT

npm run dev -- start --mode testnet
# Cần BINANCE_API_KEY/SECRET testnet trong .env

npm run dev -- start --mode live
# Cần allowLive: true trong config + key mainnet
```

### `backtest`

Backtest lịch sử; in JSON tóm tắt ra stdout; báo cáo đầy đủ trong `backtest.reportDir`.

```bash
npm run dev -- backtest --from 2025-01-01 --to 2025-01-31
npm run dev -- backtest --from 2025-06-01 --to 2025-06-07 --mock-sentiment
npm run dev -- backtest --from 2025-01-01 --to 2025-01-07 --config config/default.yaml
```

`--mock-sentiment`: tạo signal long giả mỗi 6 giờ (không cần RSS thật trong khoảng thời gian).

---

## Tiến trình mode / Mode progression

Khuyến nghị: **sim → testnet → live**.

| Bước | Mode | API keys | Ghi chú |
|------|------|----------|---------|
| 1 | `sim` | Không | Kline public mainnet; lệnh ảo + phí/slippage |
| 2 | `testnet` | Testnet Futures | Lệnh thật trên testnet; kiểm tra SL/TP trên UI |
| 3 | `live` | Mainnet Futures | Hoàn thành `docs/LIVE-SAFETY-CHECKLIST.md`; đặt `allowLive: true`; tiền thật |

Nếu `allowLive: false`, lệnh live thoát với: `Refusing live mode: set allowLive: true in config`.

---

## Rủi ro / Risks

- **Độ trễ RSS:** tin có thể đến sau khi giá đã phản ứng; poll interval 90–120s.
- **Lỗi LLM / rate limit:** gateway có giới hạn `maxCallsPerHour`; lỗi → fallback rule hoặc bỏ qua tùy ngữ cảnh.
- **Quá mức exposure:** mỗi vị thế dùng full `positionPercent` (vd. nhiều lệnh 2% → tổng notional có thể vượt ý muốn).
- **Đòn bẩy:** khi `binance.margin.enabled: true`, bot set margin mode và leverage lúc khởi động (testnet/live); đặt `enabled: false` để dùng cấu hình thủ công trên sàn. `positionPercent` vẫn là % notional balance, không phụ thuộc leverage.
- **Circuit breaker:** sau lỗi API lặp lại, chặn lệnh mới — **không** đóng vị thế đang mở.
- **Tắt bot (SIGINT):** log vị thế mở, không auto-close — quản lý thủ công trên Binance.

---

## Tuyên bố pháp lý / Legal disclaimer

Công cụ **giáo dục / thử nghiệm**, không phải tư vấn tài chính. Bạn tự chịu trách nhiệm mọi lệnh và thua lỗ. Không đảm bảo lợi nhuận. Tuân thủ luật và điều khoản Binance tại quốc gia của bạn.

---

## Windows: `better-sqlite3`

Native addon. Nếu `npm install` lỗi biên dịch:

1. Cài [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — workload **Desktop development with C++**.
2. Hoặc dùng Node LTS 20/22 x64 khớp kiến trúc.
3. Chạy terminal **Developer Command Prompt** hoặc đảm bảo `npm config` trỏ đúng Python/node-gyp nếu được nhắc.

Sau khi cài toolchain: `npm rebuild better-sqlite3`.

---

## Kiểm thử / Tests

```bash
npm test
npm run test:coverage   # coverage ≥80% trên src/sentiment + src/risk
npm run lint
```

Checklist MVP: [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

---

## English reference (quick)

- **Stack:** Node 20+, TypeScript, SQLite (`better-sqlite3`), Binance Futures REST, RSS.
- **Safety:** `allowLive` gate for mainnet; start small `positionPercent` on testnet/live.
- **Docs:** Full spec linked at top; acceptance criteria in `docs/ACCEPTANCE.md`.
