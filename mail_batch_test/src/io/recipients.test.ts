import { describe, it, expect } from 'vitest';
import { loadRecipients } from './recipients.js';
import path from 'node:path';

describe('loadRecipients', () => {
  const testDataPath = path.join(process.cwd(), 'data', 'recipients.xlsx');

  it('正常な宛先マスタを読み込める', () => {
    const recipients = loadRecipients(testDataPath);

    expect(recipients).toBeDefined();
    expect(recipients.length).toBeGreaterThan(0);

    // 各レコードが必要なプロパティを持っているか確認
    recipients.forEach(recipient => {
      expect(recipient).toHaveProperty('groupKey');
      expect(recipient).toHaveProperty('email');
      expect(recipient.groupKey).toBeTruthy();
      expect(recipient.email).toBeTruthy();
    });
  });

  it('所属名称6でグルーピングできる', () => {
    const recipients = loadRecipients(testDataPath);

    const groupedByDept = recipients.reduce((acc, r) => {
      if (!acc[r.groupKey]) acc[r.groupKey] = [];
      acc[r.groupKey].push(r);
      return acc;
    }, {} as Record<string, typeof recipients>);

    // 複数の部署が存在することを確認
    expect(Object.keys(groupedByDept).length).toBeGreaterThan(0);
  });

  it('存在しないファイルでエラーをスローする', () => {
    expect(() => {
      loadRecipients('non-existent-file.xlsx');
    }).toThrow(/not found/i);
  });

  it('メールアドレスが有効な形式である', () => {
    const recipients = loadRecipients(testDataPath);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    recipients.forEach(recipient => {
      expect(recipient.email).toMatch(emailRegex);
    });
  });

  it('重複したレコードが除去されている', () => {
    const recipients = loadRecipients(testDataPath);

    const uniqueKeys = new Set(
      recipients.map(r => `${r.groupKey}::${r.email.toLowerCase()}`)
    );

    // Set のサイズと配列の長さが同じ = 重複なし
    expect(uniqueKeys.size).toBe(recipients.length);
  });
});
