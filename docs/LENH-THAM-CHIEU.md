# Tham chiếu lệnh — Crypto News Auto-Trader

Tất cả câu lệnh và ví dụ copy-paste cho dự án. Chạy từ **thư mục gốc repo**.

**Quy ước:**

- Dev: `npm run dev -- <lệnh-cli>`
- Sau build: `npm start -- <lệnh-cli>` hoặc `npx crypto-trader <lệnh-cli>`
- Script npm phụ: `npm run <tên-script> -- <tham-số>` (dấu `--` trước tham số script)

**Config khuyến nghị:**

```bash
export CONFIG_PATH=./config/production.yaml
# Windows PowerShell: $env:CONFIG_PATH="./config/production.yaml"
```

**`.env` mẫu:**

```bash
cp .env.example .env
# BINANCE_API_KEY=...
# BINANCE_API_SECRET=...
# CONFIG_PATH=./config/production.yaml
# SQLITE_PATH=./data/trader.db
# LOG_LEVEL=info
# OPENROUTER_API_KEY=   # chỉ khi sentiment.llm.enabled: true
```

Hướng dẫn Futures (tiếng Việt): [HUONG-DAN-FUTURES.md](./HUONG-DAN-FUTURES.md)

**Kích hoạt chiến lược (`strategy.triggerMode`):**

| Giá trị | Ý nghĩa ngắn |
|---------|----------------|
| `news` | **Mặc định** — RSS + pipeline tin như thiết kế gốc; backtest thường cần `news_signals` trong DB và/hoặc `seed-signals`, hoặc `--mock-sentiment` tùy kịch bản. |
| `technical` | **Không tin** — không poll RSS, không chạy `NewsPipeline`; mỗi lần nến **timeframes.entry** đóng, bot đánh giá **mọi** symbol trong `symbols`, chiều long/short từ EMA context (`strategy.profiles.intraday.contextEma`, cùng logic flat với `EmaTrendContextGate`). Chi tiết: [technical trigger mode](./superpowers/specs/2026-05-25-technical-trigger-mode-design.md). |

**Backtest khi `triggerMode: technical`:** chỉ cần **nến đã prefetch** trong khoảng `--from` / `--to` — **không** bắt buộc `seed-signals` và **không** cần `--mock-sentiment` (nếu vẫn truyền mock, CLI có thể cảnh báo và bỏ qua).

```yaml
strategy:
  triggerMode: technical   # news | technical
  entryProfile: intraday   # khuyến nghị với technical; xem validate warn nếu swing
```

---

## 1. Cài đặt & build

```bash
npm install
cp .env.example .env
```

```bash
npm run build
```

```bash
npm run lint
```

```bash
npm test
npm run test:watch
npm run test:coverage
```

```bash
# Windows: lỗi better-sqlite3 native
npm rebuild better-sqlite3
```

---

## 2. Lệnh CLI chính (`npm run dev -- …`)

### 2.1 `validate` — kiểm tra config

```bash
npm run dev -- validate
npm run dev -- validate --config config/production.yaml
npm run dev -- validate --config config/default.yaml
```

```bash
npm run dev -- validate --dry-poll
npm run dev -- validate --config config/production.yaml --dry-poll
```

| Tham số | Mặc định | Mô tả |
|---------|----------|--------|
| `--config <path>` | `config/default.yaml` | File YAML |
| `--dry-poll` | — | Poll RSS một lần, không cần Binance |

---

### 2.2 `feeds` — trạng thái RSS

```bash
npm run dev -- feeds
npm run dev -- feeds --config config/production.yaml
```

---

### 2.3 `status` — số dư, vị thế, signal

```bash
npm run dev -- status --mode sim
npm run dev -- status --mode testnet --config config/production.yaml
npm run dev -- status --mode live --config config/production.yaml
```

| Tham số | Mặc định | Mô tả |
|---------|----------|--------|
| `--mode <sim\|testnet\|live>` | `sim` | Adapter đọc balance/vị thế |
| `--config <path>` | `config/default.yaml` | Config |

---

### 2.4 `pause` / `resume` — tạm dừng mở lệnh mới

```bash
npm run dev -- pause
npm run dev -- resume
```

Bot vẫn poll tin (trừ khi `strategy.triggerMode: technical` — không RSS); file `data/.paused` chặn lệnh mới.

---

### 2.5 `start` — chạy bot

```bash
npm run dev -- start --mode sim
npm run dev -- start --mode sim --config config/production.yaml
npm run dev -- start --mode sim --symbols BTCUSDT,ETHUSDT
```

```bash
npm run dev -- start --mode testnet --config config/production.yaml
```

```bash
# Cần allowLive: true trong config
npm run dev -- start --mode live --config config/production.yaml
```

