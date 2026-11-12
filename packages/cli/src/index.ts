import { Command } from 'commander';
import { inspectCommand } from './commands/inspect.js';
import { schemaCommand } from './commands/schema.js';
import { exportCommand } from './commands/export.js';
import { diffCommand } from './commands/diff.js';

const program = new Command();

program
  .name('lark-base')
  .description('Lark Base (.base) extraction, inspection, schema mapping and export toolkit')
  .version('0.1.0');

program
  .command('inspect')
  .description('Inspect Lark Base file structure, tables, field types and sensitive column warnings')
  .argument('<file>', 'Path to .base file')
  .action(async (file: string) => {
    await inspectCommand(file);
  });

program
  .command('schema')
  .description('Generate schema.md (with Mermaid ERD), quy-tac.md, automations.md, and schema.json')
  .argument('<file>', 'Path to .base file')
  .requiredOption('--out <dir>', 'Output directory for schema files')
  .action(async (file: string, options: { out: string }) => {
    await schemaCommand(file, options);
  });

program
  .command('export')
  .description('Export tables to JSON, CSV, or SQLite using export profiles (with anonymization)')
  .argument('<file>', 'Path to .base file')
  .requiredOption('--out <dir>', 'Output directory')
  .option('--format <format>', 'Export format: json, csv, sqlite', 'csv')
  .option('--profile <name>', 'Export profile (built-in "anonymized" or path to YAML profile)', 'anonymized')
  .action(async (file: string, options: { out: string; format: 'json' | 'csv' | 'sqlite'; profile?: string }) => {
    await exportCommand(file, options);
  });

program
  .command('diff')
  .description('Compare structural differences and record count delta between two .base files')
  .argument('<fileA>', 'Original .base file')
  .argument('<fileB>', 'New .base file')
  .action(async (fileA: string, fileB: string) => {
    await diffCommand(fileA, fileB);
  });

program.parse();
