# Hướng dẫn mô phỏng quạt trên SimScale – từng bước

Mục tiêu: tính **lưu lượng Q**, **độ tăng áp Δp**, **mô-men/công suất trục** và **hiệu suất** của quạt ở 1400 vòng/phút, dùng phương pháp MRF (Multiple Reference Frame, hệ quy chiếu quay). Sau đó dựng **đường đặc tính quạt**.

> Tên nút/menu trên SimScale có thể khác đôi chút giữa các phiên bản giao diện. Các giá trị số trong hướng dẫn này là cho mô hình mặc định (quạt Ø500).

---

## Bước 0 – Chuẩn bị file

Dùng **`export/simscale_mrf_mm.stl`**. Đây là một file STL thường, không phải ZIP. Nó chứa sẵn **khối không khí**, không chứa phần kim loại của quạt, và gồm đúng 2 khối kín:

| Khối (part) | Là gì |
|---|---|
| `flow_region` | Không khí trong ống: ống hút 1.5 m → quạt → ống đẩy 3 m, Ø500. Cánh, bầu, motor và thanh giằng là các "lỗ" khoét bên trong khối này |
| `rotating_zone` | Hình trụ ngắn bao quanh cánh quạt (R = 247.5 mm, z từ −70 đến +42.5 mm). Khối này **nằm chồng bên trong** `flow_region`, đúng cách SimScale yêu cầu cho vùng quay |

- Hệ trục: trục quay là **Z** đi qua gốc toạ độ. Khi **ω dương** (quy tắc bàn tay phải quanh +Z), gió thổi theo chiều **+Z**.
- **Đầu hút (inlet)** là đầu ống **gần quạt** (cách quạt 1.5 m, z = −1.5 m). Bên ngoài ống, gần đầu này, bạn sẽ thấy 4 chấm nhỏ: đó là đầu các thanh giằng.
- **Đầu đẩy (outlet)** là đầu ống **xa quạt** (z = +3 m).
- Nếu SimScale không cho chọn đơn vị khi upload, dùng `export/m/simscale_mrf_m.stl` (toạ độ đã tính bằng mét).

> Một file STL không giữ được tên của từng mặt: SimScale biến mỗi khối `solid` trong file thành một part riêng. Vì vậy mỗi khối ở đây là một khối kín, còn các mặt (đầu hút, đầu đẩy, thành ống, cánh…) do SimScale tự tách bằng **Facet split** khi import.

## Bước 1 – Tạo project

