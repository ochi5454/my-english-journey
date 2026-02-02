import { describe, it, expect } from 'vitest';
import { buildPlan } from './planner.js';
import { ExportFile, Recipient } from '../types.js';

describe('buildPlan', () => {
  const mockRecipients: Recipient[] = [
    { groupKey: '営業本部', email: 'sales1@example.com' },
    { groupKey: '営業本部', email: 'sales2@example.com' },
    { groupKey: '開発部', email: 'dev1@example.com' },
  ];

  const mockExports: ExportFile[] = [
    { filePath: 'exports/営業本部.xlsx', groupKey: '営業本部', rowCount: 5 },
    { filePath: 'exports/開発部.xlsx', groupKey: '開発部', rowCount: 3 },
    { filePath: 'exports/総務部.xlsx', groupKey: '総務部', rowCount: 2 },
  ];

  it('配送計画を生成できる', () => {
    const plan = buildPlan('2025-02-05', mockExports, mockRecipients);

    expect(plan).toHaveProperty('runDate');
    expect(plan).toHaveProperty('tasks');
    expect(plan).toHaveProperty('warnings');
    expect(plan.runDate).toBe('2025-02-05');
    expect(plan.tasks.length).toBe(3);
  });

  it('所属名称6とファイルが正しくマッチングされる', () => {
    const plan = buildPlan('2025-02-05', mockExports, mockRecipients);

    const salesTask = plan.tasks.find(t => t.groupKey === '営業本部');
    expect(salesTask).toBeDefined();
    expect(salesTask!.recipients.length).toBe(2);

    const devTask = plan.tasks.find(t => t.groupKey === '開発部');
    expect(devTask).toBeDefined();
    expect(devTask!.recipients.length).toBe(1);
  });

  it('宛先が見つからない場合に警告を出す', () => {
    const plan = buildPlan('2025-02-05', mockExports, mockRecipients);

    // 総務部は宛先がないので警告があるはず
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(plan.warnings.some(w => w.includes('総務部'))).toBe(true);
  });

  it('各タスクが正しい情報を持つ', () => {
    const plan = buildPlan('2025-02-05', mockExports, mockRecipients);

    plan.tasks.forEach(task => {
      expect(task).toHaveProperty('groupKey');
      expect(task).toHaveProperty('filePath');
      expect(task).toHaveProperty('recipients');
      expect(task).toHaveProperty('rowCount');
      expect(Array.isArray(task.recipients)).toBe(true);
      expect(typeof task.rowCount).toBe('number');
    });
  });

  it('空の宛先リストでも計画を生成できる', () => {
    const plan = buildPlan('2025-02-05', mockExports, []);

    expect(plan.tasks.length).toBe(3);
    plan.tasks.forEach(task => {
      expect(task.recipients.length).toBe(0);
    });
    expect(plan.warnings.length).toBe(3); // すべてのファイルで警告
  });

  it('空のエクスポートファイルリストでも計画を生成できる', () => {
    const plan = buildPlan('2025-02-05', [], mockRecipients);

    expect(plan.tasks.length).toBe(0);
    expect(plan.warnings.length).toBe(0);
  });
});
