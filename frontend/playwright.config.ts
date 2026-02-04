import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2Eテスト設定
 *
 * 実行方法:
 * - npm run e2e        # 全テスト実行
 * - npm run e2e:ui     # UIモードで実行
 * - npm run e2e:debug  # デバッグモードで実行
 */
export default defineConfig({
  // テストファイルのディレクトリ
  testDir: './e2e',

  // 全テストのタイムアウト
  timeout: 30 * 1000,

  // expect()のタイムアウト
  expect: {
    timeout: 5000,
  },

  // テストの並列実行
  fullyParallel: true,

  // CI環境ではリトライしない
  retries: process.env.CI ? 2 : 0,

  // ワーカー数
  workers: process.env.CI ? 1 : undefined,

  // レポーター設定
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // 全テスト共通の設定
  use: {
    // ベースURL
    baseURL: 'http://localhost:3000',

    // トレースを失敗時のみ記録
    trace: 'on-first-retry',

    // スクリーンショットを失敗時のみ撮影
    screenshot: 'only-on-failure',

    // ビデオを失敗時のみ記録
    video: 'on-first-retry',
  },

  // テスト対象ブラウザ
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // モバイルテスト
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // 開発サーバーの起動設定
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
