# Hướng dẫn sử dụng Binance USDⓈ-M Futures với Crypto News Auto-Trader

Tài liệu này mô tả **cách dùng đúng** sản phẩm Futures (hợp đồng vĩnh viễn USDT) trên Binance cùng bot CLI trong repo. Đọc kỹ trước khi chạy `testnet` hoặc `live`.

**Tất cả lệnh + ví dụ copy-paste:** [LENH-THAM-CHIEU.md](./LENH-THAM-CHIEU.md)

**Không phải tư vấn tài chính.** Bạn tự chịu trách nhiệm mọi lệnh, thua lỗ và tuân thủ pháp luật tại quốc gia của mình.

---

## 1. Bot giao dịch loại Futures nào?

| Khái niệm | Bot hỗ trợ |
|-----------|------------|
| Sàn | **Binance USDⓈ-M Futures** (USDT-M, perpetual) |
| Ký hiệu | `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `BNBUSDT`, `XRPUSDT` (whitelist trong config) |
| Spot / Coin-M | **Không** hỗ trợ |
| Đòn bẩy | Có — bot có thể **đặt margin mode + leverage** lúc kết nối (testnet/live) |

Ba chế độ chạy:

| Mode | Tiền thật? | API key | Mục đích |
|------|------------|---------|----------|
| `sim` | Không | Không bắt buộc | Mô phỏng lệnh, kline public |
| `testnet` | Không (tiền ảo testnet) | Key **Futures Testnet** | Lệnh thật trên môi trường test |
| `live` | **Có** | Key **Futures Mainnet** | Tiền USDT thật trên tài khoản Futures |

**Thứ tự bắt buộc:** `sim` → `testnet` (ít nhất ~1 tuần + xem lại lệnh) → `live` (chỉ sau checklist).

---

## 2. Chuẩn bị tài khoản Binance Futures

### 2.1 Tài khoản & ví

1. Đăng ký Binance và **bật Futures** (USDⓈ-M).
2. Chuyển USDT từ Spot sang ví **Futures** (nếu chạy live).
3. Với **testnet:** đăng ký tại [testnet.binancefuture.com](https://testnet.binancefuture.com) — tài khoản **tách biệt** mainnet, có USDT ảo.

### 2.2 API key — tách testnet và mainnet

| Môi trường | Nơi tạo key | Ghi vào `.env` khi |
|------------|-------------|-------------------|
| Testnet | API Management trên **testnet** | `start --mode testnet` |
| Live | API Management trên **mainnet** | `start --mode live` |

**Quyền key nên có:** đọc + giao dịch Futures (theo nhu cầu bot).  
**Khuyến nghị mạnh:** **tắt quyền rút tiền (Withdraw)** trên key live; bật **IP whitelist** nếu máy chạy bot có IP cố định.

```bash
# .env — không commit file này
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
CONFIG_PATH=./config/production.yaml
SQLITE_PATH=./data/trader.db
LOG_LEVEL=info
```

### 2.3 Không nhầm Spot và Futures

- Bot gọi API `fapi` (Futures), không phải Spot.
- Key Spot **không** dùng được cho `testnet`/`live` của bot.
- Symbol phải đúng dạng perpetual: `BTCUSDT`, không phải `BTC/USDT` spot.

---

## 3. Hiểu margin, đòn bẩy và khối lượng lệnh

### 3.1 Isolated vs Cross (trên Binance)

| Chế độ | Ý nghĩa ngắn |
|--------|----------------|
| **Isolated** (mặc định bot) | Thua lỗ tối đa gần với margin của **từng cặp**; ít lan sang symbol khác |
| **Cross** | Dùng chung margin ví Futures; rủi ro lan toàn tài khoản |

Config mặc định (`config/production.yaml`):

```yaml
binance:
  margin:
    enabled: true    # false = bot KHÔNG đổi margin/leverage; bạn set tay trên UI
    mode: isolated
    leverage: 5