1. Đăng nhập [simscale.com](https://www.simscale.com), vào **Dashboard → New Project**.
2. Đặt tên, ví dụ `Axial fan D500`, rồi bấm **Create**.

## Bước 2 – Import hình học

1. Xoá các geometry đã import trước đó (bản ZIP cũ dùng sai cách đóng gói).
2. Bấm **Geometries → "+" → Import from Computer** rồi chọn `simscale_mrf_mm.stl`.
   - Nếu SimScale hỏi **File format**, chọn **STL**.
3. Trong tuỳ chọn import:
   - **Facet split: ON**, để góc mặc định. Đầu ống vuông góc với thành ống nên sẽ được tách thành mặt riêng.
   - **Units: mm**, nếu có ô chọn đơn vị.
4. Đợi import xong rồi kiểm tra:
   - Cây **GEOMETRY** bên phải có **2 part**: `flow_region` và `rotating_zone`.
   - Bật **Show faces** thì thấy nhiều mặt dạng `Face …`. Đó là các mặt do Facet split tách ra.
   - **Kích thước đúng**: ống Ø0.5 m, dài 4.5 m. Nếu lớn gấp 1000 lần, xoá đi và upload bản `_m.stl`.

## Bước 3 – Tạo simulation

1. Chọn geometry, bấm **Create Simulation** rồi chọn **Incompressible**.
2. Ở mục cài đặt chung (Global settings):
   - **Turbulence model:** `k-omega SST`
   - **Time dependency:** `Steady-state`
   - Nếu được hỏi **Flow region**, chọn **Internal flow**, vì hình học đã chính là khối lưu chất.

## Bước 4 – Vật liệu

1. Bấm **Materials → "+"** và chọn **Air**. Giá trị mặc định là đủ: ρ ≈ 1.2 kg/m³, ν ≈ 1.5·10⁻⁵ m²/s.
2. Ở ô **Assigned Volumes**, bấm vào **ống** trong khung 3D để chọn `flow_region`. Thanh công cụ phía trên phải đang ở chế độ **chọn khối (volume)**.
3. Nếu SimScale đòi gán cả `rotating_zone`, gán luôn cả hai.

## Bước 5 – Điều kiện ban đầu

Để mặc định (vận tốc 0, áp suất 0).

## Bước 6 – Điều kiện biên

Chuyển thanh công cụ sang chế độ **chọn mặt (face)**, rồi bấm trực tiếp lên mặt cần gán trong khung 3D.

| Loại | Gán cho mặt | Giá trị |
|---|---|---|
| **Pressure inlet** | mặt tròn ở **đầu ống gần quạt** (z = −1.5 m) | Total pressure = **0 Pa** |
| **Pressure outlet** | mặt tròn ở **đầu ống xa quạt** (z = +3 m) | Static (gauge) pressure = **0 Pa** cho lần chạy đầu, sau đó đổi để dựng đường đặc tính (bước 14) |
| Wall (no-slip) | tất cả các mặt còn lại | Mặc định. SimScale tự gán no-slip cho các mặt chưa gán. Không cần khai báo vận tốc quay cho mặt cánh, vì vùng MRF sẽ lo phần đó |

- Sau khi gán, các mặt sẽ được đặt tên theo điều kiện biên.
- **Không** gán điều kiện biên cho các mặt của part `rotating_zone`. Đó là mặt nằm bên trong không khí, không phải biên.

> Dùng **áp suất ở cả hai đầu**, không dùng velocity inlet. Như vậy lưu lượng do chính quạt tạo ra, và mới đo được đặc tính quạt.

## Bước 7 – Vùng quay MRF

1. Bấm **Advanced concepts → Rotating zones → "+" → MRF rotating zone**.
2. Điền các giá trị:
   - **Rotational velocity:** `146.6 rad/s` (= 1400 rpm). Công thức đổi: ω = rpm × 2π / 60.
   - **Origin:** `(0, 0, 0)`
   - **Axis:** `(0, 0, 1)`
   - **Assignment:** ở chế độ chọn khối, chọn part **`rotating_zone`** (bấm vào nó trong cây GEOMETRY). Phải chọn khối; nếu chọn mặt thì bước chia lưới sẽ báo lỗi.

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

1. **Surface data → Area average**:
   - tên `p_in`, gán mặt đầu hút
   - tên `p_out`, gán mặt đầu đẩy
2. **Surface data → Volume (flow) rate**:
   - tên `Q_out`, gán mặt đầu đẩy
   - tên `Q_in`, gán mặt đầu hút (dùng để kiểm tra cân bằng lưu lượng)
3. **Forces and moments**: đặt tên `rotor`, center `(0, 0, 0)`. Gán **các mặt của cánh và bầu quạt**. Kết quả cho ra **M_z** (mô-men quanh trục quạt). Đây là bước mất công nhất vì các mặt nằm bên trong ống:
   - Chọn mặt thành ống, ẩn nó đi (biểu tượng con mắt gạch chéo). Ẩn luôn part `rotating_zone`.
   - Lúc này nhìn thấy cánh, bầu, motor và thanh giằng. Chọn **5 cánh và bầu phía trước**: bấm từng mặt, hoặc dùng chọn khung chữ nhật từ góc nhìn ngang, khung chỉ phủ phần trước motor.
   - **Không** chọn motor phía sau và 4 thanh giằng. Đó là phần đứng yên; nếu chọn vào, mô-men đo được sẽ sai.

## Bước 11 – Chia lưới

1. Bấm **Mesh** và chọn **Algorithm: Standard**.
   - Sizing: **Automatic**, **Fineness 5** cho lần chạy thử. Lên **7** cho kết quả chính thức.
   - Bật **Physics-based meshing** nếu có. SimScale sẽ tự thêm lớp biên theo điều kiện biên.
2. Bấm **Refinements → "+"** và thêm:

   | Loại | Gán cho | Kích thước |
   |---|---|---|
   | Region refinement | part `rotating_zone` | **4 mm**. Ô nhỏ trong cả vùng cánh, nên không phải chọn từng mặt cánh |
   | Local element size (surface) | các mặt cánh và bầu (nếu đã chọn ở bước 10) | 2 mm, tuỳ chọn |
   | Inflate boundary layer (nếu chưa bật physics-based) | mặt cánh và thành ống | 3 lớp, tỉ lệ tăng 1.5 |

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
| Cây GEOMETRY hiện các part `inlet`, `outlet`, `stator_walls#1`… và **không có** `flow_region` | Đó là bản ZIP cũ (sai cách đóng gói). Xoá đi và import `simscale_mrf_mm.stl` |
| Assigned Volumes không chọn được gì | Thanh công cụ đang ở chế độ chọn mặt. Chuyển sang chế độ chọn khối |
| Lỗi chia lưới kiểu "cell zone … face assignment" | Vùng MRF đang gán cho **mặt**. Gán lại cho khối `rotating_zone` |
| Kích thước sai 1000 lần | Upload lại với đúng đơn vị, hoặc dùng bản `_m.stl` |
| Đầu ống không tách thành mặt riêng | Upload lại với **Facet split: ON** |
| Phân kỳ ngay những vòng lặp đầu | Chạy lại với lưới mịn hơn quanh cánh. Có thể chạy trước ở 700 rpm (73.3 rad/s), rồi dùng kết quả đó làm điều kiện ban đầu cho 1400 rpm |
| Không chia lưới được do `rotating_zone` chồng lên `flow_region` | Thử file dự phòng `simscale_mrf_conformal_mm.stl` (xem dưới) |
| Hết core-hour (tài khoản Community) | Dùng Fineness 4–5. Có thể rút ngắn ống đẩy: `node scripts/export.mjs --downstream 2000` |

### File dự phòng `simscale_mrf_conformal_mm.stl`

File này gồm hai khối không khí **không chồng nhau**, tiếp giáp nhau tại mặt trụ của vùng quay:

- `flow_static`: không khí trong ống, trừ phần hình trụ quanh cánh.
- `flow_rotating`: phần không khí trong hình trụ quanh cánh.

Thiết lập giống hệt hướng dẫn trên, chỉ khác ba chỗ:

- Gán Air cho **cả hai khối**.
- Gán vùng MRF cho khối **`flow_rotating`**.
- **Không** gán điều kiện biên cho mặt tiếp giáp giữa hai khối.

### Thay đổi miền tính

Mặc định miền tính là **ống gió** (`--mode ducted`), đúng cách lắp thực tế của quạt có bích. Đây là cấu hình dùng để đo đường đặc tính.

Nếu muốn mô phỏng quạt thổi ra không gian rộng: `node scripts/export.mjs --mode free --domainRadius 900`. Khi đó mặt trụ bao ngoài miền tính nên đặt là Pressure inlet 0 Pa hoặc Wall (slip). Cấu hình này **chỉ đúng khi Δp = 0**: khi Δp > 0, không khí sẽ vòng ngược từ phía đẩy về phía hút qua bên ngoài vỏ quạt.
