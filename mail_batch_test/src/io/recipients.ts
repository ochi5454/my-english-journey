import fs from 'node:fs';
import XLSX from 'xlsx';
import { Recipient } from '../types.js';

const REQUIRED_HEADERS = ['所属名称6', 'メールアドレス'] as const;

export const loadRecipients = (filePath: string): Recipient[] => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Recipients file not found: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheet found in recipients file');
  const sheet = workbook.Sheets[sheetName];

  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0, blankrows: false }) as any[];
  const headers: string[] = headerRow[0] || [];
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Missing required headers in recipients.xlsx: ${missing.join(', ')}`);
  }

  const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', blankrows: false });
  const seen = new Set<string>();
  const recipients: Recipient[] = [];

  for (const row of json) {
    const groupKey = String(row['所属名称6'] ?? '').trim();
    const email = String(row['メールアドレス'] ?? '').trim();
    if (!groupKey || !email) continue;
    const dupKey = `${groupKey}::${email.toLowerCase()}`;
    if (seen.has(dupKey)) continue;
    seen.add(dupKey);
    recipients.push({ groupKey, email });
  }

  if (!recipients.length) {
    throw new Error('No recipients found after validation');
  }

  return recipients;
};
