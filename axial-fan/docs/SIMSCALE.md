# Hướng dẫn mô phỏng quạt trên SimScale – từng bước

Mục tiêu: tính **lưu lượng Q**, **độ tăng áp Δp**, **mô-men/công suất trục** và **hiệu suất** của quạt ở 1400 vòng/phút, dùng phương pháp MRF (Multiple Reference Frame, hệ quy chiếu quay). Sau đó dựng **đường đặc tính quạt**.

> Tên nút/menu trên SimScale có thể khác đôi chút giữa các phiên bản giao diện. Các giá trị số trong hướng dẫn này là cho mô hình mặc định (quạt Ø500).

---

## Bước 0 – Chuẩn bị file

Dùng **`export/simscale_mrf_mm.zip`**. File này chứa sẵn **lưu chất** (không khí), không chứa kim loại quạt.

| Khối (solid) | Là gì | Các mặt (face) |
|---|---|---|
| `flow_region` | Không khí trong ống: ống hút dài 1.5 m → quạt → ống đẩy dài 3 m, Ø500. Cánh, motor và thanh giằng là các "lỗ" bên trong khối này | `inlet` (z = −1.5 m), `outlet` (z = +3 m), `duct_walls`, `stator_walls`, `rotor_walls` |
| `rotating_zone` | Hình trụ bao quanh cánh quạt (R = 247.5 mm, z từ −70 đến +42.5 mm). Khối này **chồng lên** `flow_region` | `rotating_zone` |

- Hệ trục: trục quay là **Z** đi qua gốc toạ độ. Khi **ω dương** (quy tắc bàn tay phải quanh +Z), gió thổi theo chiều **+Z**, tức từ `inlet` sang `outlet`.
- Nếu ở bước upload SimScale **không cho chọn đơn vị**, dùng `export/m/simscale_mrf_m.zip` (toạ độ đã tính bằng mét).

## Bước 1 – Tạo project

