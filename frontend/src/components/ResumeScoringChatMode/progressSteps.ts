// === AI処理ステップの進行定義 ===
export const progressSteps = [
  { id: "start", label: "🚀 起動" },
  { id: "reading", label: "📄 履歴書を解析中" },
  { id: "mask", label: "🙈 個人情報をマスキング中" },
  { id: "embed", label: "🧠 情報をベクトル化中" },
  { id: "llm", label: "🤖 スコアリング中" },
  { id: "save", label: "💾 保存・最終処理中" },
  { id: "done", label: "🎉 完了" },
];

// 細かい status を大きな step に畳み込むルール
export const stepGroupingRules: Record<string, RegExp[]> = {
  start:   [/^start$/],
  reading: [/^reading(_|$)/, /^extract_/, /^normalize_/],
  mask:    [/^mask_/],
  embed:   [/^embed_/, /^sql_/],
  llm:     [/^llm(_|$)/],
  save:    [/^db_init_/, /^db_scores_/, /^finalize_/, /^final_payload$/],
  done:    [/^done$/],
};

// === ステップID → 対応マスタ ===
// （旧 masterMap は細かいステータス用、resolve後には下の map を使う）
export const stepToMasterMap: Record<string, keyof typeof masterDefinitions> = {
  start: "resume",
  reading: "resume",
  mask: "vector",
  embed: "vector",
  llm: "candidate",
  save: "candidate",
  done: "candidate",
};

// === 細かいステータス用マッピング（バックエンドstatus用）===
export const masterMap: Record<string, keyof typeof masterDefinitions> = {
  start: "resume",
  reading_start: "resume",
  reading_done: "resume",
  extract_start: "resume",
  extract_done: "resume",
  normalize_start: "resume",
  normalize_done: "resume",
  mask_start: "vector",
  mask_done: "vector",
  embed_start: "vector",
  embed_done: "vector",
  sql_start: "vector",
  sql_done: "vector",
  db_init_start: "candidate",
  db_init_done: "candidate",
  llm_start: "candidate",
  llm_done: "candidate",
  db_scores_start: "candidate",
  db_scores_done: "candidate",
  finalize_start: "candidate",
  finalize_done: "candidate",
  final_payload: "candidate",
  done: "candidate",
};

// === マスタ情報（UI描画用メタデータ）===
export const masterDefinitions = {
  resume: {
    icon: "📄",
    label: "履歴書マスタ",
    comment: "アップロードされた履歴書を解析・正規化します。",
  },
  vector: {
    icon: "🧠",
    label: "ベクトルDB",
    comment: "特徴情報をベクトル化して保存しています。",
  },
  candidate: {
    icon: "👤",
    label: "候補者マスタ",
    comment: "スコア・スキル・基本情報を登録しています。",
  },
} as const;

// === 細かいステータスをstepIdにまとめる ===
export function resolveStepId(status: string): string {
  for (const [stepId, patterns] of Object.entries(stepGroupingRules)) {
    if (patterns.some((re) => re.test(status))) return stepId;
  }
  return "start";
}