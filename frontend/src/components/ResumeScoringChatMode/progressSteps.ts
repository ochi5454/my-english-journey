// === AI処理ステップの進行定義 ===
export const progressSteps = [
  { id: "start", label: "🚀 起動" },
  { id: "reading", label: "📄 履歴書を解析中" },
  { id: "mask", label: "🙈 個人情報をマスキング中" },
  { id: "embed", label: "🧠 情報をベクトル化中" },
  { id: "sql", label: "🧠 情報をsql化中" },
  { id: "llm", label: "🤖 スコアリング中" },
  { id: "must", label: "🧩 必須要件チェック中" },
  { id: "division", label: "🏢 部門スコアリング中" },
  { id: "save", label: "💾 保存・最終処理中" },
  { id: "done", label: "🎉 完了" },
];

// 細かい status を大きな step に畳み込むルール
export const stepGroupingRules: Record<string, RegExp[]> = {
  start:   [/^start$/],
  reading: [/^reading/, /^extract/, /^normalize/],
  mask:    [/^mask/],
  embed:   [/^embed/],
  sql:     [/^sql/],
  llm:     [/^llm/],
  must:    [/^must/],
  division:[/^division/],
  save:    [/^db/, /^save/, /^finalize/, /^final_payload$/],
  done:    [/^done$/],
};

// === ステップID → 対応マスタ ===
export const stepToMasterMap: Record<string, keyof typeof masterDefinitions> = {
  start: "resume",
  reading: "resume",
  mask: "vector",
  embed: "vector",
  sql: "sql",
  llm: "candidate",
  must: "must",
  division: "division",
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

  sql_start: "sql",
  sql_prompt_build: "sql",
  sql_llm_call: "sql",
  sql_llm_response: "sql",
  sql_parse_start: "sql",
  sql_exec: "sql",
  sql_done: "sql",

  db_init_start: "candidate",
  db_init_done: "candidate",
  llm_start: "candidate",
  llm_call: "candidate",

  must_check: "must",
  must_check_by_division: "must",

  division_profiles: "division",
  division_request: "division",
  division_response_raw: "division",
  division_parse_ok: "division",
  division_parse_error: "division",
  division_scores_ready: "division",
  division_recommended: "division",

  llm_done: "candidate",
  db_scores_start: "candidate",

  reading_extract_start: "resume",
  reading_summary_start: "resume",
  reading_summary_done: "resume",
  
  save_candidate_update: "candidate",
  save_candidate_done: "candidate",

  must_scores_start: "must",
  must_scores_done: "must",

  division_mustcheck_start: "division",
  division_mustcheck_done: "division",
  division_scores_start: "division",
  division_scores_done: "division",
  division_scores_history_start: "division",
  division_scores_history_done: "division",

  db_scores_commit_done: "candidate",
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
  sql: {
    icon: "📝",
    label: "sqlマスタ",
    comment: "ベクトル情報をsql化して保存しています。",
  },
  must: {
    icon: "🧩",
    label: "マストマスタ",
    comment: "応募書類に必須要件が含まれているかを検証します。",
  },
  division: {
    icon: "🏢",
    label: "部門マスタ",
    comment: "各部門ごとの適合度をGPTでスコアリングします。",
  },
  candidate: {
    icon: "👤",
    label: "候補者マスタ",
    comment: "スコア・スキル・基本情報を登録しています。",
  },
} as const;

// === 細かいステータスをstepIdにまとめる ===
export function resolveStepId(status: string): string {
  const lower = status.toLowerCase();

  if (lower === "done") return "done"; // 最優先で厳密一致

  // progressSteps に存在するIDのみ返す
  if (lower.includes("must")) return "must";
  if (lower.includes("division")) return "division";
  if (lower.includes("sql")) return "sql";
  if (lower.includes("embed")) return "embed";
  if (lower.includes("mask")) return "mask";
  if (lower.includes("llm")) return "llm";
  if (lower.includes("save") || lower.includes("final") || lower.startsWith("db_")|| lower.startsWith("save_")) return "save";
  if (lower.includes("resume") || lower.includes("reading") || lower.includes("extract") || lower.includes("normalize")) return "reading";

  return "start";
}