```

Khi `enabled: true`, lúc bot **connect** (testnet/live) nó gọi API đặt margin type và leverage **cho từng symbol** trong `symbols`.

### 3.2 `risk.positionPercent` — bot tính size thế nào?

Bot **không** nhập số coin tay. Nó tính **notional** (giá trị danh nghĩa lệnh USDT):

```
notional ≈ số dư khả dụng × (positionPercent / 100)
số lượng coin = notional / giá vào lệnh (làm tròn theo stepSize sàn)
```

Ví dụ: balance khả dụng 10.000 USDT, `positionPercent: 15` → notional ~1.500 USDT mỗi lệnh (trước khi áp `maxNotionalUsdt` nếu có).

**Lưu ý quan trọng:**

- `positionPercent` là % **balance**, không phải % margin sau đòn bẩy.
- Đòn bẩy 5× làm **margin ký quỹ** nhỏ hơn notional, nhưng **biến động PnL** vẫn tính trên notional — rủi ro thanh lý tăng khi leverage cao.
- Nhiều symbol có thể mở lệnh song song (tối đa một vị thế/symbol nếu `onePositionPerSymbol: true`) → tổng exposure có thể **lớn hơn** một lần 15%.

**Khi thử testnet lần đầu**, nên hạ size:

```yaml
risk:
  positionPercent: 0.5   # hoặc 1–2, tùy vốn testnet
```

### 3.3 Stop loss / Take profit

Bot đặt SL/TP theo **ATR** (mặc định SL = 2×ATR, TP = 3×ATR từ giá vào). Kiểm tra trên UI Futures testnet/live sau lệnh mở.

Chiến lược Fib/Elliott (khung **1d** context, **4h** entry) quyết định **có vào lệnh hay không**; risk engine quyết định **size và SL/TP**.

---

## 4. Cài đặt và kiểm tra config

```bash
npm install
cp .env.example .env
# Sửa .env: key + CONFIG_PATH=./config/production.yaml
```

```bash
npm run dev -- validate --config config/production.yaml
```

Nếu báo lỗi schema/YAML → sửa config trước khi `start`.

**File khuyến nghị vận hành:** `config/production.yaml`  
- Cùng preset nghiên cứu Phases 3–7 (sentiment rule-only, fib 0.02, 5 coin, EntryGate bật).  
- `allowLive: false` — **chặn live** cho đến khi bạn chủ động bật sau checklist.

---

## 5. Quy trình từng bước

### Bước 1 — Mô phỏng (`sim`)

Không cần API key. Lệnh ảo, phí/slippage theo `sim.*` trong config.

```bash
npm run dev -- start --mode sim
```

Theo dõi log; thử `pause` / `resume`:

```bash
npm run dev -- pause    # không mở lệnh mới, vẫn poll tin
npm run dev -- resume
npm run dev -- status --mode sim
```

### Bước 2 — Backtest (kiểm tra logic trên dữ liệu quá khứ)

```bash
npm run dev -- backtest --from 2024-10-01 --to 2024-11-01 \
  --config config/production.yaml
```

Hoặc smoke nhanh:

```bash
npm run parity-check
```

Báo cáo nằm dưới `data/reports/`. Export lệnh để xem tay:

```bash
npm run export-trade-review -- --source backtest \
  --report data/reports/.../report.json \
  --out danh-gia-backtest.csv --limit 20 --sort worst