1. Đăng nhập [simscale.com](https://www.simscale.com), vào **Dashboard → New Project**.
2. Đặt tên, ví dụ `Axial fan D500`, rồi bấm **Create**.

## Bước 2 – Import hình học

1. Trong cây project, bấm **Geometries → "+" / Import geometry → Upload from computer**.
2. Chọn `simscale_mrf_mm.zip`.
   - Nếu SimScale báo **"Unidentified file format"**, chọn **STL** ở ô **File format** rồi bấm import. File ZIP không tự mang định dạng, nên đôi khi SimScale không tự nhận ra.
3. Trong tuỳ chọn import:
   - **Facet split: OFF** (quan trọng). Nếu bật, SimScale sẽ tự cắt các mặt theo góc và làm mất tên mặt.
   - **Units: mm**, nếu có ô chọn đơn vị.
4. Đợi import xong rồi kiểm tra ba điều:
   - Có **2 solids**: `flow_region` và `rotating_zone`.
   - Có các mặt: `inlet`, `outlet`, `duct_walls`, `stator_walls`, `rotor_walls`, `rotating_zone`. Tên có thể kèm tiền tố tên file.
   - **Kích thước đúng**: đường kính ống 0.5 m, tổng chiều dài 4.5 m. Nếu kích thước lớn gấp 1000 lần, xoá geometry và upload lại bằng bản `_m.zip`.

## Bước 3 – Tạo simulation

1. Chọn geometry, bấm **Create Simulation** rồi chọn **Incompressible**.
2. Ở mục cài đặt chung (Global settings):
   - **Turbulence model:** `k-omega SST`
   - **Time dependency:** `Steady-state`
   - Nếu được hỏi **Flow region**, chọn **Internal flow**, vì hình học đã chính là khối lưu chất.

## Bước 4 – Vật liệu

1. Bấm **Materials → "+"** và chọn **Air**. Giá trị mặc định là đủ: ρ ≈ 1.2 kg/m³, ν ≈ 1.5·10⁻⁵ m²/s.
2. Gán cho khối `flow_region`. Nếu SimScale đòi gán cả `rotating_zone`, gán luôn cả hai.

## Bước 5 – Điều kiện ban đầu

Để mặc định (vận tốc 0, áp suất 0).

## Bước 6 – Điều kiện biên

| Loại | Gán cho mặt | Giá trị |
|---|---|---|
| **Pressure inlet** | `inlet` | Total pressure = **0 Pa** |
| **Pressure outlet** | `outlet` | Static (gauge) pressure = **0 Pa** cho lần chạy đầu, sau đó đổi để dựng đường đặc tính (bước 14) |
| Wall (no-slip) | `duct_walls`, `stator_walls`, `rotor_walls` | Mặc định. SimScale tự gán no-slip cho các mặt chưa gán. Không cần khai báo vận tốc quay cho `rotor_walls`, vì vùng MRF sẽ lo phần đó |

**Không** gán điều kiện biên cho mặt `rotating_zone`. Đó là mặt nằm bên trong lưu chất, không phải biên.

> Dùng **áp suất ở cả hai đầu**, không dùng velocity inlet. Như vậy lưu lượng do chính quạt tạo ra, và mới đo được đặc tính quạt.

## Bước 7 – Vùng quay MRF

1. Bấm **Advanced concepts → Rotating zones → "+" → MRF rotating zone**.
2. Điền các giá trị:
   - **Rotational velocity:** `146.6 rad/s` (= 1400 rpm). Công thức đổi: ω = rpm × 2π / 60.
   - **Origin:** `(0, 0, 0)`
   - **Axis:** `(0, 0, 1)`
   - **Assignment:** chọn **volume `rotating_zone`**. Phải chọn khối; nếu chọn mặt thì bước chia lưới sẽ báo lỗi.

## Bước 8 – Numerics

Để mặc định. Nếu bài toán phân kỳ, xem phần [Lỗi thường gặp](#lỗi-thường-gặp).

## Bước 9 – Simulation control

| Mục | Giá trị |
|---|---|
| End time | `1500` (với bài toán steady, mỗi "giây" là một vòng lặp) |
| Delta t | `1` |
| Write control | `1500` (chỉ lưu kết quả cuối, tiết kiệm dung lượng) |
| Maximum runtime | `36000 s` |
| Number of processors | Automatic |

## Bước 10 – Result control (tạo trước khi chạy)

Phải tạo các mục này **trước khi chạy**. SimScale chỉ ghi số liệu cho những gì đã khai báo.

1. **Forces and moments**: đặt tên `rotor`, center `(0, 0, 0)`, gán mặt `rotor_walls`. Kết quả cho ra **M_z** (mô-men quanh trục quạt).
2. **Surface data → Area average**:
   - tên `p_in`, gán mặt `inlet`
   - tên `p_out`, gán mặt `outlet`
3. **Surface data → Volume (flow) rate**:
   - tên `Q_out`, gán mặt `outlet`
   - tên `Q_in`, gán mặt `inlet` (dùng để kiểm tra cân bằng lưu lượng)

## Bước 11 – Chia lưới

1. Bấm **Mesh** và chọn **Algorithm: Standard**.
   - Sizing: **Automatic**, **Fineness 5** cho lần chạy thử. Lên **7** cho kết quả chính thức.
   - Bật **Physics-based meshing** nếu có. SimScale sẽ tự thêm lớp biên theo điều kiện biên.
2. Bấm **Refinements → "+"** và thêm:

   | Loại | Gán cho | Kích thước |
   |---|---|---|
   | Local element size (surface) | `rotor_walls` | **2 mm** |
   | Local element size (surface) | `stator_walls` | 4 mm |
   | Local element size (surface) | `duct_walls` | 4 mm |
   | Region refinement | volume `rotating_zone` | **6 mm** |
   | Inflate boundary layer (nếu chưa bật physics-based) | `rotor_walls`, `duct_walls` | 3 lớp, tỉ lệ tăng 1.5 |

   Mesher Standard **tự tạo cell zone** cho vùng MRF từ khối `rotating_zone`. Không cần bật thêm gì.
3. Bấm **Generate**. Lưới nên có khoảng **1–3 triệu ô**.
4. Kiểm tra bằng **mặt cắt (cutting plane) qua trục**:
   - Khe đầu cánh 5 mm cần có ít nhất 2–3 ô.
   - Lưới phải bám theo hình dạng cánh.

## Bước 12 – Chạy

1. Bấm **Simulation Runs → "+"** rồi **Start**.
2. Theo dõi các **Convergence plot** và các đồ thị Result control. Kết quả đạt khi:
   - residual xuống khoảng ≤ 10⁻⁴, và
   - `Q_out` và M_z **nằm ngang** trong ít nhất 200–300 vòng lặp cuối.
3. Nếu chưa ổn định, tăng End time lên 2500–3000 rồi chạy tiếp.

## Bước 13 – Đọc và tính kết quả

| Đại lượng | Lấy từ | Công thức |
|---|---|---|
| Lưu lượng Q | `Q_out` (m³/s) | Q [m³/h] = Q × 3600 |
| Độ tăng áp toàn phần Δp_t | `p_out`, `p_in` (dùng **total pressure** nếu có) | Δp_t = p_t,out − p_t,in |
| Công suất trục P | M_z từ `rotor` | P = \|M_z\| × ω (W) |
| Hiệu suất | | η = Q × Δp_t / P |

Kiểm tra nhanh kết quả:
- **`Q_out` dương** (gió về +Z) và gần bằng −`Q_in`. Nếu Q âm, hãy đổi dấu ω.
- Ở 1400 rpm, quạt Ø500 nên cho Q cỡ **1–2.5 m³/s** khi Δp = 0. Đây chỉ là bậc độ lớn để phát hiện sai đơn vị, không phải thông số thật của quạt.
- Xem **Post-processor**:
  - mặt cắt qua trục với trường vận tốc và áp suất;
  - streamline đi qua cánh.
  - Dòng phải xoáy sau cánh và đi thẳng về phía `outlet`.

## Bước 14 – Đường đặc tính quạt (Δp – Q)

1. **Duplicate** simulation (giữ nguyên lưới).
2. Chỉ đổi **static pressure ở `outlet`**: 0 → 50 → 100 → 150 → 200 → … Pa. Dừng khi Q gần bằng 0.
3. Mỗi lần chạy cho một điểm (Q, Δp_t). Vẽ đồ thị Δp_t theo Q, và vẽ thêm η theo Q.

> Gần vùng stall (Q nhỏ, Δp lớn), dòng chảy thực tế không còn dừng. Ở vùng này MRF kém chính xác, nên kết quả chỉ mang tính tham khảo.

Muốn đổi tốc độ quay, chỉ cần sửa ω ở Bước 7. Quy luật đồng dạng: Q tỉ lệ với n, Δp tỉ lệ với n², P tỉ lệ với n³. Dùng quy luật này để kiểm tra chéo kết quả.

---

## Lỗi thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Lỗi chia lưới kiểu "cell zone … face assignment" | Vùng MRF đang gán cho **mặt**. Gán lại cho **volume** `rotating_zone` |
| Kích thước sai 1000 lần | Upload lại với đúng đơn vị, hoặc dùng bản `_m.zip` |
| Mặt bị tách lung tung, mất tên `inlet`/`outlet` | Upload lại với **Facet split: OFF** |
| Phân kỳ ngay những vòng lặp đầu | Chạy lại với lưới mịn hơn quanh cánh. Có thể chạy trước ở 700 rpm (73.3 rad/s), rồi dùng kết quả đó làm điều kiện ban đầu cho 1400 rpm |
| Không chia lưới được với gói chồng khối (`rotating_zone` chồng lên `flow_region`) | Thử gói dự phòng `simscale_mrf_conformal_mm.zip` (xem dưới) |
| Hết core-hour (tài khoản Community) | Dùng Fineness 4–5. Có thể rút ngắn ống đẩy: `node scripts/export.mjs --downstream 2000` |

### Gói dự phòng `simscale_mrf_conformal_mm.zip`

Gói này gồm hai khối lưu chất **không chồng nhau** mà tiếp giáp tại mặt `mrf_interface`:

- `flow_static`: `inlet`, `outlet`, `duct_walls`, `stator_walls`, `mrf_interface`
- `flow_rotating`: `rotor_walls`, `mrf_interface`

Thiết lập giống hệt hướng dẫn trên, chỉ khác ba chỗ:

- Gán Air cho **cả hai khối**.
- Gán vùng MRF cho **volume `flow_rotating`**.
- **Không** gán điều kiện biên cho `mrf_interface`.

### Thay đổi miền tính

Mặc định miền tính là **ống gió** (`--mode ducted`), đúng cách lắp thực tế của quạt có bích. Đây là cấu hình dùng để đo đường đặc tính.

Nếu muốn mô phỏng quạt thổi ra không gian rộng: `node scripts/export.mjs --mode free --domainRadius 900`. Khi đó mặt bao ngoài tên là `farfield`; nên đặt nó là Pressure inlet 0 Pa hoặc Wall (slip). Cấu hình này **chỉ đúng khi Δp = 0**: khi Δp > 0, không khí sẽ vòng ngược từ phía đẩy về phía hút qua bên ngoài vỏ quạt.
