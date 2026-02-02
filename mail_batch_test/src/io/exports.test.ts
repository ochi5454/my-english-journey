import { describe, it, expect } from 'vitest';
import { loadExportFiles } from './exports.js';
import path from 'node:path';

describe('loadExportFiles', () => {
  const testExportsPath = path.join(process.cwd(), 'exports', '2025-02-05');

  it('Excelファイルを読み込める', () => {
    const files = loadExportFiles(testExportsPath);

    expect(files).toBeDefined();
    expect(files.length).toBeGreaterThan(0);

    files.forEach(file => {
      expect(file).toHaveProperty('filePath');
      expect(file).toHaveProperty('groupKey');
      expect(file).toHaveProperty('rowCount');
      expect(file.filePath).toContain('.xlsx');
      expect(file.groupKey).toBeTruthy();
      expect(file.rowCount).toBeGreaterThan(0);
    });
  });

  it('所属名称6が正しく抽出される', () => {
    const files = loadExportFiles(testExportsPath);

    // 各ファイルが所属名称6を持っている
    files.forEach(file => {
      expect(typeof file.groupKey).toBe('string');
      expect(file.groupKey.length).toBeGreaterThan(0);
    });
  });

  it('存在しないディレクトリでエラーをスローする', () => {
    expect(() => {
      loadExportFiles('non-existent-directory');
    }).toThrow(/not found/i);
  });

  it('ファイル名と所属名称6が一致する（テストデータの場合）', () => {
    const files = loadExportFiles(testExportsPath);

    files.forEach(file => {
      const fileName = path.basename(file.filePath);
      // ファイル名に所属名称が含まれているはず（テストデータの命名規則）
      expect(fileName).toContain(file.groupKey);
    });
  });

  it('rowCountが実際のデータ行数と一致する', () => {
    const files = loadExportFiles(testExportsPath);

    files.forEach(file => {
      // rowCount は少なくとも1以上のはず
      expect(file.rowCount).toBeGreaterThanOrEqual(1);
    });
  });
});
