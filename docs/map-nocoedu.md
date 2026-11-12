# Bản Đồ Chuyển Đổi Dữ Liệu: Lark Base Sang NocoEdu (NocoBase 3)

> **Mục tiêu:** Chuyển đổi toàn bộ dữ liệu quản lý vận hành từ file xuất `.base` của CLB Cờ vua Dương Sinh sang hệ cơ sở dữ liệu quan hệ chuẩn mực trên nền tảng **NocoEdu** (ứng dụng quản lý giáo dục & đào tạo phát triển trên **NocoBase 3**).

---

## 1. Tổng Quan Kiến Trúc NocoEdu

Hệ thống NocoEdu áp dụng mô hình chuẩn quản lý trung tâm đào tạo với các thực thể cốt lõi:
1. **Cơ sở (Branches):** Điểm dạy (ví dụ: Kim Liên, Vĩnh Phúc).
2. **Khóa học & Cấp độ (Levels & Courses):** Khung chương trình đào tạo cờ vua.
3. **Lớp học (Classes):** Lớp học thực tế, gắn với giáo viên, phòng học, lịch học trong tuần.
4. **Nhân sự & Giáo viên (Teachers / Staff):** Hồ sơ giảng viên, phân công đứng lớp.
5. **Học viên (Students):** Hồ sơ học viên, ngày sinh, trình độ hiện tại, tài khoản Lichess/Chesskid.
6. **Khách hàng & Phụ huynh (Parents / Contacts / Leads):** Quản lý phễu CRM từ Contact $\rightarrow$ Lead $\rightarrow$ Khách hàng chính thức.
7. **Hợp đồng & Gói học phí (Tuition Deals & Orders):** Số buổi đăng ký, học phí đã nộp, thời hạn gói.
8. **Điểm danh & Đánh giá buổi học (Attendances & Feedbacks):** Nhật ký từng buổi học của từng học viên.
9. **Học liệu & Sách (Books & Book Deliveries):** Quản lý danh mục sách và lịch sử phát sách cho học sinh.

---

## 2. Bảng Ánh Xạ Thực Thể (Table Mapping Matrix)

| Bảng Nguồn Trong Lark Base | Bảng Đích Trong NocoEdu | Loại Quan Hệ Trên NocoBase 3 | Ghi Chú Chuẩn Hóa |
|---|---|---|---|
| `tblKvdbs97cDCMF9` (LopHoc) | `classes` | Belongs To `branches`, Has Many `students` | Chuẩn hóa lịch học, ca học. |
| `tblv524wVlgIsH5H` (HocVien) | `students` | Belongs To `classes`, Belongs To `parents` | Tách riêng phụ huynh thành đối tượng `parents`. |
| `tblmBDJ8bQSMqpNB` (GiaoVien) | `teachers` / `users` | Has Many `classes`, Has Many `attendances` | Tích hợp vào hệ thống tài khoản người dùng NocoBase. |
| `tblvjJoqGcHsoxQr` (Level) | `levels` | Has Many `classes`, Has Many `students` | Bảng danh mục cấp bậc. |
| `tbl324dOlvbf3BUu` (Sách) | `books` | Has Many `book_deliveries` | Danh mục tài liệu / sách cờ. |
| `tblU8nwesckl40Ff` (Từng lần phát sách) | `book_deliveries` | Belongs To `students`, Belongs To `books` | Lịch sử giao nhận sách thực tế. |
| `tblHp1PGPz52eZBz` (Deal HP) | `tuition_deals` | Belongs To `students` | Gói học phí: số buổi đăng ký, học phí đã đóng. |
| `tblxbcR8C6V4W8zJ` (Deal book) | `book_orders` | Belongs To `students` | Đơn hàng mua sách/tài liệu riêng. |
| `tblGDWScLLqgOR1W` (Tổng Deal) | `orders` | Has Many `order_items` | Gom cả Deal HP và Deal book vào mô hình Order chuẩn. |
| `tblprrzroE2NBli5` (2024 Nhận xét mỗi buổi)<br>`tbluhrY4B8i63PAh` (2025 Nhận xét mỗi buổi)<br>`tbl9TTf0m2EhWV3g` (2026 Nhận xét mỗi buổi) | **`attendances_feedbacks`** *(Gộp 3 bảng làm một)* | Belongs To `classes`, Belongs To `students`, Belongs To `teachers` | **Hợp nhất thành 1 bảng duy nhất**, phân biệt bằng trường ngày học `attendance_date`. |
| `tblZUIXmpdt13j4x` (Contact) | `crm_contacts` | Has Many `leads` | Phễu CRM giai đoạn tiếp cận ban đầu. |
| `tbl2MF2cmS7CLEkb` (Lead) | `crm_leads` | Belongs To `crm_contacts` | Khách hàng tiềm năng cần chuyển đổi. |
| `tblW0ilugW7beQDp` (Trial lesson) | `trial_lessons` | Belongs To `crm_leads` | Buổi học thử của học viên mới. |
| `tblHOPEfTzxCU2ff` (Tương tác PH) | `parent_interactions` | Belongs To `parents`, Belongs To `students` | Nhật ký trao đổi phụ huynh định kỳ. |
| `tblUYIRX3QK1h8Re` (Đánh giá định kỳ 5 buổi)<br>`tblI5iaKQeRMkmyl` (Cuối năm 2024 - nhận xét) | `student_evaluations` | Belongs To `students` | Các kỳ đánh giá tiến bộ định kỳ. |
| `tblePpRFUXMaE793` (Tên giải đấu)<br>`tblnFVeycdwaEccU` (Kết quả từng ván)<br>`tblh5OYrWqGweKW1` (Tham gia giải đấu) | `tournaments`<br>`tournament_matches`<br>`tournament_participants` | Belongs To `tournaments`, Belongs To `students` | Quản lý thi đấu giải cờ nội bộ / mở rộng. |

