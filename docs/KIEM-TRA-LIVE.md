# Checklist an toàn trước khi giao dịch Live (Mainnet Futures)

Hoàn thành **tất cả** mục trước `npm run dev -- start --mode live`. Bản đầy đủ (English): [LIVE-SAFETY-CHECKLIST.md](./LIVE-SAFETY-CHECKLIST.md).

Hướng dẫn tổng thể: [HUONG-DAN-FUTURES.md](./HUONG-DAN-FUTURES.md). Lệnh copy-paste: [LENH-THAM-CHIEU.md](./LENH-THAM-CHIEU.md).

---

## 1. Config

- [ ] `CONFIG_PATH=./config/production.yaml`
- [ ] `npm run dev -- validate --config config/production.yaml` thành công
- [ ] Đã đọc các mục win-rate: `sentiment.llm`, `zoneTolerancePercent`, `entryGates`, `cooldownAfterLoss`
- [ ] Chỉ khi sẵn sàng live: đặt `allowLive: true` trong đúng file config sẽ dùng

## 2. API & sàn

- [ ] API key **mainnet Futures** (không phải testnet)
- [ ] Tắt quyền **rút tiền** trên key
- [ ] IP whitelist (nếu dùng)
- [ ] `binance.margin`: `mode` + `leverage` khớp kế hoạch rủi ro
- [ ] Hiểu `risk.positionPercent` = % balance → notional mỗi lệnh

## 3. Đã kiểm chứng trước live

- [ ] Backtest / `npm run parity-check` với config sắp chạy
- [ ] Đã chạy `sim` và quan sát log ổn định
- [ ] Testnet ≥ 1 tuần, lệnh thấy trên UI testnet
- [ ] `npm run export-trade-review -- --source sqlite --limit 50 --out review.csv`
- [ ] Review thủ công theo checklist Phase 8
- [ ] Đã đọc `MODE-PARITY.md` (khác biệt sim/backtest/testnet)

## 4. Vận hành

- [ ] Biết `pause` / `resume`
- [ ] Biết Ctrl+C **không** đóng vị thế — đóng tay trên Binance Futures
- [ ] Hiểu circuit breaker (chặn lệnh mới, không đóng vị thế cũ)
- [ ] Biết `feeds` và `status --mode live`

## 5. Sau khi live

| Tần suất | Việc làm |
|----------|----------|
| Hàng ngày (2 tuần đầu) | `status`, kiểm tra vị thế trên UI, xem log lỗi feed |
| Hàng tuần | Export CSV, đánh giá win rate / loại lỗi |
| Sau đổi config | Backtest lại + parity-check trước khi chạy tiếp |
| Chuỗi thua | Cân nhắc `cooldownAfterLoss` |

## 6. Rollback khẩn

- [ ] `npm run dev -- pause` ngay khi hành vi bất thường
- [ ] Đóng vị thế thủ công trên Binance nếu cần
- [ ] `allowLive: false` và phân tích nguyên nhân trước khi bật lại

## Ký duyệt

| Vai trò | Họ tên | Ngày | Ghi chú |
|---------|--------|------|---------|
| Vận hành | | | Đã testnet đủ thời gian |
| Review | | | Đã xem CSV mẫu |

**Mặc định:** `allowLive: false` cho đến khi bảng trên được điền có chủ đích.
