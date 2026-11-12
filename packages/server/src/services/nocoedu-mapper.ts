import {
  type LarkBaseResult,
  type LarkTable,
  type LarkRecord,
  isSensitiveField,
  anonymizeName
} from '@duongsinh/lark-base-core';
import {
  type NocoCollectionDefinition,
  type NocoRecord,
  type TableSummary
} from './types.js';

// Table ID and pattern matchers based on docs/map-nocoedu.md
export const IGNORED_TABLE_IDS = new Set([
  'tbl009hP7msOu6bR', // Lưu trữ - Số buổi tồn (không dùng)
  'tblNnu2Pvno44xlm', // Lưu trữ - QL công việc (mẫu cũ)
  'tblTXfMZH0bFnO2A'  // Lưu trữ - Interaction with Parents (sample)
]);

export const ATTENDANCE_TABLE_IDS = new Set([
  'tblprrzroE2NBli5', // 2024 Nhận xét mỗi buổi
  'tbluhrY4B8i63PAh', // 2025 Nhận xét mỗi buổi
  'tbl9TTf0m2EhWV3g'  // 2026 Nhận xét mỗi buổi
]);

export interface MappedDataSet {
  collections: NocoCollectionDefinition[];
  data: Record<string, NocoRecord[]>;
  summary: {
    totalRecords: number;
    tableMapping: Record<string, string>;
    ignoredTables: Array<{ id: string; name: string; reason: string }>;
    mergedTables: {
      target: string;
      sources: string[];
      recordCount: number;
    };
  };
}

export class NocoEduMapper {
  /**
   * Summarizes tables in a Lark Base file to show in the Web UI inspect screen
   */
  public static inspectTables(baseResult: LarkBaseResult): {
    tables: TableSummary[];
    totalTables: number;
    totalRecords: number;
    ignoredCount: number;
    mergedCount: number;
    recommendedMapping: Record<string, string>;
  } {
    const tables: TableSummary[] = [];
    const recommendedMapping: Record<string, string> = {};
    let totalRecords = 0;
    let ignoredCount = 0;
    let mergedCount = 0;

    for (const t of baseResult.tables) {
      totalRecords += t.recordCount;
      const lowerName = t.name.toLowerCase();

      // Check if ignored
      if (
        IGNORED_TABLE_IDS.has(t.id) ||
        lowerName.includes('lưu trữ') ||
        lowerName.includes('mẫu cũ') ||
        lowerName.includes('(sample)')
      ) {
        ignoredCount++;
        tables.push({
          id: t.id,
          name: t.name,
          recordCount: t.recordCount,
          fieldCount: t.fields.length,
          isIgnored: true,
          ignoreReason: 'Bảng mẫu / bảng lưu trữ cũ không đưa vào schema NocoEdu'
        });
        continue;
      }

      // Check if attendance feedback
      if (
        ATTENDANCE_TABLE_IDS.has(t.id) ||
        lowerName.includes('nhận xét mỗi buổi') ||
        lowerName.includes('diem danh') ||
        lowerName.includes('điểm danh')
      ) {
        mergedCount++;
        recommendedMapping[t.id] = 'attendances_feedbacks';
        tables.push({
          id: t.id,
          name: t.name,
          recordCount: t.recordCount,
          fieldCount: t.fields.length,
          targetCollection: 'attendances_feedbacks',
          isIgnored: false,
          isMerged: true
        });
        continue;
      }

      // Match core domain tables
      let target = 'generic_' + t.id.substring(3, 8);
      if (t.id === 'tblvjJoqGcHsoxQr' || lowerName.includes('level') || lowerName.includes('cấp độ')) {
        target = 'levels';
      } else if (t.id === 'tblKvdbs97cDCMF9' || lowerName.includes('lophoc') || lowerName.includes('lớp')) {
        target = 'classes';
      } else if (t.id === 'tblmBDJ8bQSMqpNB' || lowerName.includes('giaovien') || lowerName.includes('giáo viên')) {
        target = 'teachers';
      } else if (t.id === 'tblv524wVlgIsH5H' || lowerName.includes('hocvien') || lowerName.includes('học viên')) {
        target = 'students';
      } else if (t.id === 'tbl324dOlvbf3BUu' || lowerName.includes('sách') || lowerName.includes('sach')) {
        target = 'books';
      } else if (t.id === 'tblU8nwesckl40Ff' || lowerName.includes('phát sách')) {
        target = 'book_deliveries';
      } else if (t.id === 'tblHp1PGPz52eZBz' || lowerName.includes('deal hp') || lowerName.includes('học phí')) {
        target = 'tuition_deals';
      } else if (t.id === 'tblxbcR8C6V4W8zJ' || lowerName.includes('deal book')) {
        target = 'book_orders';
      } else if (t.id === 'tblGDWScLLqgOR1W' || lowerName.includes('tổng deal') || lowerName.includes('order')) {
        target = 'orders';
      } else if (t.id === 'tblZUIXmpdt13j4x' || lowerName.includes('contact')) {
        target = 'crm_contacts';
      } else if (t.id === 'tbl2MF2cmS7CLEkb' || lowerName.includes('lead')) {
        target = 'crm_leads';
      } else if (t.id === 'tblW0ilugW7beQDp' || lowerName.includes('trial') || lowerName.includes('học thử')) {
        target = 'trial_lessons';
      } else if (t.id === 'tblHOPEfTzxCU2ff' || lowerName.includes('tương tác ph')) {
        target = 'parent_interactions';
      }

      recommendedMapping[t.id] = target;
      tables.push({
        id: t.id,
        name: t.name,
        recordCount: t.recordCount,
        fieldCount: t.fields.length,
        targetCollection: target,
        isIgnored: false
      });
    }

    return {
      tables,
      totalTables: baseResult.tables.length,
      totalRecords,
      ignoredCount,
      mergedCount,
      recommendedMapping
    };
  }

