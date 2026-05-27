# Backtest quá khứ — gần live nhất (trong repo hiện tại)

Backtest **không thể** giống 100% testnet/live (khớp lệnh sàn, RSS đúng từng ngày 2024, filter REST). Dưới đây là cách **tối đa** trong codebase hôm nay.

## So sánh nhanh

| Cách | Signal tin | Nến | Pipeline rule/gate | Giống live |
|------|------------|-----|-------------------|------------|
| `--mock-sentiment` | Giả 6h | Thật (tải Binance) | Có | Thấp |
| `seed-signals` fixture | Rule giống live, tin **XML test** | Thật | Có | **Trung bình** |
| Sim vài ngày → backtest cùng window | **RSS thật**, timestamp thật | Thật | Có | **Cao nhất** (chỉ window bạn đã chạy sim) |
| **`strategy.triggerMode: technical`** | **Không** (không đọc `news_signals`) | Thật (bắt buộc prefetch) | Entry gate / intraday như config | **Khác hẳn** news-realistic — đo hiệu năng chiến lược kỹ thuật, không tái hiện “cùng một edge tin” |
| Testnet | RSS thật | Live | Có | Cao (không phải backtest) |

### News-realistic vs technical

- **News-realistic** (Cách A/B ở dưới): bạn tái phát **chuỗi thời gian tin** (fixture/seed hoặc DB từ sim) + nến thật → gần với bot **dựa sentiment RSS**.
- **Technical** (`triggerMode: technical`): backtest **không** nạp signal từ DB; replay chỉ đẩy `market:candleClose`; chiến lược quét symbol theo **EMA context**. Không so sánh PnL trực tiếp với backtest có tin — mục tiêu vận hành khác.
- Chuẩn bị technical: `prefetch-klines` đủ window, trong YAML `strategy.triggerMode: technical` + `entryProfile: intraday` (khuyến nghị). Chi tiết: [2026-05-25-technical-trigger-mode-design.md](./superpowers/specs/2026-05-25-technical-trigger-mode-design.md).

---

## Cách A — Khuyến nghị: nến thật + signal qua rule (không mock)

### 1. Config production

```bash
# .env
CONFIG_PATH=./config/production.yaml
SQLITE_PATH=./data/trader.db
```

### 2. Tải nến lịch sử (mainnet public API)

```bash
npm run prefetch-klines -- --config config/production.yaml \
  --from 2024-10-01 --to 2024-12-31
```

### 3. Seed signal — **không** mock, **repeat thấp** (giống thật hơn repeat 30)

```bash
npm run seed-signals -- --config config/production.yaml \
  --db data/trader.db --from 2024-10-01 --to 2024-11-01 \
  --repeat 1 --no-llm
```

- `--no-llm`: khớp production (`llm.enabled: false`).
- `--repeat 1`: không nhân bản cùng tin 30 lần (repeat 30 = mật độ signal **ảo**, không giống live).

### 4. Backtest — **không** thêm `--mock-sentiment`

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 \
  --config config/production.yaml
```

### 5. Xem từng entry / win / loss

```bash
# File mới trong data/reports/backtest-<timestamp>.json
ls -t data/reports/backtest-*.json | head -1

npm run export-trade-review -- --source backtest \
  --report data/reports/backtest-XXXXX.json \
  --out backtest-review.csv --limit 50 --sort worst
```

### 6. Một lệnh (matrix có sẵn)

```bash
npm run prefetch-klines -- --config config/production.yaml --from 2024-10-01 --to 2024-12-31
npm run backtest-matrix -- --matrix config/experiments/backtest-realistic-matrix.yaml
```

Kết quả: `data/reports/experiments/backtest-realistic/production/report.json`

---

## Cách B — Gần live nhất: sim thật rồi backtest đúng khoảng ngày đó

Khi bot **đã chạy sim** với RSS thật, `news_signals` trong `data/trader.db` có timestamp thật.

1. **Sao lưu DB** trước seed (seed xóa file):

   ```bash
   cp data/trader.db data/trader-sim-backup.db
   ```

2. Chạy sim ít nhất vài ngày:

   ```bash
   npm run dev -- start --mode sim --config config/production.yaml
   ```

3. Backtest **cùng window** có signal (vd. 7 ngày vừa chạy):

   ```bash
   npm run dev -- backtest --from 2025-05-20 --to 2025-05-27 \
     --config config/production.yaml
   ```

   Đổi ngày theo dữ liệu thực trong DB.

4. Kiểm tra có signal:

   ```bash
   npm run dev -- status --mode sim --config config/production.yaml
   ```

**Lưu ý:** Không backfill được tháng 10/2024 nếu sim không chạy lúc đó.

---

## Vẫn khác live ở đâu (đừng kỳ vọng trùng %)

| Thành phần | Backtest | Live / testnet |
|------------|----------|----------------|
| Tin RSS | Fixture hoặc DB sim | Poll CoinDesk/CoinTelegraph thật |
| Khớp lệnh | `SimBroker` + `fillModel: conservative` | Order book sàn |
| Filter size | `getDefaultFilters` (tĩnh) | `exchangeInfo` REST |
| Thời gian | Replay theo nến đóng | Đồng hồ thật + trễ poll 90–120s |

Chi tiết: `.planning/phases/09-mode-parity-validation/MODE-PARITY.md`

---

## Không dùng nếu muốn “giống thật”

- `--mock-sentiment`
- So sánh win rate mock với run seed/fixture
- `seed-signals` với `--repeat 30` rồi coi là mật độ tin thật
- Chỉ nhìn JSON tóm tắt trên terminal (không mở `report.json` / CSV)

---

## Tóm tắt

**Backtest quá khứ giống thật nhất hôm nay:**

`prefetch-klines` + `production.yaml` + `seed-signals --repeat 1 --no-llm` + `backtest` **không mock** + export CSV.

**Giống thật hơn nữa (không chọn ngày tùy ý):** chạy **sim** thu RSS thật → backtest đúng window đó.

**Backtest thuần kỹ thuật (không tin):** `strategy.triggerMode: technical` — chỉ cần kline, **không** seed/mock; không thay thế “sat live” theo nghĩa tin RSS.

**Giống live tuyệt đối:** **testnet**, không phải backtest.