| Tham số | Bắt buộc | Mô tả |
|---------|----------|--------|
| `--mode <sim\|testnet\|live>` | Có | Chế độ chạy |
| `--config <path>` | Không | YAML (mặc định `config/default.yaml`) |
| `--symbols <list>` | Không | Ghi đè symbol, vd. `BTCUSDT,ETHUSDT` |

**Ctrl+C:** dừng bot, **không** tự đóng vị thế trên Binance.

---

### 2.6 `backtest` — backtest lịch sử

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 \
  --config config/production.yaml
```

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-12-31 \
  --config config/production.yaml --mock-sentiment
```

```bash
npm run dev -- backtest --from 2025-01-01 --to 2025-01-31 \
  --config config/default.yaml
```

| Tham số | Bắt buộc | Mô tả |
|---------|----------|--------|
| `--from <iso>` | Có | Ngày bắt đầu (ISO) |
| `--to <iso>` | Có | Ngày kết thúc (ISO) |
| `--config <path>` | Không | Config |
| `--mock-sentiment` | Không | Signal long giả mỗi 6h (nghiên cứu; với `strategy.triggerMode: technical` thường bị bỏ qua — xem spec) |

Khi `strategy.triggerMode: news`, backtest cần dữ liệu signal trong DB (ví dụ sau `seed-signals` hoặc từ sim) hoặc `--mock-sentiment`, trừ khi bạn dùng kịch bản khác đã ghi trong [BACKTEST-SAT-LIVE.md](./BACKTEST-SAT-LIVE.md). Khi `triggerMode: technical`, **không** cần seed/mock — đủ kline cache + `prefetch-klines` đúng window.

Báo cáo đầy đủ: `data/reports/.../report.json` (theo `backtest.reportDir` trong config).

---

## 3. Script npm (`npm run …`)

### 3.1 `parity-check` — smoke backtest production

```bash
npm run parity-check
```

Dùng `config/experiments/risk-baseline.yaml`, BTC Oct 2024, ghi JSON tóm tắt.

---

### 3.2 `prefetch-klines` — tải cache nến

```bash
npm run prefetch-klines -- --from 2024-10-01 --to 2024-12-31
npm run prefetch-klines -- --config config/production.yaml --from 2024-10-01 --to 2024-12-31
```

| Tham số | Mặc định |
|---------|----------|
| `--config` | `config/default.yaml` |
| `--from` | `2024-10-01` |
| `--to` | `2024-12-31` |

---

### 3.3 `backtest-matrix` — chạy ma trận thí nghiệm

```bash
npm run backtest-matrix -- --matrix config/experiments/matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/matrix.yaml --dry-run
```

```bash
npm run backtest-matrix -- --matrix config/experiments/phase6-validation-matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/phase7-validation-matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/sentiment-matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/mtf-matrix.yaml
npm run backtest-matrix -- --matrix config/experiments/parity-validation-matrix.yaml
```

| Tham số | Mô tả |
|---------|--------|
| `--matrix <path>` | File matrix YAML (`from`, `to`, `runs`, …) |
| `--dry-run` | Chỉ validate manifest, không chạy backtest |

Kết quả: `data/reports/experiments/<thư-mục>/COMPARISON.md` và từng `.../<run-id>/report.json`.

**Ví dụ matrix tối thiểu** (`config/experiments/matrix.yaml`):

```yaml
from: "2024-10-01"
to: "2024-12-31"
mockSentiment: true
experimentsDir: ./data/reports/experiments
runs:
  - id: baseline-mock
    config: config/experiments/baseline-mock.yaml
```

---

### 3.4 `export-trade-review` — xuất CSV review (khuyến nghị)

**Từ backtest** (bắt buộc `--report` trỏ tới **`report.json`**):

```bash
npm run export-trade-review -- --source backtest \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json \
  --out review.csv --limit 20 --sort worst
```

```bash
npm run export-trade-review -- --source backtest \
  --report data/reports/experiments/phase6-validation/phase6-production/report.json \
  --out phase6-review.csv --limit 15 --sort best
```

**Từ SQLite** (sim / testnet / live sau khi có lệnh đóng):

```bash
npm run export-trade-review -- --source sqlite --limit 50 \
  --out testnet-review.csv --config config/production.yaml
```

| Tham số | Nguồn | Mô tả |
|---------|--------|--------|
| `--source backtest\|sqlite` | Cả hai | Bắt buộc |
| `--report <path>` | backtest | Đường dẫn **`report.json`** |
| `--out <path>` | Cả hai | File CSV đầu ra |
| `--limit <n>` | Cả hai | Số dòng (mặc định backtest: 5, sqlite: 50) |
| `--sort worst\|best` | backtest | Sắp xếp theo PnL |
| `--export-rejects` | backtest | Thêm cột gate reject (nếu report có) |
| `--config` | sqlite | Config để mở DB |