```

> Luôn dùng đường dẫn **`report.json`**, không bỏ đuôi `.json`.

### Bước 3 — Testnet (lệnh thật trên môi trường test)

1. Tạo API key trên **testnet.binancefuture.com**.
2. Ghi key testnet vào `.env` (không dùng key mainnet).
3. Hạ `positionPercent` nếu cần.
4. Chạy:

```bash
npm run dev -- start --mode testnet
```

5. Mở UI Futures **testnet** → tab Positions / Open Orders → xác nhận:
   - Margin **Isolated** (nếu config bật `margin.enabled`)
   - Leverage đúng (vd. 5×)
   - SL/TP hiển thị đúng

6. Chạy ít nhất **~1 tuần**, mỗi tuần export SQLite:

```bash
npm run export-trade-review -- --source sqlite --limit 50 --out testnet-review.csv
```

Đánh giá thủ công theo `.planning/phases/08-trade-review-workflow/TRADE-REVIEW-CHECKLIST.md`.

### Bước 4 — Live (mainnet, tiền thật)

**Chỉ khi** đã hoàn thành checklist tiếng Anh [LIVE-SAFETY-CHECKLIST.md](./LIVE-SAFETY-CHECKLIST.md) (hoặc bản tóm tắt mục 8 bên dưới).

1. Trong config dùng cho live: `allowLive: true` (cố ý, có ghi chú ngày/người duyệt).
2. Key **mainnet** Futures trong `.env`.
3. Vốn Futures đủ; hiểu rủi ro thanh lý.

```bash
npm run dev -- start --mode live
```

Nếu `allowLive: false`, bot **từ chối** với: `Refusing live mode: set allowLive: true in config`.

---

## 6. Lệnh CLI thường dùng

Xem bảng đầy đủ và ví dụ từng lệnh trong **[LENH-THAM-CHIEU.md](./LENH-THAM-CHIEU.md)** (CLI + `npm run` + quy trình sim → live).

---

## 7. Hành vi bot bạn phải nhớ khi trade Futures

### 7.1 Dừng bot (Ctrl+C)

- Bot dừng **graceful**, ghi log vị thế đang mở.
- **Không** tự đóng hết vị thế trên Binance → vào UI Futures **đóng tay** nếu cần.

### 7.2 Circuit breaker

Sau nhiều lỗi API liên tiếp (`binance.circuitBreaker`), bot **ngừng gửi lệnh mới**; vị thế cũ **vẫn trên sàn**.

### 7.3 Tin RSS chậm

Poll 90–120 giây → tín hiệu có thể **trễ** so với giá. Đây là hạn chế thiết kế, không phải lỗi Futures API.

### 7.4 Một vị thế mỗi symbol

`strategy.onePositionPerSymbol: true` — không stack nhiều lệnh cùng symbol cho đến khi đóng.

### 7.5 EntryGate

`entryGates.enabled: true` — lọc setup MTF yếu trước risk. Tắt gate = nhiều lệnh hơn, không chắc chất lượng hơn.

---

## 8. Checklist trước Live (tóm tắt tiếng Việt)

Đối chiếu đầy đủ: [LIVE-SAFETY-CHECKLIST.md](./LIVE-SAFETY-CHECKLIST.md).

- [ ] Dùng `config/production.yaml`, `validate` OK
- [ ] Đã backtest / `parity-check` với config sắp chạy
- [ ] Testnet ≥ 1 tuần, đã xem lệnh trên UI testnet
- [ ] Export CSV review, đánh giá win rate / lỗi thủ công
- [ ] Key mainnet, **tắt rút tiền** trên key
- [ ] Hiểu `positionPercent`, leverage, isolated/cross
- [ ] Biết `pause` và đóng vị thế tay trên Binance
- [ ] Chỉ sau đó: `allowLive: true` + `start --mode live`

---

## 9. Cấu hình hay chỉnh

| Mục đích | Gợi ý |
|----------|--------|
| Giảm rủi ro size | `risk.positionPercent` nhỏ (0.5–2 trên testnet) |
| Giảm đòn bẩy | `binance.margin.leverage: 3` hoặc theo symbol trong `symbolOverrides` |
| Không cho bot đổi margin UI | `binance.margin.enabled: false` |
| Tạm ngừng sau lỗ liên tiếp | `risk.cooldownAfterLoss.enabled: true` (thử nghiệm Phase 7) |
| Chỉ BTC/ETH | Thu `symbols` trong YAML |
| Bật LLM sentiment | `sentiment.llm.enabled: true` + `OPENROUTER_API_KEY` — chỉ sau khi đã so sánh backtest |

Timeframe production: **context 1d**, **entry 4h** (`timeframes` trong config).

---

## 10. Lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
|-------------|------------------------|
| `Refusing live mode` | `allowLive: false` — đúng mặc định an toàn |
| `-2015` / signature / key | Sai key hoặc nhầm testnet vs mainnet |
| Không có lệnh | Gate/strategy từ chối; tin không map symbol; `pause`; circuit breaker |
| `quantity_too_small` | Balance thấp hoặc `positionPercent` / `minNotionalUsdt` |
| SL/TP không khớp UI | Làm tròn `tickSize`; kiểm tra order type trên sàn |
| Export backtest lỗi ENOENT | Thiếu `report.json` trong đường dẫn `--report` |

---

## 11. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| [LENH-THAM-CHIEU.md](./LENH-THAM-CHIEU.md) | **Tất cả lệnh + ví dụ** |
| [README.md](../README.md) | Tổng quan dự án (song ngữ) |
| [LIVE-SAFETY-CHECKLIST.md](./LIVE-SAFETY-CHECKLIST.md) | Checklist live (English) |
| `config/production.yaml` | Profile vận hành khuyến nghị |
| `.planning/phases/09-mode-parity-validation/MODE-PARITY.md` | Khác biệt sim / backtest / testnet |
| `.planning/phases/08-trade-review-workflow/REVIEW-PROCESS.md` | Quy trình review lệnh |

---

*Cập nhật: 2026-05-25 — khớp Phase 10 rollout (`production.yaml`, `allowLive: false` mặc định).*
