# Quạt hướng trục Ø500 – mô hình Three.js tham số, xuất STL cho SimScale

![preview](docs/preview.png)

Mô hình 3D tham số của quạt hướng trục lắp bích (vỏ ống + 2 mặt bích có lỗ bulông, motor rotor ngoài, 5 cánh dạng lưỡi liềm, 4 thanh giằng, hộp điện).

- **Dựng hình:** [manifold-3d](https://github.com/elalish/manifold). Mọi khối xuất ra đều kín nước (watertight), đóng, pháp tuyến hướng ra ngoài và không tự cắt. Đây là điều kiện để SimScale chia lưới được.
- **Xem và chỉnh:** Three.js (`index.html`). Sửa thông số trong bảng điều khiển thì hình dựng lại ngay, và có thể xuất STL trực tiếp từ trình duyệt.
- **Xuất hàng loạt:** `npm run export` dựng hình, kiểm tra và ghi file vào `export/`.

> Kích thước mặc định là ước lượng theo ảnh của một quạt Ø500 điển hình, **không phải số đo của sản phẩm cụ thể**. Nếu có datasheet, hãy nhập lại các thông số ở phần [Thông số](#thông-số).

## File có sẵn trong `export/` (đơn vị **mm**)

| File | Nội dung | Dùng khi |
|---|---|---|
| **`simscale_mrf_mm.stl`** | 2 khối **không khí**, mỗi khối là một `solid` kín: `flow_region` (ống hút → quạt → ống đẩy) và trụ vùng quay `rotating_zone` chồng lên nó | **Khuyên dùng** cho MRF. Đây là cách bố trí SimScale hướng dẫn |
| `simscale_mrf_conformal_mm.stl` | 2 khối không khí tiếp giáp, không chồng nhau: `flow_static` + `flow_rotating` | Dự phòng nếu file trên không chia lưới được |
| `fan_assembly.stl` | Cả quạt là 1 khối rắn (rotor nối stator qua trục) | Mô phỏng nhanh không quay, xem cản dòng |
| `fan_rotor.stl` / `fan_stator.stl` / `fan_mrf_zone.stl` | Từng chi tiết, binary STL | Dùng trong phần mềm CAD/CFD khác |
| `report.json` | Kết quả kiểm tra: kín nước, thể tích, genus, bbox, khe hở | Đối chiếu |
| `m/simscale_mrf_m.stl` | Như file khuyên dùng nhưng đơn vị **mét** | Khi SimScale không cho chọn đơn vị lúc upload |

**Hệ trục:** trục quay là **Z** đi qua gốc (0,0,0), mặt phẳng giữa cánh nằm ở z = 0. Khi **ω > 0 quanh +Z** (quy tắc bàn tay phải), gió thổi về **+Z**: phía hút ở −Z, phía đẩy ở +Z.

### File `simscale_mrf_mm.stl`

SimScale import **mỗi khối `solid <tên>` trong file STL thành một part riêng**. Vì vậy mỗi khối trong file này là một khối kín (volume):

| Khối | Là gì |
|---|---|
| `flow_region` | ống Ø500 (z từ −1500 đến +3000) trừ đi motor, thanh giằng và rotor |
| `rotating_zone` | trụ R = 247.5 mm, z ∈ [−70, 42.5] mm |

Các mặt biên (đầu hút, đầu đẩy, thành ống, cánh…) do **Facet split** của SimScale tự tách khi import. Mặt trụ của vùng quay nằm giữa khe hở đầu cánh (cánh R = 245, thành ống R = 250). Mặt sau của nó nằm giữa khe rotor–stator (40 → 45 mm).

`npm run export` đọc lại chính các file vừa ghi và kiểm tra **từng khối `solid` đều kín**.

Miền tính mặc định là **ống gió** (`--mode ducted`), đúng cách lắp của quạt có bích, nên dựng được cả đường đặc tính. Muốn mô phỏng quạt thổi ra không gian rộng thì dùng `--mode free`. Chế độ này chỉ đúng khi Δp = 0.

## Mô phỏng trên SimScale

👉 **Xem hướng dẫn từng bước: [`docs/SIMSCALE.md`](docs/SIMSCALE.md)**. Hướng dẫn đi từ upload, thiết lập MRF, điều kiện biên, chia lưới, chạy, đến tính Q, Δp, P, η và dựng đường đặc tính.

## Chạy

```bash
npm install
npm run export            # → export/  (mm)
npm run export:m          # → export/m (mét)
node scripts/export.mjs --bladeCount 7 --sweepDeg 0 --domainRadius 1200   # đổi thông số bất kỳ
npm run serve             # rồi mở http://localhost:3000 để xem Three.js
```

Trang xem tải `three`, `lil-gui` và `manifold-3d` từ CDN jsDelivr, nên cần có mạng và cần mở qua HTTP server (không mở trực tiếp file://). Bảng điều khiển gồm:

- Chỉnh thông số vỏ, cánh, motor và độ mịn lưới.
- Bật/tắt vỏ, rotor, vùng MRF; xem mặt cắt Y = 0, lưới tam giác, quay rotor.
- Xuất gói SimScale, từng chi tiết và JSON thông số (đơn vị mm hoặc m).

Góc dưới trái hiển thị kết quả kiểm tra kín nước và giao cắt rotor–stator.

`npm run export` sẽ **thoát với mã lỗi** nếu có bất kỳ kiểm tra nào trượt:

- Từng khối là manifold hợp lệ.
- File STL đọc lại vẫn kín nước sau khi gộp đỉnh theo toạ độ.
- Rotor và stator không giao nhau.
- Rotor nằm trọn trong vùng MRF, và vùng MRF không chạm stator.
- Mỗi vùng lưu chất là đúng 1 khối liên thông.
- `mrf_interface` trùng khớp giữa hai vùng.

## Thông số

Tất cả nằm trong `DEFAULTS` (`src/fan.js`) và `DOMAIN_DEFAULTS` (`src/simscale.js`), đơn vị mm và độ.

| Nhóm | Thông số mặc định |
|---|---|
| Vỏ | Ø trong 500, dày 2, dài 180; bích Ø600 dày 3; 8 lỗ Ø10 trên vòng Ø560; có hộp điện |
| Rotor | 5 cánh, khe hở đầu cánh 5; bầu Ø144 dài 90; dây cung 95 → 185; góc đặt 40° → 20°; vuốt −15°; dày 3 (mỏng dần 30% ra đầu cánh); độ cong 5% |
| Stator | motor sau Ø110 dài 40, khe rotor–stator 5; 4 thanh giằng Ø12 |
| Miền tính | R = 900, phía hút 1500, phía đẩy 3000 |
| Lưới | 160 đoạn/vòng tròn; mỗi cánh 48 × 48 đoạn (dày hơn ở mép và đầu cánh) |

Mỗi tiết diện cánh là một tấm cong (camber dạng parabol, mép tròn tù), được **cuộn lên mặt trụ r = const**. Nhờ vậy đầu cánh là một mặt trụ đúng và khe hở đầu cánh đều trên toàn bộ dây cung.

## Cấu trúc

```
src/fan.js        dựng hình tham số (manifold-3d)
src/simscale.js   các khối không khí cho SimScale
src/stl.js        ghi/đọc STL binary/ASCII nhiều solid, kiểm tra kín nước
src/viewer.js     trang xem Three.js
scripts/export.mjs  xuất + kiểm tra hàng loạt
```
