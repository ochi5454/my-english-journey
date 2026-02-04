import { test, expect } from '@playwright/test';

/**
 * ログイン機能のE2Eテスト
 */
test.describe('Login Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('displays login form', async ({ page }) => {
    // ログインフォームの要素が表示されているか確認
    await expect(page.getByRole('heading', { name: /ログイン/i })).toBeVisible();
    await expect(page.getByLabel(/メールアドレス/i)).toBeVisible();
    await expect(page.getByLabel(/パスワード/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /ログイン/i })).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    // 無効な認証情報を入力
    await page.getByLabel(/メールアドレス/i).fill('invalid@example.com');
    await page.getByLabel(/パスワード/i).fill('wrongpassword');

    // ログインボタンをクリック
    await page.getByRole('button', { name: /ログイン/i }).click();

    // エラーメッセージが表示されることを確認
    await expect(page.getByText(/認証|エラー|失敗/i)).toBeVisible();
  });

  test('successful login redirects to home', async ({ page }) => {
    // 有効な認証情報を入力（テスト用の管理者アカウント）
    await page.getByLabel(/メールアドレス/i).fill('admin');
    await page.getByLabel(/パスワード/i).fill('admin123!');

    // ログインボタンをクリック
    await page.getByRole('button', { name: /ログイン/i }).click();

    // ホームページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/(home|dashboard)?$/);
  });

  test('Microsoft login button is present', async ({ page }) => {
    // Microsoft ログインボタンが表示されているか確認
    const msButton = page.getByRole('button', { name: /microsoft/i });
    await expect(msButton).toBeVisible();
  });
});
