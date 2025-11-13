const PRIMARY_API_URL: string = "https://prothentia.ngrok.dev";
const FALLBACK_API_URL: string = "http://localhost:8000";

// グローバル変数で現在使用中のURL追跡
let currentApiUrl = PRIMARY_API_URL;
let isFallbackMode = false;

// 接続テスト用の軽量エンドポイント
const testConnection = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3秒タイムアウト

    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
};

// API_BASE_URLをdynamicに返す
const getApiBaseUrl = (): string => {
  return currentApiUrl;
};

// 初期接続チェック（オプション）
const initializeApiConnection = async () => {
  const primaryOk = await testConnection(PRIMARY_API_URL);

  if (!primaryOk && PRIMARY_API_URL !== FALLBACK_API_URL) {
    console.warn(`⚠️ Primary API (${PRIMARY_API_URL}) に接続できません。Fallback (${FALLBACK_API_URL}) に切り替えます。`);
    currentApiUrl = FALLBACK_API_URL;
    isFallbackMode = true;
  } else if (primaryOk) {
    console.log(`✅ Primary API (${PRIMARY_API_URL}) に接続しました。`);
    currentApiUrl = PRIMARY_API_URL;
    isFallbackMode = false;
  }
};

// アプリ起動時に接続チェック実行
initializeApiConnection();

const config = {
  get API_BASE_URL() {
    return getApiBaseUrl();
  },
  PRIMARY_URL: PRIMARY_API_URL,
  FALLBACK_URL: FALLBACK_API_URL,
  isFallbackMode: () => isFallbackMode,
};

export default config;