import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { ExportFile } from '../types.js';

const GROUP_HEADER = '所属名称6';

export const loadExportFiles = (dirPath: string): ExportFile[] => {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`Export directory not found: ${dirPath}`);
  }

  const entries = fs.readdirSync(dirPath);
  const files = entries.filter((f) => f.toLowerCase().endsWith('.xlsx'));
  if (!files.length) throw new Error(`No .xlsx files found in ${dirPath}`);

  const exportFiles: ExportFile[] = [];

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stats = fs.statSync(fullPath);
    if (stats.size === 0) {
      throw new Error(`File is empty: ${file}`);
    }

    const workbook = XLSX.readFile(fullPath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error(`No sheet found in file: ${file}`);
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', blankrows: false });
    if (!rows.length) throw new Error(`No data rows in file: ${file}`);

    const groupValues = new Set<string>();
    for (const row of rows) {
      const groupKey = String(row[GROUP_HEADER] ?? '').trim();
      if (groupKey) groupValues.add(groupKey);
      if (groupValues.size > 1) {
        throw new Error(`Multiple group keys found in file: ${file}`);
      }
    }

    if (!groupValues.size) {
      throw new Error(`Group key not found in file: ${file}`);
    }

    exportFiles.push({
      filePath: fullPath,
      groupKey: [...groupValues][0],
      rowCount: rows.length,
    });
  }

  return exportFiles;
};
