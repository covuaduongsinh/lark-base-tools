import { compressGzipBase64 } from './parser.js';
import { LarkFieldType } from './types.js';

export interface FixtureOptions {
  baseName?: string;
  tables?: Array<{
    id: string;
    name: string;
    fields: Array<{
      id: string;
      name: string;
      type: number;
      property?: Record<string, unknown>;
    }>;
    records?: Array<Record<string, unknown>>;
  }>;
}

/**
 * Builds a valid Lark Base mock object / string with gzip-compressed base64 snapshots
 */
export function buildFixture(options: FixtureOptions = {}): string {
  const baseId = 1234567890;
  const baseName = options.baseName || 'CLB Test Base';

  const defaultTables = options.tables || [
    {
      id: 'tblClass',
      name: 'LopHoc',
      fields: [
        { id: 'fldClassName', name: 'Tên lớp', type: LarkFieldType.Text },
        {
          id: 'fldBranch',
          name: 'Cơ sở',
          type: LarkFieldType.SingleSelect,
          property: {
            options: [
              { id: 'opt1', name: 'Kim Liên' },
              { id: 'opt2', name: 'Vĩnh Phúc' }
            ]
          }
        }
      ],
      records: [
        { fldClassName: [{ text: 'Lớp Cờ 1', type: 'text' }], fldBranch: 'opt1' },
        { fldClassName: [{ text: 'Lớp Cờ 2', type: 'text' }], fldBranch: 'opt2' }
      ]
    },
    {
      id: 'tblStudent',
      name: 'HocVien',
      fields: [
        { id: 'fldName', name: 'Họ và tên', type: LarkFieldType.Text },
        { id: 'fldPhone', name: 'Số điện thoại', type: LarkFieldType.Phone },
        { id: 'fldEmail', name: 'Email phụ huynh', type: LarkFieldType.Text },
        { id: 'fldCccd', name: 'Mã định danh (CCCD)', type: LarkFieldType.Number },
        {
          id: 'fldClassLink',
          name: 'Lớp học',
          type: LarkFieldType.SingleLink,
          property: { tableId: 'tblClass' }
        },
        {
          id: 'fldAutoId',
          name: 'Mã học viên',
          type: LarkFieldType.AutoNumber,
          property: {}
        }
      ],
      records: [
        {
          fldName: [{ text: 'Nguyễn Văn An', type: 'text' }],
          fldPhone: { fullPhoneNum: '0901234567' },
          fldEmail: [{ text: 'parent@example.com', type: 'text' }],
          fldCccd: 123456789012,
          fldClassLink: ['recClass1'],
          fldAutoId: [{ sequence: 'HV001', number: '1' }]
        }
      ]
    }
  ];

  const tableMap: Record<string, { id: string; name: string }> = {};
  for (const t of defaultTables) {
    tableMap[t.id] = { id: t.id, name: t.name };
  }

  const snapshotElements: unknown[] = [];

  for (let i = 0; i < defaultTables.length; i++) {
    const t = defaultTables[i];
    const fieldMap: Record<string, unknown> = {};
    for (const f of t.fields) {
      fieldMap[f.id] = {
        name: f.name,
        type: f.type,
        property: f.property || {}
      };
    }

    const recordMap: Record<string, unknown> = {};
    if (t.records) {
      t.records.forEach((rec, idx) => {
        const rid = `rec_${t.id}_${idx + 1}`;
        const cells: Record<string, unknown> = {};
        for (const [fid, val] of Object.entries(rec)) {
          cells[fid] = {
            value: val,
            modifiedTime: Date.now()
          };
        }
        recordMap[rid] = cells;
      });
    }

    const element: Record<string, unknown> = {
      schema: {
        data: {
          table: {
            meta: { id: t.id, name: '', recordsNum: t.records ? t.records.length : 0 },
            fieldMap,
            primaryKey: t.fields[0]?.id
          },
          recordMap
        }
      }
    };

    if (i === 0) {
      (element.schema as Record<string, unknown>).base = { id: baseId, name: baseName };
      (element.schema as Record<string, unknown>).tableMap = tableMap;
    }

    snapshotElements.push(element);
  }

  const gzipSnapshot = compressGzipBase64(snapshotElements);
  const gzipAutomation = compressGzipBase64([
    {
      id: 101,
      trigger_name: 'setRecord',
      status: 1,
      WorkflowExtra: JSON.stringify({ title: 'Gửi thông báo điểm danh' })
    }
  ]);
  const gzipDashboard = compressGzipBase64([
    {
      id: 201,
      name: 'Thống kê sĩ số'
    }
  ]);
  const gzipBaseRole = compressGzipBase64({
    role_admin: { name: 'Admin' },
    role_teacher: { name: 'Giáo viên' }
  });

  const outer = {
    gzipSnapshot,
    gzipAutomation,
    gzipDashboard,
    gzipBaseRole,
    sign: 'mock_sign'
  };

  return JSON.stringify(outer, null, 2);
}
