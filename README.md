# lark-base-tools 🚀

> **Bộ công cụ TypeScript & CLI mã nguồn mở (MIT) dùng để phân tích, giải mã cấu trúc file xuất `.base` của Lark Base (Bitable) và di chuyển dữ liệu sang các nền tảng quan hệ như NocoBase 3 (NocoEdu, NocoCRM), SQLite, PostgreSQL.**

---

## 🇻🇳 Tiếng Việt

### 1. Tính Năng Nổi Bật

- **Phân tích siêu nhanh (`inspect`):** Đọc metadata toàn bộ Base, danh sách bảng, số lượng bản ghi, thống kê 17+ loại trường và cảnh báo tự động các cột dữ liệu nhạy cảm (CCCD, email, điện thoại, ảnh, địa chỉ, bill). **Tuyệt đối không hiển thị dữ liệu bản ghi**.
- **Trích xuất lược đồ hoàn chỉnh (`schema`):**
  - `schema.md`: Danh mục chi tiết các bảng, trường và **sơ đồ thực thể quan hệ Mermaid ERD** tự động sinh từ liên kết 1 chiều/2 chiều.
  - `quy-tac.md`: Dịch toàn bộ các công thức (Formula) và tra cứu (Lookup) sang biểu thức đọc được bằng tiếng Việt kèm nhãn `[Cần xác nhận]`.
  - `automations.md`: Giải thích 100% các kịch bản tự động hóa (trigger, điều kiện, hành động).
  - `schema.json`: Cấu trúc JSON sạch phục vụ các công cụ migration.
- **Xuất dữ liệu an toàn & Đổi kiểu (`export`):**
  - Hỗ trợ định dạng: **JSON**, **CSV** (có UTF-8 BOM hiển thị tiếng Việt hoàn hảo trên Excel), và **SQLite** (file cơ sở dữ liệu nhị phân hoặc SQL dump).
  - Tích hợp sẵn profile `anonymized`: Tự động loại trừ các cột nhạy cảm và viết tắt họ tên học viên, giáo viên, phụ huynh (ví dụ: `Nguyễn Văn An` $\rightarrow$ `N. V. An`).
  - Hỗ trợ file cấu hình profile YAML tùy biến (chọn bảng, đổi tên cột, giải tham chiếu liên kết thành khóa ngoại).
- **So sánh phiên bản (`diff`):** So sánh khác biệt về cấu trúc bảng, cột thêm/bớt, đổi kiểu dữ liệu và biến động số lượng bản ghi giữa 2 lần xuất `.base`.
- **Bảo mật tuyệt đối:** 100% test sử dụng dữ liệu giả tự sinh bằng generator (`buildFixture`). Không chứa bất kỳ dữ liệu thật nào trong kho mã nguồn.

---

### 2. Cài Đặt & Sử Dụng

#### Cài đặt qua pnpm:
```bash
# Cài đặt toàn bộ dependencies trong monorepo
pnpm install

# Build mã nguồn TypeScript
pnpm run build

# Chạy kiểm thử tự động
pnpm test
```

#### Hướng dẫn CLI:

```bash
# 1. Tóm tắt cấu trúc và cảnh báo cột nhạy cảm (không in data)
node packages/cli/bin/lark-base.js inspect "path/to/file.base"

# 2. Sinh tài liệu schema, Mermaid ERD, quy tắc tính toán và automations
node packages/cli/bin/lark-base.js schema "path/to/file.base" --out ./schema_output

# 3. Xuất dữ liệu đã ẩn danh hóa sang CSV (an toàn, không chứa cột nhạy cảm)
node packages/cli/bin/lark-base.js export "path/to/file.base" --out ./export_csv --format csv --profile anonymized

# 4. Xuất dữ liệu sang cơ sở dữ liệu SQLite
node packages/cli/bin/lark-base.js export "path/to/file.base" --out ./export_sqlite --format sqlite --profile anonymized

# 5. So sánh cấu trúc giữa 2 file .base
node packages/cli/bin/lark-base.js diff "path/to/original.base" "path/to/updated.base"
```

---

## 🇬🇧 English

### 1. Overview

**lark-base-tools** is an open-source (MIT) TypeScript monorepo and CLI toolkit designed to decode, analyze, and export Lark Base (ByteDance Bitable) `.base` backup files into relational systems such as NocoBase 3, SQLite, and PostgreSQL.

### 2. Key Commands

- `lark-base inspect <file>`: High-level overview of base tables, record counts, field types, and sensitive column detection without printing raw records.
- `lark-base schema <file> --out <dir>`: Generates `schema.md` (with interactive Mermaid ER diagrams), `quy-tac.md` (Vietnamese formula translations), `automations.md`, and `schema.json`.
- `lark-base export <file> --out <dir> --format csv|json|sqlite --profile <name>`: Exports sanitized data using customizable YAML profiles or built-in `anonymized` profile.
- `lark-base diff <fileA> <fileB>`: Reports structural schema changes and record count deltas between two `.base` files.

---

## 📁 Repository Structure

```
lark-base-tools/
├── packages/
│   ├── core/              # @duongsinh/lark-base-core (parser, formula translator, mock builder)
│   └── cli/               # lark-base CLI (inspect, schema, export, diff)
├── docs/
│   ├── format.md          # Technical specification of decoded .base format & field types
│   └── map-nocoedu.md     # Architectural mapping guide to NocoEdu (NocoBase 3)
├── .github/workflows/
│   └── ci.yml             # GitHub Actions CI workflow
├── pnpm-workspace.yaml
├── package.json
└── LICENSE (MIT)
```

---

## 📜 License

MIT License © 2026 Duong Sinh.
All dependencies strictly conform to permissive open-source licenses (MIT, BSD, Apache-2.0, ISC).
