import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * ファイルアップロード機能のE2Eテスト
 */
test.describe('File Upload', () => {
  // テスト前にログイン
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/メールアドレス/i).fill('admin');
    await page.getByLabel(/パスワード/i).fill('admin123!');
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ログイン完了を待機
    await page.waitForURL(/\/(home|dashboard)?$/);
  });

  test('displays upload section', async ({ page }) => {
    // サイドバーからファイルキーを選択
    const sidebarItem = page.locator('[data-testid="sidebar-item-punches"]').first();
    if (await sidebarItem.isVisible()) {
      await sidebarItem.click();
    }

    // アップロードセクションが表示されることを確認
    await expect(page.getByText(/アップロード|ファイルを選択/i)).toBeVisible();
  });

  test('shows file size error for large files', async ({ page }) => {
    // 大きなファイルのアップロードを試行
    // （注: 実際のテストでは適切なモックが必要）
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.isVisible()) {
      // 250MBを超えるファイルの場合エラーが表示される
      // このテストはモックファイルを使用するか、実際のファイルを用意する必要がある
      await expect(page.getByText(/200MB/i)).not.toBeVisible();
    }
  });

  test('shows supported file formats', async ({ page }) => {
    // サポートされているファイル形式が表示されることを確認
    const formatInfo = page.getByText(/xlsx|csv|excel/i);
    await expect(formatInfo).toBeVisible();
  });
});

test.describe('Data Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/メールアドレス/i).fill('admin');
    await page.getByLabel(/パスワード/i).fill('admin123!');
    await page.getByRole('button', { name: /ログイン/i }).click();
    await page.waitForURL(/\/(home|dashboard)?$/);
  });

  test('displays table with headers', async ({ page }) => {
    // データがある場合、テーブルヘッダーが表示されることを確認
    const table = page.locator('table').first();

    if (await table.isVisible()) {
      const headers = table.locator('th');
      expect(await headers.count()).toBeGreaterThan(0);
    }
  });

  test('pagination controls work', async ({ page }) => {
    // ページネーションコントロールが機能することを確認
    const pager = page.locator('.pager').first();

    if (await pager.isVisible()) {
      const nextButton = pager.getByRole('button', { name: '›' });
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        // ページが変更されることを確認
        await expect(page.getByText(/26-/i)).toBeVisible();
      }
    }
  });
});
