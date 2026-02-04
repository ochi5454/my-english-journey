#!/usr/bin/env tsx
import XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';

// テスト用宛先マスタを作成
const createRecipientsMaster = () => {
  const recipients = [
    { '所属名称6': '営業本部', 'メールアドレス': 'sales1@example.com', '氏名': '山田太郎', '備考': '部長' },
    { '所属名称6': '営業本部', 'メールアドレス': 'sales2@example.com', '氏名': '佐藤花子', '備考': '課長' },
    { '所属名称6': '開発部', 'メールアドレス': 'dev1@example.com', '氏名': '鈴木一郎', '備考': '' },
    { '所属名称6': '開発部', 'メールアドレス': 'dev2@example.com', '氏名': '田中次郎', '備考': '' },
    { '所属名称6': '開発部', 'メールアドレス': 'dev3@example.com', '氏名': '高橋三郎', '備考': 'リーダー' },
    { '所属名称6': '総務部', 'メールアドレス': 'admin1@example.com', '氏名': '伊藤四郎', '備考': '' },
  ];

  const ws = XLSX.utils.json_to_sheet(recipients);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const outputPath = path.join('data', 'recipients.xlsx');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(wb, outputPath);
  console.log(`✓ Created: ${outputPath}`);
};

// テスト用送信対象Excelファイルを作成
const createExportFiles = (date: string) => {
  const exportsDir = path.join('exports', date);
  fs.mkdirSync(exportsDir, { recursive: true });

  // 営業本部用ファイル
  const salesData = [
    { '所属名称6': '営業本部', '氏名': '社員A', '実所定外時間': 10.5 },
    { '所属名称6': '営業本部', '氏名': '社員B', '実所定外時間': 15.0 },
    { '所属名称6': '営業本部', '氏名': '社員C', '実所定外時間': 8.5 },
  ];
  const salesWs = XLSX.utils.json_to_sheet(salesData);
  const salesWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(salesWb, salesWs, 'Sheet1');
  const salesPath = path.join(exportsDir, '営業本部_20250205.xlsx');
  XLSX.writeFile(salesWb, salesPath);
  console.log(`✓ Created: ${salesPath}`);

  // 開発部用ファイル
  const devData = [
    { '所属名称6': '開発部', '氏名': '開発者A', '実所定外時間': 20.0 },
    { '所属名称6': '開発部', '氏名': '開発者B', '実所定外時間': 25.5 },
    { '所属名称6': '開発部', '氏名': '開発者C', '実所定外時間': 18.0 },
    { '所属名称6': '開発部', '氏名': '開発者D', '実所定外時間': 22.5 },
  ];
  const devWs = XLSX.utils.json_to_sheet(devData);
  const devWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(devWb, devWs, 'Sheet1');
  const devPath = path.join(exportsDir, '開発部_20250205.xlsx');
  XLSX.writeFile(devWb, devPath);
  console.log(`✓ Created: ${devPath}`);

  // 総務部用ファイル
  const adminData = [
    { '所属名称6': '総務部', '氏名': '総務A', '実所定外時間': 12.0 },
    { '所属名称6': '総務部', '氏名': '総務B', '実所定外時間': 9.5 },
  ];
  const adminWs = XLSX.utils.json_to_sheet(adminData);
  const adminWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(adminWb, adminWs, 'Sheet1');
  const adminPath = path.join(exportsDir, '総務部_20250205.xlsx');
  XLSX.writeFile(adminWb, adminPath);
  console.log(`✓ Created: ${adminPath}`);
};

// メイン処理
const main = () => {
  console.log('Creating test data files...\n');

  createRecipientsMaster();
  createExportFiles('2025-02-05');

  console.log('\n✓ All test data files created successfully!');
};

main();