---

### 3.5 `export-backtest-trades` — xuất backtest (trực tiếp)

```bash
npm run export-backtest-trades -- \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json \
  --out trades.csv --limit 10 --sort worst
```

```bash
npm run export-backtest-trades -- \
  --report data/reports/experiments/phase6-validation/phase6-production/report.json \
  --out trades.csv --sort best --export-rejects
```

---

### 3.6 `export-trades-review` — xuất SQLite (trực tiếp)

```bash
npm run export-trades-review -- --limit 50 \
  --out .planning/phases/01-entry-baseline/trades-export.csv \
  --config config/production.yaml
```

---

### 3.7 `analyze-backtest-losses` — thống kê lỗ theo symbol

```bash
npm run analyze-backtest-losses -- \
  --report data/reports/experiments/phase6-validation/phase6-production/report.json
```

```bash
npm run analyze-backtest-losses -- \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json
```

---

### 3.8 `seed-signals` — seed signal từ fixture RSS (nghiên cứu sentiment)

```bash
npm run seed-signals -- --config config/experiments/sentiment-baseline.yaml \
  --db data/reports/experiments/sentiment-phase3/signals.db \
  --from 2024-10-01 --to 2024-12-31 --repeat 30 --no-llm
```

```bash
npm run seed-signals -- --config config/experiments/sentiment-recommended.yaml \
  --db data/reports/experiments/sentiment-phase3/recommended.db \
  --from 2024-10-01 --to 2024-12-31
```

| Tham số | Mặc định |
|---------|----------|
| `--config` | `sentiment-baseline.yaml` |
| `--db` | `data/reports/.../signals.db` |
| `--from` / `--to` | `2024-10-01` / `2024-12-31` |
| `--repeat` | `30` |
| `--no-llm` | — |
| `--discards` | path file tùy chọn |

---

### 3.9 `export-signals-review` — CSV signal đã seed

```bash
npm run export-signals-review -- \
  --db data/reports/experiments/sentiment-phase3/sentiment-baseline-signals.db \
  --out signals-export.csv
```

---

## 4. Quy trình vận hành (copy theo thứ tự)

### 4.1 Lần đầu setup

```bash
npm install
cp .env.example .env
npm run dev -- validate --config config/production.yaml
```

### 4.2 Sim

```bash
npm run dev -- start --mode sim --config config/production.yaml
# Terminal khác:
npm run dev -- status --mode sim --config config/production.yaml
npm run dev -- pause
npm run dev -- resume
```

### 4.3 Backtest gần live nhất (không mock)

Xem chi tiết: [BACKTEST-SAT-LIVE.md](./BACKTEST-SAT-LIVE.md).

```bash
npm run prefetch-klines -- --config config/production.yaml --from 2024-10-01 --to 2024-12-31
npm run seed-signals -- --config config/production.yaml --db data/trader.db \
  --from 2024-10-01 --to 2024-11-01 --repeat 1 --no-llm
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 --config config/production.yaml
```

Hoặc matrix một lệnh:

```bash
npm run backtest-matrix -- --matrix config/experiments/backtest-realistic-matrix.yaml
```

### 4.4 Backtest + review

```bash
npm run prefetch-klines -- --config config/production.yaml --from 2024-10-01 --to 2024-12-31
npm run parity-check
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 --config config/production.yaml
npm run export-trade-review -- --source backtest \
  --report data/reports/<thư-mục-chạy>/report.json \
  --out danh-gia.csv --limit 20 --sort worst
```

### 4.5 Ma trận thí nghiệm

```bash
npm run backtest-matrix -- --matrix config/experiments/phase7-validation-matrix.yaml
npm run export-backtest-trades -- \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json \
  --out phase7-worst.csv --sort worst
npm run analyze-backtest-losses -- \
  --report data/reports/experiments/phase7-validation/risk-baseline/report.json
```

### 4.6 Testnet

```bash
# .env: key TESTNET
npm run dev -- start --mode testnet --config config/production.yaml
npm run dev -- status --mode testnet --config config/production.yaml
npm run export-trade-review -- --source sqlite --limit 50 --out testnet-review.csv \
  --config config/production.yaml
```

### 4.7 Live (sau checklist)

```bash
# config: allowLive: true
# .env: key MAINNET
npm run dev -- start --mode live --config config/production.yaml
npm run dev -- status --mode live --config config/production.yaml
```

Checklist: [KIEM-TRA-LIVE.md](./KIEM-TRA-LIVE.md) · [LIVE-SAFETY-CHECKLIST.md](./LIVE-SAFETY-CHECKLIST.md)

---

## 5. Kiểm thử tích hợp (dev)