  /**
   * Transforms Lark Base data into standardized NocoEdu collections and records
   */
  public static mapToNocoEdu(baseResult: LarkBaseResult, anonymize = true): MappedDataSet {
    const tableById = new Map<string, LarkTable>(baseResult.tables.map(t => [t.id, t]));
    const data: Record<string, NocoRecord[]> = {
      levels: [],
      branches: [],
      teachers: [],
      parents: [],
      classes: [],
      students: [],
      books: [],
      tuition_deals: [],
      attendances_feedbacks: []
    };

    const ignoredTables: Array<{ id: string; name: string; reason: string }> = [];
    const mergedAttendanceSources: string[] = [];

    // 1. Process Levels (Khung cấp độ)
    const levelTable = this.findTable(baseResult, ['tblvjJoqGcHsoxQr', 'level', 'cấp độ']);
    if (levelTable) {
      for (const rec of levelTable.records) {
        const nameVal = this.getRecordText(rec, levelTable, ['tên', 'name', 'cấp độ', 'level']);
        data.levels.push({
          id: rec.id,
          name: nameVal || `Level ${rec.id.substring(3, 7)}`,
          code: this.getRecordText(rec, levelTable, ['mã', 'code']) || '',
          description: this.getRecordText(rec, levelTable, ['mô tả', 'ghi chú', 'description']) || ''
        });
      }
    } else {
      // Default fallback levels if not present
      data.levels.push(
        { id: 'lvl_intro', name: 'Nhập môn (Vỡ lòng)', code: 'INTRO', description: 'Học cơ bản luật cờ và nước đi' },
        { id: 'lvl_elem', name: 'Sơ cấp', code: 'ELEM', description: 'Đòn chiến thuật căn bản' },
        { id: 'lvl_inter', name: 'Trung cấp', code: 'INTER', description: 'Chiến lược và tàn cuộc' },
        { id: 'lvl_adv', name: 'Nâng cao / Đội tuyển', code: 'ADV', description: 'Khai cuộc sâu và thi đấu giải' }
      );
    }

    // 2. Process Branches (Cơ sở)
    // Often embedded in classes or contacts; create canonical branches
    data.branches.push(
      { id: 'br_kimlien', name: 'Cơ sở Kim Liên', address: 'Đống Đa, Hà Nội', phone: '0901234567' },
      { id: 'br_vinhphuc', name: 'Cơ sở Vĩnh Phúc', address: 'Ba Đình, Hà Nội', phone: '0901234568' }
    );

    // 3. Process Teachers (Giáo viên)
    const teacherTable = this.findTable(baseResult, ['tblmBDJ8bQSMqpNB', 'giaovien', 'giáo viên', 'teacher']);
    if (teacherTable) {
      for (const rec of teacherTable.records) {
        let name = this.getRecordText(rec, teacherTable, ['tên', 'name', 'họ và tên']);
        let phone = this.getRecordText(rec, teacherTable, ['điện thoại', 'phone', 'sđt']);
        let email = this.getRecordText(rec, teacherTable, ['email', 'thư điện tử']);

        if (anonymize) {
          name = name ? anonymizeName(name) : 'GV ' + rec.id.substring(3, 6);
          phone = phone ? this.maskPhone(phone) : '';
          email = email ? this.maskEmail(email) : '';
        }

        data.teachers.push({
          id: rec.id,
          name: name || 'Giáo viên',
          phone: phone || '',
          email: email || '',
          chess_title: this.getRecordText(rec, teacherTable, ['đẳng cấp', 'title', 'danh hiệu']) || 'HLV',
          status: 'active'
        });
      }
    }

    // 4. Process Classes (Lớp học)
    const classTable = this.findTable(baseResult, ['tblKvdbs97cDCMF9', 'lophoc', 'lớp học', 'class']);
    if (classTable) {
      for (const rec of classTable.records) {
        const name = this.getRecordText(rec, classTable, ['tên lớp', 'name', 'lớp']);
        const schedule = this.getRecordText(rec, classTable, ['lịch học', 'thứ', 'schedule', 'ngày']);
        const timeSlot = this.getRecordText(rec, classTable, ['ca học', 'giờ', 'time', 'khung giờ']);
        const branchVal = this.getRecordText(rec, classTable, ['cơ sở', 'branch', 'địa điểm']);
        const teacherVal = this.getRecordLink(rec, classTable, ['giáo viên', 'teacher', 'gv']);
        const levelVal = this.getRecordLink(rec, classTable, ['level', 'cấp độ', 'trình độ']);

        // Determine branchId
        let branchId = 'br_kimlien';
        if (branchVal && branchVal.toLowerCase().includes('vĩnh phúc')) {
          branchId = 'br_vinhphuc';
        }

        data.classes.push({
          id: rec.id,
          name: name || `Lớp ${rec.id.substring(3, 7)}`,
          schedule: schedule || 'Thứ 7 & Chủ Nhật',
          time_slot: timeSlot || '08:30 - 10:00',
          branch_id: branchId,
          teacher_id: teacherVal || (data.teachers[0]?.id as string) || null,
          level_id: levelVal || (data.levels[0]?.id as string) || null,
          status: 'active'
        });
      }
    }

    // 5. Extract Parents and Process Students (Phụ huynh & Học viên)
    const studentTable = this.findTable(baseResult, ['tblv524wVlgIsH5H', 'hocvien', 'học viên', 'student']);
    const parentPhoneMap = new Map<string, string>(); // phone/name -> parentId

    if (studentTable) {
      for (const rec of studentTable.records) {
        let studentName = this.getRecordText(rec, studentTable, ['học viên', 'họ và tên', 'tên học viên', 'tên']);
        let parentName = this.getRecordText(rec, studentTable, ['tên phụ huynh', 'phụ huynh', 'tên ph', 'mẹ', 'bố']);
        let phone = this.getRecordText(rec, studentTable, ['điện thoại', 'sđt', 'phone', 'số đt ph']);
        let email = this.getRecordText(rec, studentTable, ['email', 'thư điện tử']);
        const dob = this.getRecordText(rec, studentTable, ['ngày sinh', 'dob', 'birth']);
        const lichess = this.getRecordText(rec, studentTable, ['lichess', 'tài khoản lichess']);
        const chesskid = this.getRecordText(rec, studentTable, ['chesskid', 'tài khoản chesskid']);
        const classLink = this.getRecordLink(rec, studentTable, ['lớp', 'class', 'lớp học']);
        const levelLink = this.getRecordLink(rec, studentTable, ['level', 'cấp độ', 'trình độ']);

        // Parent extraction & deduplication
        let parentId: string | null = null;
        const parentKey = phone || (parentName ? parentName.toLowerCase().trim() : null);

        if (parentKey) {
          if (parentPhoneMap.has(parentKey)) {
            parentId = parentPhoneMap.get(parentKey)!;
          } else {
            parentId = `parent_${data.parents.length + 1}`;
            parentPhoneMap.set(parentKey, parentId);

            let cleanPName = parentName || (studentName ? `PH em ${studentName}` : 'Phụ huynh');
            let cleanPhone = phone || '';
            let cleanEmail = email || '';

            if (anonymize) {
              cleanPName = anonymizeName(cleanPName);
              cleanPhone = cleanPhone ? this.maskPhone(cleanPhone) : '';
              cleanEmail = cleanEmail ? this.maskEmail(cleanEmail) : '';
            }

            data.parents.push({
              id: parentId,
              name: cleanPName,
              phone: cleanPhone,
              email: cleanEmail,
              address: 'Hà Nội'
            });
          }
        }

        if (anonymize) {
          studentName = studentName ? anonymizeName(studentName) : 'HV ' + rec.id.substring(3, 7);
        }

        data.students.push({
          id: rec.id,
          name: studentName || 'Học viên',
          dob: dob || '2016-01-01',
          gender: 'other',
          lichess_username: lichess || '',
          chesskid_username: chesskid || '',
          class_id: classLink || (data.classes[0]?.id as string) || null,
          level_id: levelLink || (data.levels[0]?.id as string) || null,
          parent_id: parentId,
          status: 'studying'
        });
      }
    }

    // 6. Process Books (Sách)
    const bookTable = this.findTable(baseResult, ['tbl324dOlvbf3BUu', 'sách', 'sach', 'book']);
    if (bookTable) {
      for (const rec of bookTable.records) {
        const title = this.getRecordText(rec, bookTable, ['tên sách', 'tên', 'tiêu đề', 'title']);
        const code = this.getRecordText(rec, bookTable, ['mã sách', 'mã', 'code']);
        const price = this.getRecordNumber(rec, bookTable, ['giá', 'giá bán', 'price']);
        data.books.push({
          id: rec.id,
          title: title || 'Sách Cờ Vua',
          code: code || `B_${rec.id.substring(3, 7)}`,
          price: price || 100000,
          stock: 50
        });
      }
    }

    // 7. Process Tuition Deals (Hợp đồng & Gói học phí)
    const dealTable = this.findTable(baseResult, ['tblHp1PGPz52eZBz', 'deal hp', 'học phí', 'tuition']);
    if (dealTable) {
      for (const rec of dealTable.records) {
        const studentLink = this.getRecordLink(rec, dealTable, ['học viên', 'student', 'hv']);
        const regSessions = this.getRecordNumber(rec, dealTable, ['số buổi nộp', 'số buổi', 'sessions']) || 24;
        const fee = this.getRecordNumber(rec, dealTable, ['học phí', 'tiền nộp', 'fee', 'số tiền']) || 3600000;
        const dealDate = this.getRecordText(rec, dealTable, ['ngày nộp', 'ngày', 'date']) || '2025-01-15';
        const attended = this.getRecordNumber(rec, dealTable, ['số buổi đã học', 'đã học', 'attended']) || 0;
        const remaining = this.getRecordNumber(rec, dealTable, ['số buổi còn tồn', 'còn lại', 'remaining']) ?? (regSessions - attended);

        data.tuition_deals.push({
          id: rec.id,
          student_id: studentLink || (data.students[0]?.id as string) || null,
          registered_sessions: regSessions,
          tuition_fee: fee,
          deal_date: dealDate,
          remaining_sessions: Math.max(0, remaining),
          attended_sessions: attended,
          status: remaining <= 0 ? 'completed' : 'active'
        });
      }
    }

    // 8. Merge 3 Attendance Tables: 2024, 2025, 2026 Nhận xét mỗi buổi
    for (const t of baseResult.tables) {
      const lower = t.name.toLowerCase();

      // Check if ignored
      if (
        IGNORED_TABLE_IDS.has(t.id) ||
        lower.includes('lưu trữ') ||
        lower.includes('mẫu cũ') ||
        lower.includes('(sample)')
      ) {
        ignoredTables.push({
          id: t.id,
          name: t.name,
          reason: 'Bảng mẫu / bảng lưu trữ cũ không đưa vào schema NocoEdu'
        });
        continue;
      }

      // Check if attendance table
      if (
        ATTENDANCE_TABLE_IDS.has(t.id) ||
        lower.includes('nhận xét mỗi buổi') ||
        lower.includes('diem danh') ||
        lower.includes('điểm danh')
      ) {
        mergedAttendanceSources.push(`${t.name} (${t.id})`);

        for (const rec of t.records) {
          const studentLink = this.getRecordLink(rec, t, ['học viên', 'student', 'hv']);
          const classLink = this.getRecordLink(rec, t, ['lớp', 'class', 'lớp học']);
          const teacherLink = this.getRecordLink(rec, t, ['giáo viên', 'teacher', 'gv']);
          const rawDate = this.getRecordText(rec, t, ['ngày', 'ngày học', 'date', 'thời gian']);
          const rawPresent = this.getRecordRaw(rec, t, ['có mặt', 'trạng thái', 'status', 'điểm danh']);
          let feedback = this.getRecordText(rec, t, ['nhận xét', 'đánh giá', 'feedback', 'comment']);
          const homework = this.getRecordText(rec, t, ['bài tập', 'homework', 'btvn']);
          const score = this.getRecordNumber(rec, t, ['điểm', 'score']);

          // Standardize attendance status
          const status = this.normalizeAttendanceStatus(rawPresent);

          // Anonymize feedback content if it contains personal names
          if (anonymize && feedback) {
            feedback = feedback.replace(/(em\s+[A-ZÀ-Ỹ][a-zà-ỹ]+(\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*)/g, (match) => anonymizeName(match));
          }

          data.attendances_feedbacks.push({
            id: rec.id,
            student_id: studentLink || (data.students[0]?.id as string) || null,
            class_id: classLink || (data.classes[0]?.id as string) || null,
            teacher_id: teacherLink || (data.teachers[0]?.id as string) || null,
            session_date: this.normalizeDate(rawDate, rec.createdAt),
            status,
            feedback: feedback || '',
            homework: homework || '',
            homework_score: score ?? null
          });
        }
      }
    }

    // 9. Define NocoBase 3 Collections & Associations Schema
    const collections = this.buildCollectionDefinitions();

    const totalRecords = Object.values(data).reduce((acc, curr) => acc + curr.length, 0);

    return {
      collections,
      data,
      summary: {
        totalRecords,
        tableMapping: {
          'tblvjJoqGcHsoxQr': 'levels',
          'tblKvdbs97cDCMF9': 'classes',
          'tblmBDJ8bQSMqpNB': 'teachers',
          'tblv524wVlgIsH5H': 'students',
          'tbl324dOlvbf3BUu': 'books',
          'tblHp1PGPz52eZBz': 'tuition_deals',
          'tblprrzroE2NBli5': 'attendances_feedbacks',
          'tbluhrY4B8i63PAh': 'attendances_feedbacks',
          'tbl9TTf0m2EhWV3g': 'attendances_feedbacks'
        },
        ignoredTables,
        mergedTables: {
          target: 'attendances_feedbacks',
          sources: mergedAttendanceSources,
          recordCount: data.attendances_feedbacks.length
        }
      }
    };
  }

  /**
   * Builds NocoBase 3 Collections and Fields definitions
   */
  public static buildCollectionDefinitions(): NocoCollectionDefinition[] {
    return [
      {
        name: 'levels',
        title: 'Khung Cấp Độ (Levels)',
        description: 'Bảng danh mục các cấp độ đào tạo cờ vua',
        fields: [
          { name: 'name', type: 'string', title: 'Tên cấp độ' },
          { name: 'code', type: 'string', title: 'Mã cấp độ' },
          { name: 'description', type: 'text', title: 'Mô tả' }
        ]
      },
      {
        name: 'branches',
        title: 'Cơ Sở Đào Tạo (Branches)',
        description: 'Danh sách các cơ sở / điểm dạy',
        fields: [
          { name: 'name', type: 'string', title: 'Tên cơ sở' },
          { name: 'address', type: 'string', title: 'Địa chỉ' },
          { name: 'phone', type: 'string', title: 'Số điện thoại' }
        ]
      },
      {
        name: 'teachers',
        title: 'Giáo Viên & HLV (Teachers)',
        description: 'Hồ sơ huấn luyện viên và giáo viên cờ vua',
        fields: [
          { name: 'name', type: 'string', title: 'Họ và tên' },
          { name: 'phone', type: 'string', title: 'Số điện thoại' },
          { name: 'email', type: 'string', title: 'Email' },
          { name: 'chess_title', type: 'string', title: 'Đẳng cấp / Danh hiệu' },
          { name: 'status', type: 'string', title: 'Trạng thái' }
        ]
      },
      {
        name: 'parents',
        title: 'Phụ Huynh Học Viên (Parents)',
        description: 'Thông tin phụ huynh được chuẩn hóa từ danh sách học viên',
        fields: [
          { name: 'name', type: 'string', title: 'Tên phụ huynh' },
          { name: 'phone', type: 'string', title: 'Số điện thoại' },
          { name: 'email', type: 'string', title: 'Email' },
          { name: 'address', type: 'string', title: 'Địa chỉ' }
        ]
      },
      {
        name: 'classes',
        title: 'Lớp Học (Classes)',
        description: 'Danh sách lớp học, phân công giáo viên và cơ sở',
        fields: [
          { name: 'name', type: 'string', title: 'Tên lớp' },
          { name: 'schedule', type: 'string', title: 'Lịch học trong tuần' },
          { name: 'time_slot', type: 'string', title: 'Khung giờ' },
          { name: 'branch_id', type: 'belongsTo', title: 'Cơ sở', target: 'branches', foreignKey: 'branch_id' },
          { name: 'teacher_id', type: 'belongsTo', title: 'Giáo viên phụ trách', target: 'teachers', foreignKey: 'teacher_id' },
          { name: 'level_id', type: 'belongsTo', title: 'Cấp độ lớp', target: 'levels', foreignKey: 'level_id' },
          { name: 'status', type: 'string', title: 'Trạng thái' }
        ]
      },
      {
        name: 'students',
        title: 'Học Viên (Students)',
        description: 'Hồ sơ học viên cờ vua',
        fields: [
          { name: 'name', type: 'string', title: 'Họ và tên' },
          { name: 'dob', type: 'date', title: 'Ngày sinh' },
          { name: 'gender', type: 'string', title: 'Giới tính' },
          { name: 'lichess_username', type: 'string', title: 'Tài khoản Lichess' },
          { name: 'chesskid_username', type: 'string', title: 'Tài khoản Chesskid' },
          { name: 'class_id', type: 'belongsTo', title: 'Lớp học hiện tại', target: 'classes', foreignKey: 'class_id' },
          { name: 'level_id', type: 'belongsTo', title: 'Cấp độ', target: 'levels', foreignKey: 'level_id' },
          { name: 'parent_id', type: 'belongsTo', title: 'Phụ huynh', target: 'parents', foreignKey: 'parent_id' },
          { name: 'status', type: 'string', title: 'Trạng thái học' }
        ]
      },
      {
        name: 'books',
        title: 'Học Liệu & Sách (Books)',
        description: 'Danh mục sách bài tập và tài liệu cờ vua',
        fields: [
          { name: 'title', type: 'string', title: 'Tên sách' },
          { name: 'code', type: 'string', title: 'Mã sách' },
          { name: 'price', type: 'number', title: 'Đơn giá' },
          { name: 'stock', type: 'integer', title: 'Tồn kho' }
        ]
      },
      {
        name: 'tuition_deals',
        title: 'Gói Học Phí (Tuition Deals)',
        description: 'Hợp đồng đăng ký số buổi và học phí đã nộp',
        fields: [
          { name: 'student_id', type: 'belongsTo', title: 'Học viên', target: 'students', foreignKey: 'student_id' },
          { name: 'registered_sessions', type: 'integer', title: 'Số buổi đăng ký' },
          { name: 'tuition_fee', type: 'number', title: 'Học phí đã nộp' },
          { name: 'deal_date', type: 'date', title: 'Ngày đăng ký' },
          { name: 'remaining_sessions', type: 'integer', title: 'Số buổi còn tồn' },
          { name: 'attended_sessions', type: 'integer', title: 'Số buổi đã học' },
          {
            name: 'status',
            type: 'string',
            title: 'Trạng thái gói',
            uiSchema: {
              title: 'Trạng thái',
              type: 'string',
              'x-component': 'Select',
              enum: [
                { value: 'active', label: 'Đang hoạt động', color: 'green' },
                { value: 'completed', label: 'Đã hoàn thành', color: 'blue' },
                { value: 'expired', label: 'Hết hạn', color: 'red' }
              ]
            }
          }
        ]
      },
      {
        name: 'attendances_feedbacks',
        title: 'Điểm Danh & Nhận Xét (Attendances & Feedbacks)',
        description: 'Bảng hợp nhất 3 năm (2024-2026) ghi nhận chuyên cần và nhận xét',
        fields: [
          { name: 'student_id', type: 'belongsTo', title: 'Học viên', target: 'students', foreignKey: 'student_id' },
          { name: 'class_id', type: 'belongsTo', title: 'Lớp học', target: 'classes', foreignKey: 'class_id' },
          { name: 'teacher_id', type: 'belongsTo', title: 'Giáo viên', target: 'teachers', foreignKey: 'teacher_id' },
          { name: 'session_date', type: 'date', title: 'Ngày học' },
          {
            name: 'status',
            type: 'string',
            title: 'Trạng thái điểm danh',
            uiSchema: {
              title: 'Điểm danh',
              type: 'string',
              'x-component': 'Select',
              enum: [
                { value: 'present', label: 'Có mặt', color: 'green' },
                { value: 'absent_excused', label: 'Vắng có phép', color: 'orange' },
                { value: 'absent_unexcused', label: 'Vắng không phép', color: 'red' },
                { value: 'late', label: 'Đi muộn', color: 'yellow' }
              ]
            }
          },
          { name: 'feedback', type: 'text', title: 'Nhận xét buổi học' },
          { name: 'homework', type: 'string', title: 'Bài tập về nhà' },
          { name: 'homework_score', type: 'number', title: 'Điểm bài tập' }
        ]
      }
    ];
  }

  // --- Helper Methods ---

  private static findTable(baseResult: LarkBaseResult, candidates: string[]): LarkTable | undefined {
    for (const t of baseResult.tables) {
      const lower = t.name.toLowerCase();
      for (const c of candidates) {
        if (t.id === c || lower.includes(c.toLowerCase())) {
          return t;
        }
      }
    }
    return undefined;
  }

  private static getRecordText(rec: LarkRecord, table: LarkTable, fieldKeywords: string[]): string {
    const fld = this.findField(table, fieldKeywords);
    if (!fld) return '';
    const val = rec.cells[fld.id];
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.trim();
    if (Array.isArray(val)) {
      return val.map(item => (typeof item === 'object' && item && 'text' in item ? String(item.text) : String(item))).join(', ').trim();
    }
    return String(val).trim();
  }

  private static getRecordRaw(rec: LarkRecord, table: LarkTable, fieldKeywords: string[]): unknown {
    const fld = this.findField(table, fieldKeywords);
    if (!fld) return undefined;
    return rec.cells[fld.id];
  }

  private static getRecordNumber(rec: LarkRecord, table: LarkTable, fieldKeywords: string[]): number | null {
    const fld = this.findField(table, fieldKeywords);
    if (!fld) return null;
    const val = rec.cells[fld.id];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(/,/g, ''));
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  private static getRecordLink(rec: LarkRecord, table: LarkTable, fieldKeywords: string[]): string | null {
    const fld = this.findField(table, fieldKeywords);
    if (!fld) return null;
    const val = rec.cells[fld.id];
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first && 'id' in first) return String(first.id);
      if (typeof first === 'object' && first && 'recordId' in first) return String(first.recordId);
    }
    if (typeof val === 'string') return val;
    return null;
  }

  private static findField(table: LarkTable, keywords: string[]) {
    for (const k of keywords) {
      const target = k.toLowerCase().trim();
      const exact = table.fields.find(f => f.name.toLowerCase().trim() === target);
      if (exact) return exact;
    }
    for (const k of keywords) {
      const target = k.toLowerCase().trim();
      const partial = table.fields.find(f => f.name.toLowerCase().trim().includes(target));
      if (partial) return partial;
    }
    return undefined;
  }

  private static normalizeAttendanceStatus(raw: unknown): string {
    if (raw === '1' || raw === 1 || raw === true) return 'present';
    if (raw === '0' || raw === 0 || raw === false) return 'absent_excused';
    if (typeof raw === 'string') {
      const l = raw.toLowerCase();
      if (l.includes('có mặt') || l.includes('present') || l.includes('đủ')) return 'present';
      if (l.includes('có phép') || l.includes('phép')) return 'absent_excused';
      if (l.includes('không phép') || l.includes('nghỉ')) return 'absent_unexcused';
      if (l.includes('muộn') || l.includes('late')) return 'late';
    }
    return 'present'; // Default
  }

  private static normalizeDate(rawDate: string, createdAtTimestamp?: number): string {
    if (rawDate) {
      // If timestamp
      if (/^\d{10,13}$/.test(rawDate.trim())) {
        const ms = rawDate.length === 10 ? parseInt(rawDate, 10) * 1000 : parseInt(rawDate, 10);
        return new Date(ms).toISOString().split('T')[0];
      }
      // If date string YYYY-MM-DD or DD/MM/YYYY
      const dmy = rawDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
      if (dmy) {
        const [, d, m, y] = dmy;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const ymd = rawDate.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
      if (ymd) {
        const [, y, m, d] = ymd;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    if (createdAtTimestamp) {
      return new Date(createdAtTimestamp).toISOString().split('T')[0];
    }
    return new Date().toISOString().split('T')[0];
  }

  private static maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      return digits.substring(0, 3) + '****' + digits.substring(digits.length - 3);
    }
    return '090****000';
  }

  private static maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length === 2) {
      const name = parts[0];
      const maskedName = name.length > 2 ? name.substring(0, 2) + '***' : '***';
      return `${maskedName}@${parts[1]}`;
    }
    return 'anon@nocoedu.local';
  }
}