---

## 3. Quy Tắc Nghiệp Vụ Tính Số Buổi Tồn & Cơ Chế Trừ Buổi

### 3.1. Các công thức trong Lark Base cũ:
1. **Số buổi đã học:**
   - Trong bảng `Deal HP` hoặc `HocVien`: Tính bằng cách đếm (Rollup `COUNTA` hoặc `SUM`) số bản ghi trong bảng nhận xét mỗi buổi thỏa mãn điều kiện `[có mặt] = "1"`.
   ```
   Số buổi đã học = COUNT(Nhận xét mỗi buổi WHERE học viên = Current AND có mặt = 1)
   ```
2. **Số buổi còn tồn:**
   ```
   Số buổi còn tồn = [Số buổi nộp] - [Số buổi đã học]
   ```
3. **Tiền sách còn tồn:**
   ```
   Tiền sách còn tồn = [Tiền sách đã nộp] - [Tổng tiền sách đã nhận]
   ```

### 3.2. Chuyển dịch sang mô hình NocoEdu (Trừ buổi theo Workflow / Transactional Ledger):
Trong NocoBase 3, không nên dùng Rollup động quét toàn bộ bảng nhận xét hàng ngàn dòng mỗi khi load trang vì sẽ gây nghẽn hiệu năng. Thay vào đó:
1. Thiết lập **Workflow Hook** khi tạo mới hoặc cập nhật bản ghi trong bảng `attendances_feedbacks`:
   - Nếu trạng thái điểm danh chuyển thành **"Có mặt" (Present)**:
     - Tìm Gói học phí (`tuition_deals`) đang có hiệu lực (`status = 'Active'` và `remaining_sessions > 0`) của học viên đó theo thứ tự FIFO (gói nộp trước trừ trước).
     - Trừ `remaining_sessions = remaining_sessions - 1`.
     - Tăng `attended_sessions = attended_sessions + 1`.
     - Nếu `remaining_sessions == 0`, chuyển trạng thái gói thành **"Đã hoàn thành" (Completed)** và kích hoạt thông báo nhắc phụ huynh tái tục học phí.
   - Nếu hủy điểm danh hoặc đổi thành **"Vắng có phép" (Excused Absence)**:
     - Hoàn lại 1 buổi cho gói tương ứng.

---

## 4. Các Điểm Bất Cập & Mâu Thuẫn Cần Xử Lý Khi Di Chuyển

> [!WARNING]
> Dưới đây là 4 vấn đề kỹ thuật lớn phát hiện trong cấu trúc Lark Base cần được chuẩn hóa triệt để khi chuyển lên NocoEdu:

1. **Phân mảnh bảng theo năm (`2024`, `2025`, `2026 Nhận xét mỗi buổi`):**
   - *Thực trạng trong Lark:* Mỗi năm CLB nhân bản ra một bảng mới (năm 2024 có 723 dòng, 2025 có 2525 dòng, 2026 có 2605 dòng). Điều này dẫn đến việc công thức tính tổng buổi học của một học sinh học liên tục qua các năm phải viết công thức rất dài hoặc bị đứt đoạn giữa các năm.
   - *Khắc phục:* Gộp toàn bộ 5,853 bản ghi này vào một bảng duy nhất `attendances_feedbacks`, bổ sung trường `session_date` (Date) và đánh chỉ mục (Index) trên `[student_id, session_date]`.

2. **Dữ liệu điểm danh dùng SingleSelect thay vì Boolean/Enum:**
   - *Thực trạng:* Trường `có mặt` được lưu dưới dạng SingleSelect với option `"1"` và `"0"`.
   - *Khắc phục:* Chuyển thành kiểu `enum('present', 'absent_excused', 'absent_unexcused', 'late')` để hỗ trợ báo cáo điểm danh chính xác hơn.

3. **Bảng lưu trữ rác và bảng mẫu (Trash / Sample Tables):**
   - Các bảng:
     - `tbl009hP7msOu6bR` (Lưu trữ - Số buổi tồn (không dùng))
     - `tblNnu2Pvno44xlm` (Lưu trữ - QL công việc (mẫu cũ))
     - `tblTXfMZH0bFnO2A` (Lưu trữ - Interaction with Parents (sample) - xuất hiện 2 lần trùng ID)
   - *Xử lý:* **Bỏ qua không nhập** vào schema hoạt động của NocoEdu, chỉ lưu trữ trong file dump SQLite dự phòng.

4. **Tách rời thông tin học viên và phụ huynh:**
   - Trong bảng `HocVien`, thông tin phụ huynh (Tên PH, SDT PH, email PH) được lưu trực tiếp dạng cột phụ hoặc Lookup từ Contact.
   - Khi chuyển lên NocoEdu, một phụ huynh có thể có 2 hoặc 3 con học tại CLB. Việc tạo bảng `parents` riêng và thiết lập quan hệ `parents 1 - n students` sẽ giúp tối ưu việc xuất hóa đơn và gửi thông báo chung cho một gia đình.