```bash
npm run lint
npm test
npm test -- tests/integration/backtest-smoke.test.ts
npm test -- tests/integration/mode-parity-replay.test.ts tests/integration/testnet-stack-smoke.test.ts
```

---

## 6. File config thường dùng

| File | Mục đích |
|------|----------|
| `config/production.yaml` | Vận hành / testnet (khuyến nghị) |
| `config/default.yaml` | Dev, có comment win-rate |
| `config/experiments/risk-baseline.yaml` | Parity-check, Phase 7 baseline |
| `config/experiments/phase6-production.yaml` | Bản sao preset Phase 6 |
| `config/experiments/matrix.yaml` | Matrix mẫu |
| `config/experiments/phase6-validation-matrix.yaml` | Validate Phase 6 |
| `config/experiments/phase7-validation-matrix.yaml` | Validate Phase 7 |
| `config/experiments/review-capture-gates.yaml` | Backtest + `captureRejects` |

---

## 7. Lỗi lệnh thường gặp

| Lỗi | Cách xử lý |
|-----|------------|
| `Refusing live mode` | Đặt `allowLive: true` sau checklist |
| ENOENT khi export | Dùng đúng `.../report.json` |
| Thiếu `--` trước tham số script | `npm run export-trade-review -- --source sqlite` |
| Key testnet trên live | Đổi key trong `.env` theo mode |
| Backtest 0 lệnh | Prefetch klines; kiểm tra window + config gates |

---

## 8. Bảng tóm tắt nhanh

| Việc cần làm | Lệnh |
|--------------|------|
| Kiểm tra config | `npm run dev -- validate --config config/production.yaml` |
| Chạy mô phỏng | `npm run dev -- start --mode sim --config config/production.yaml` |
| Chạy testnet | `npm run dev -- start --mode testnet --config config/production.yaml` |
| Backtest | `npm run dev -- backtest --from … --to … --config config/production.yaml` |
| Smoke metrics | `npm run parity-check` |
| So sánh preset | `npm run backtest-matrix -- --matrix <file.yaml>` |
| Xuất review | `npm run export-trade-review -- --source …` |
| Tải nến | `npm run prefetch-klines -- --from … --to …` |
| Tạm dừng lệnh mới | `npm run dev -- pause` |

---

## Strategy optimize loop

1. Edit periods/targets: `config/optimize-periods.yaml`
2. Seed first candidate: copy `config/production.yaml` → `config/optimize/candidate-001.yaml`
3. Prefetch klines (một khoảng bao trùm **tất cả** `periods` trong manifest):

```bash
npm run prefetch-klines -- --config config/optimize/candidate-001.yaml --from 2024-10-01 --to 2025-12-31
```

4. Run batch:

```bash
npm run optimize-batch -- --manifest config/optimize-periods.yaml \
  --config config/optimize/candidate-001.yaml \
  --candidate-id candidate-001 --iteration 1
```

5. Chẩn đoán sau mỗi batch (hoặc gộp trong batch):

```bash
npm run optimize-diagnose -- --manifest config/optimize-periods.yaml --candidate-id candidate-001

# hoặc
npm run optimize-batch -- --manifest config/optimize-periods.yaml \
  --config config/optimize/candidate-001.yaml \
  --candidate-id candidate-001 --iteration 1 --diagnose
```

| Tham số `optimize-diagnose` | Mô tả |
|-----------------------------|--------|
| `--manifest` | `config/optimize-periods.yaml` (mặc định) |
| `--candidate-id` | Đọc `reportPaths` từ `leaderboard.json` |
| `--report` | Lặp lại; đường dẫn report từng period |
| `--config` | Config ứng viên (symbol list cho klines check) |

Stdout là JSON: `klinesOk`, `weakestPeriod`, `gateRejectTop`, `suggestedMutations`, `plateau`, v.v. Chỉ tin `winRate`/PnL khi `klinesOk: true`.

6. Agent: `@optimize-strategy` (v2: preflight, tier CONFIG/CODE/MANIFEST)
7. Promote: `npm run optimize-finalize -- --manifest config/optimize-periods.yaml`

Artifacts: `data/optimize/leaderboard.json`, `data/optimize/run-log.jsonl`

**Windows:** Nếu `npm run … --` không chuyển tham số đúng, dùng `npx tsx` trực tiếp:

```bash
npx tsx scripts/optimize-batch.ts --manifest config/optimize-periods.yaml --config config/optimize/candidate-001.yaml --candidate-id candidate-001 --iteration 1
npx tsx scripts/optimize-diagnose.ts --manifest config/optimize-periods.yaml --candidate-id candidate-001
npx tsx scripts/optimize-finalize.ts --manifest config/optimize-periods.yaml
```

---

*Cập nhật: 2026-05-29 — thêm `optimize-diagnose`, prefetch trong optimize loop.*
