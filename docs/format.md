# Tài Liệu Kỹ Thuật: Định Dạng File Xuất .base Của Lark Base (Bitable)

> Tài liệu này mô tả chi tiết cấu trúc bên trong của file `.base` được xuất từ Lark Base (ByteDance Lark / Feishu Bitable). Tài liệu này được biên soạn độc lập dựa trên việc phân tích cấu trúc nhị phân và dữ liệu giải mã nhằm phục vụ việc chuyển đổi dữ liệu sang các nền tảng nguồn mở như NocoBase 3, PostgreSQL, SQLite.

---

## 1. Cấu Trúc Tổng Quan Của File `.base`

File `.base` thực chất là một văn bản định dạng JSON ngoài (outer JSON wrapper), bên trong chứa các khối dữ liệu chuyên biệt đã được nén bằng thuật toán **Gzip (DEFLATE)** và mã hóa sang dạng chuỗi **Base64**.

### Các trường chính trong JSON ngoài:

| Khóa (Key) | Kiểu dữ liệu | Mô tả |
|---|---|---|
| `gzipSnapshot` | String (Base64) | Khối dữ liệu chính: Chứa thông tin Base, định nghĩa TableMap, cấu trúc Schema các bảng (fields, views) và toàn bộ bản ghi (recordMap). |
| `gzipAutomation` | String (Base64) | Khối quy trình tự động hóa (Automations): Các trigger (`setRecord`, `addRecord`, `datetimeField`), điều kiện và action nodes. |
| `gzipDashboard` | String (Base64) | Khối cấu hình Dashboard: Biểu đồ, báo cáo thống kê trực quan. |
| `gzipBaseRole` | String (Base64) | Khối phân quyền: Danh sách vai trò (Roles) và ma trận quyền hạn (Permissions) trên từng bảng/cột. |
| `gzipAccessConfig` | String (Base64) | Cấu hình bảo mật và quyền truy cập cấp Base. |
| `gzipFormConfigs` | String (Base64) | Cấu hình các biểu mẫu khảo sát / biểu mẫu thu thập dữ liệu (Form Views). |
| `gzipExtraInfo` | String (Base64) | Thông tin bổ trợ về plugin, extension và môi trường xuất. |
| `sign` | String | Chữ ký số kiểm tra tính toàn vẹn của file xuất. |

---

## 2. Cấu Trúc Khối `gzipSnapshot`

Sau khi giải mã Base64 và giải nén Gzip, dữ liệu trả về là một **JSON Array** gồm $N$ phần tử:

1. **Phần tử đầu tiên (`snapshot[0]`):**
   - Chứa thông tin gốc của Base: `snapshot[0].schema.base` (`id`, `name`).
   - Chứa danh mục bảng: `snapshot[0].schema.tableMap` ánh xạ `tableId -> { id, name }`. Đây là nơi duy nhất lưu trữ **tên hiển thị thực tế** của toàn bộ các bảng trong Base (trong các phần tử con, `meta.name` thường là chuỗi rỗng `""`).
   - Chứa schema và dữ liệu của bảng đầu tiên: `snapshot[0].schema.data.table` và `snapshot[0].schema.data.recordMap`.

2. **Các phần tử tiếp theo (`snapshot[1]` đến `snapshot[N-1]`):**
   - Mỗi phần tử tương ứng với một bảng trong Base.
   - `schema.data.table`:
     - `meta`: `{ id, recordsNum, schemaVersion, ... }`
     - `primaryKey`: ID của trường làm khóa chính hiển thị (thường là trường đầu tiên).
     - `fieldMap`: Đối tượng ánh xạ `fieldId -> { name, type, property }`.
     - `viewMap` / `views`: Danh sách các chế độ xem (Grid, Kanban, Gallery, Form).
   - `schema.data.recordMap`: Đối tượng ánh xạ `recordId -> { [fieldId]: { value, modifiedTime, modifiedUser } }`.
   - `schema.data.recordMeta`: Metadata sắp xếp bản ghi.

> [!NOTE]
> Trong một số file xuất, snapshot có thể chứa phần tử trùng lặp cùng `tableId` (do bản sao lưu trạng thái). Parser cần deduplicate theo `tableId`.

---

## 3. Bảng Mã Loại Trường (Field Types) Đầy Đủ

Dưới đây là bảng mã các loại trường được giải mã trong Lark Base:

| Mã Loại (`type`) | Tên Định Danh | Kiểu Dữ Liệu Thực Tế | Cấu Trúc `cell.value` | Mô Tả & Cách Giải Mã |
|:---:|---|---|---|---|
| **1** | `Text` | Văn bản đa dòng / chuỗi | `[{ text: string, type: "text" }]` hoặc `string` | Ghép các phần tử text lại thành một chuỗi văn bản hoàn chỉnh. |
| **2** | `Number` | Số | `number` | Số nguyên hoặc số thực. Định dạng hiển thị nằm trong `property.formatter`. |
| **3** | `SingleSelect` | Chọn một | `string` (Option ID) | Giá trị lưu trữ là `id` tùy chọn (ví dụ: `optxxxx`). Cần đối chiếu `property.options` để lấy tên hiển thị (`name`). |
| **4** | `MultiSelect` | Chọn nhiều | `string[]` (Mảng Option ID) | Mảng các ID tùy chọn. Đối chiếu `property.options` để lấy danh sách tên (`string[]`). |
| **5** | `DateTime` | Ngày giờ | `number` (Timestamp ms) | Thời gian theo mili-giây UTC Unix timestamp. Định dạng nằm trong `property.dateFormat`. |
| **7** | `Checkbox` | Hộp kiểm | `boolean` | `true` (được tích) hoặc `false` (chưa tích). |
| **11** | `User` | Thành viên / Người dùng | `{ users: [{ userId, name, avatarUrl, enName }] }` | Thông tin người dùng nội bộ của hệ thống Lark. |
| **13** | `Phone` | Số điện thoại | `{ fullPhoneNum: string }` | Số điện thoại quốc tế hoặc nội địa có mã vùng. |
| **15** | `Url` | Liên kết Web | `[{ link: string, text: string, type: "url" }]` | Mảng chứa URL và văn bản hiển thị kèm theo. |
| **17** | `Attachment` | Tệp đính kèm | `[{ id, name, size, token, type }]` | Metadata tệp tải lên (file vật lý không lưu trữ trực tiếp trong snapshot). |
| **18** | `SingleLink` | Liên kết một chiều (1-n / n-1) | `string[]` (Mảng Record ID) | Mảng các `recordId` trỏ tới bảng đích được chỉ định trong `property.tableId`. |
| **19** | `Lookup` | Tra cứu dữ liệu từ bảng liên kết | `null` (Runtime Dynamic) | Không lưu trực tiếp giá trị tế bào trong file; được tính toán động qua `property.formula` và `property.filterInfo`. |
| **20** | `Formula` | Công thức tính toán | `null` (Runtime Dynamic) | Không lưu trực tiếp giá trị tế bào trong file; chứa biểu thức tính trong `property.formula`. |
| **21** | `DuplexLink` | Liên kết hai chiều (n-n / 2-way) | `string[]` (Mảng Record ID) | Chứa `property.tableId` và `property.backFieldId` để đồng bộ 2 chiều giữa 2 bảng. |
| **24** | `WorkflowStage` | Giai đoạn quy trình (Pipeline) | `string` (Option ID) | Biểu diễn bước quy trình Kanban/Workflow. Danh sách bước nằm trong `property.options`, có thuộc tính `type: "Default" \| "EndDone" \| "EndCancel"`. |
| **1001** | `CreatedAt` | Thời gian tạo bản ghi | `number` (Timestamp ms) | Thời điểm bản ghi được tạo ra lần đầu trong hệ thống. |
| **1005** | `AutoNumber` | Số tự tăng / Mã định danh | `[{ sequence: string, number: string }]` | Mã số tự tăng có tiền tố định dạng hoặc số thứ tự tăng dần. |

---

## 4. Cấu Trúc Công Thức & Quy Tắc Tra Cứu (Formula & Lookup Syntax)

Lark Base biểu diễn công thức dưới dạng cú pháp định danh nội bộ:
```
bitable::$table[tableId].$field[fieldId]
bitable::$table[targetTableId].FILTER(CurrentValue.$column[filterFieldId] = bitable::$table[currentTableId].$field[sourceFieldId]).$column[targetFieldId].LISTCOMBINE()
```

- **Thay thế hiển thị (`readableFormula`):**
  - `$table[tableId]` $\rightarrow$ `[Tên Bảng]`
  - `$field[fieldId]` $\rightarrow$ `[Tên Trường]`
  - `$column[fieldId]` $\rightarrow$ `[Tên Cột]`
  - `$option[optionId]` $\rightarrow$ `"Tên Tùy Chọn"`
- Khi chuyển đổi sang NocoBase 3:
  - Các trường `Lookup (19)` trở thành quan hệ **Belongs To / Has Many** kèm trường hiển thị liên kết hoặc aggregation formula.
  - Các trường `Formula (20)` trở thành **Formula Field** của NocoBase hoặc SQL Computed Column.
