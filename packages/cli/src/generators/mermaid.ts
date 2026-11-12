import { type LarkTable, LarkFieldType } from '@duongsinh/lark-base-core';

function sanitizeEntityName(name: string, id: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return clean.length > 0 ? clean : `Tbl_${id.substring(3, 10)}`;
}

export function generateMermaidErDiagram(tables: LarkTable[]): string {
  const tableById = new Map(tables.map(t => [t.id, t]));
  const entityNameMap = new Map<string, string>();
  const lines: string[] = ['```mermaid', 'erDiagram'];

  // Map each table to a safe ASCII entity name
  const usedNames = new Set<string>();
  for (const t of tables) {
    let base = sanitizeEntityName(t.name, t.id);
    let candidate = base;
    let counter = 1;
    while (usedNames.has(candidate)) {
      candidate = `${base}_${counter++}`;
    }
    usedNames.add(candidate);
    entityNameMap.set(t.id, candidate);
  }

  // Relations set to avoid duplicates
  const seenRelations = new Set<string>();

  for (const t of tables) {
    const sourceEntity = entityNameMap.get(t.id)!;
    for (const f of t.fields) {
      if (f.type === LarkFieldType.SingleLink || f.type === LarkFieldType.DuplexLink) {
        const targetTableId = f.linkTableId || (f.property?.tableId as string);
        if (targetTableId && tableById.has(targetTableId)) {
          const targetEntity = entityNameMap.get(targetTableId)!;
          const relKey = `${sourceEntity}-->${targetEntity}:${f.name}`;
          if (!seenRelations.has(relKey)) {
            seenRelations.add(relKey);
            // Relationship: source }o--|| target
            lines.push(`    ${sourceEntity} }o--|| ${targetEntity} : "${f.name.replace(/"/g, "'")}"`);
          }
        }
      } else if (f.type === LarkFieldType.Lookup) {
        const targetTableId = f.lookup?.targetTableId;
        if (targetTableId && tableById.has(targetTableId)) {
          const targetEntity = entityNameMap.get(targetTableId)!;
          const relKey = `${sourceEntity}..>${targetEntity}:${f.name}`;
          if (!seenRelations.has(relKey)) {
            seenRelations.add(relKey);
            lines.push(`    ${sourceEntity} }o..|| ${targetEntity} : "lookup: ${f.name.replace(/"/g, "'")}"`);
          }
        }
      }
    }
  }

  // Define key fields for prominent tables
  for (const t of tables) {
    const ent = entityNameMap.get(t.id)!;
    lines.push(`    ${ent} {`);
    lines.push(`        string record_id PK "Khoá chính bản ghi"`);
    // List up to 6 representative fields
    for (const f of t.fields.slice(0, 6)) {
      const fieldSafe = f.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .toLowerCase() || f.id;
      lines.push(`        ${f.typeName.toLowerCase()} ${fieldSafe} "${f.name.replace(/"/g, "'")}"`);
    }
    lines.push(`    }`);
  }

  lines.push('```');
  return lines.join('\n');
}
