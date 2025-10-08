import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './InterviewerOverview.css';
import InterviewerDetail from './InterviewerDetail.tsx';
import InterviewerAnomalyScore from './InterviewerAnomalyScore.tsx';
import InterviewerRoleFocusOverview from './InterviewerRoleFocusOverview.tsx';
import appConfig from '../config.ts';

// ======================== 型定義 ========================
type Row = {
  interviewer_id: string;
  stage: string;
  total: number;
  breakdown?: Record<string, number>;
  reasons?: string[];
  evaluated_at: string;
  candidate_id?: string;
  role_expectation?: RoleExpectation;
  skipped?: boolean;
};

type Rubric = {
  version: string;
  max_score: number;
  criteria: { key: string; label: string; weight: number; guidance?: string }[];
};

type RoleExpectation = {
  matched: string[];
  missing: string[];
  violated: string[];
  comment?: string;
  score?: number;
};

type Group = {
  interviewer_id: string;
  avg_total: number;
  avg_role_score?: number;
  count: number;
  reliability: number;
  latest_reason: string | null;
  latest_at: string | null;
};

type RoleKey = keyof typeof defaultReliabilityConfig.roleWeights;

type ReliabilityConfig = {
  roleWeight: number;
  consistencyWeight: number;
  roleWeights: Record<RoleKey, number>;
};

// ======================== デフォルト設定 ========================
const defaultReliabilityConfig = {
  roleWeight: 0.2,
  consistencyWeight: 0.8,
  roleWeights: {
    C: 1.0,
    SC: 1.05,
    M: 1.1,
    SM: 1.15,
    "D+": 1.2,
  },
} as const;

// ======================== 本体コンポーネント ========================
const InterviewerOverview: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interviewerFilter, setInterviewerFilter] = useState<string>('');
  const [candidateFilter, setCandidateFilter] = useState<string>('');
  const [detailTarget, setDetailTarget] = useState<Group | null>(null);
  const [viewMode, setViewMode] = useState<'interviewer' | 'candidate' | 'role'>('interviewer');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-3.5-turbo");
  const [includeReasons, setIncludeReasons] = useState(true);
  const [skipEval, setSkipEval] = useState(false);
  const [reliabilityConfig, setReliabilityConfig] = useState<ReliabilityConfig>(defaultReliabilityConfig);
  const [showReliabilityModal, setShowReliabilityModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${appConfig.API_BASE_URL}/interviewer/rubric`);
        if (r.ok) setRubric(await r.json());
      } catch {}
    })();
  }, []);

  const buildQuery = () => {
    const p = new URLSearchParams();
    const q = interviewerFilter.trim();
    if (q) p.set('q', q);
    return p.toString();
  };

  const fetchCache = async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${appConfig.API_BASE_URL}/interviewer/evals-cache?${buildQuery()}`);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setRows(data?.rows ?? []);
    } catch (e: any) {
      setRows([]);
      setError(e.message || '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCache(); }, []);

  // ======================== 差分評価の実行 ========================
  const handleRefreshDiff = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: any = {
        auto: true,
        model: selectedModel, // 使用するモデル
        includeReasons: includeReasons, // 理由をスキップするかどうか
        skipEval: skipEval, // 基礎スコア算出をスキップするかどうか
      };
      const q = interviewerFilter.trim();
      if (q) payload.q = q;

      const r = await fetch(`${appConfig.API_BASE_URL}/interviewer/evals-refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchCache();
    } catch (e: any) {
      setError(e.message || "評価に失敗しました");
    } finally {
      setLoading(false);
    }
  };
  // ======================== 面接官メタデータの取得 ========================
  const [interviewerMeta, setInterviewerMeta] = useState<Record<string, { role: string }>>({});
  useEffect(() => {
    fetch(`${appConfig.API_BASE_URL}/checksheet/meta`)
      .then(res => res.json())
      .then(setInterviewerMeta)
      .catch(() => setInterviewerMeta({}));
  }, []);

  // ======================== 信頼性スコア計算 ========================
  const calculateReliability = useCallback((rows: Row[], interviewerId: string): number => {
    const validRows = rows.filter(r => r.skipped !== true);
    const count = rows.length;
    if (count === 0) return 0;
    // ✅ 要素1: 平均基礎スコア（高いほど信憑性が高くなる）(基礎スコアスキップ（0点）は除外)
    const avg = validRows.reduce((acc, r) => acc + r.total, 0) / validRows.length;
    // ✅ 要素2: 基礎スコアのばらつき（分散→標準偏差）から一貫性を評価
    const variance = validRows.reduce((acc, r) => acc + Math.pow(r.total - avg, 2), 0) / validRows.length;
    const stdDev = Math.sqrt(variance);
    // ✅ 要素3: 各部門ロールに期待されるQA観点の網羅性スコア
    const hasRole = rows.some(r => typeof r.role_expectation?.score === 'number');
    const roleAvg = hasRole ? rows.reduce((a, r) => a + (r.role_expectation?.score ?? 0), 0) / count : 1;
    // ✅ 要素4: 面談件数（多いほど信頼性が高くなる）
    const base = Math.min(1, Math.sqrt(count) / 3);
    const consistency = 1 - Math.min(1, stdDev / 5);
    const { roleWeight, consistencyWeight, roleWeights } = reliabilityConfig;
    const baseReliability = base * (consistencyWeight * consistency + roleWeight * roleAvg / 10);
    // ✅ 要素5: 面接官のロールを考慮した調整
    const role = interviewerMeta?.[interviewerId]?.role ?? "C";
    const upperRole = role.toUpperCase() as RoleKey;
    const weight = roleWeights[upperRole] ?? 1.0;

    return Math.round(Math.min(1.0, baseReliability * weight) * 100) / 100;
  }, [interviewerMeta, reliabilityConfig]);

  // ======================== 面接官軸の集計 ========================
  const grouped: Group[] = useMemo(() => {
    const map = new Map<string, Row[]>();
    rows.forEach(r => {
      const ok = !interviewerFilter || r.interviewer_id.toLowerCase().includes(interviewerFilter.toLowerCase());
      if (!ok) return;
      const arr = map.get(r.interviewer_id);
      if (arr) arr.push(r); else map.set(r.interviewer_id, [r]);
    });

    const out: Group[] = [];
    map.forEach((arr, iid) => {
      if (!arr.length) return;
        const validRows = arr.filter(r => r.skipped !== true); // 基礎スコアスキップ（0点）は除外
        const sum = validRows.reduce((acc, cur) => acc + (cur.total || 0), 0);
        const avg = validRows.length ? Math.round((sum / validRows.length) * 10) / 10 : 0;
      const latest = arr.slice().sort(
        (a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime()
      )[0];

      const reliability = calculateReliability(arr, iid);

      const hasRole = arr.some(r => typeof r.role_expectation?.score === 'number');
      const sumRole = arr.reduce((acc, cur) => acc + (cur.role_expectation?.score ?? 0), 0);
      const avgRole = hasRole ? Math.round((sumRole / arr.length) * 10) / 10 : null;

      out.push({
        interviewer_id: iid,
        avg_total: avg,
        avg_role_score: avgRole ?? undefined,
        count: arr.length,
        reliability,
        latest_reason: latest?.reasons?.[0] || null,
        latest_at: latest?.evaluated_at || null,
      });
    });

    out.sort((a, b) => b.avg_total - a.avg_total || a.interviewer_id.localeCompare(b.interviewer_id));
    return out;
  }, [rows, interviewerFilter, calculateReliability]);

  // ======================== 候補者軸の集計 ========================
  const candidateGroups = useMemo(() => {
    const map = new Map<string, { items: Row[]; stages: Set<string>; latest_at: string | null }>();
    rows.forEach(r => {
      if (!r.candidate_id) return;
      const cid = r.candidate_id;
      if (candidateFilter && !cid.toLowerCase().includes(candidateFilter.toLowerCase())) return;

      const rec = map.get(cid) ?? { items: [], stages: new Set<string>(), latest_at: null };
      rec.items.push(r);
      if (r.stage) rec.stages.add(r.stage);
      if (!rec.latest_at || new Date(r.evaluated_at) > new Date(rec.latest_at)) {
        rec.latest_at = r.evaluated_at;
      }
      map.set(cid, rec);
    });

    return Array.from(map.entries())
      .map(([cid, rec]) => ({
        candidate_id: cid,
        items: rec.items.sort((a, b) => a.interviewer_id.localeCompare(b.interviewer_id)),
        stages: Array.from(rec.stages),
        latest_at: rec.latest_at,
      }))
      .sort((a, b) =>
        (new Date(b.latest_at || 0).getTime() - new Date(a.latest_at || 0).getTime()) ||
        a.candidate_id.localeCompare(b.candidate_id)
      );
  }, [rows, candidateFilter]);

  // 面接官別信頼性マップ（候補者軸に渡す用）
  const reliabilityMap: Record<string, number> = useMemo(() => {
    const map: Record<string, number> = {};
    grouped.forEach(g => map[g.interviewer_id] = g.reliability);
    return map;
  }, [grouped]);

  // ======================== JSX ========================
  return (
    <div className="interviewer-ov-container">
      <div className="interviewer-ov-header">
        <div className="iq-tab-switch">
          <button className={`iq-tab-switch-btn ${viewMode === 'interviewer' ? 'active' : ''}`} onClick={() => setViewMode('interviewer')}>
            面接官軸
          </button>
          <button className={`iq-tab-switch-btn ${viewMode === 'candidate' ? 'active' : ''}`} onClick={() => setViewMode('candidate')}>
            候補者軸
          </button>
          <button
            className={`iq-tab-switch-btn ${viewMode === 'role' ? 'active' : ''}`}
            onClick={() => setViewMode('role')}
          >
            ロール軸
          </button>
        </div>
        <button className="diff-modal-open" onClick={() => setIsModalOpen(true)} disabled={loading}>
          差分を評価
        </button>
      </div>

      {error && <div className="iq-error">{error}</div>}

      {viewMode === 'interviewer' && (
        <div className="interviewer-ov-matrix-wrapper">
          <h2>面接官の信憑性</h2>
          <input
            className="interviewer-filter"
            placeholder="面接官IDでフィルタ"
            value={interviewerFilter}
            onChange={e => setInterviewerFilter(e.target.value)}
            onBlur={fetchCache}
          />

          <table className="interviewer-ov-matrix-table">
            <thead>
              <tr>
                <th>面接官</th>
                <th>ロール</th>
                <th
                  className="clickable-header"
                  onClick={() => setShowReliabilityModal(true)}
                >
                  信憑性
                </th>
                <th>基礎スコア</th>
                <th>観点スコア</th>
                <th>面接件数</th>
                <th>評価日時</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr><td colSpan={8} className="iq-empty">データがありません</td></tr>
              ) : grouped.map(g => {
                // 👇 role 変数を定義
                const role = interviewerMeta?.[g.interviewer_id]?.role ?? "—";

                return (
                  <tr
                    key={g.interviewer_id}
                    onClick={() => setDetailTarget(g)}
                    role="button"
                    tabIndex={0}
                  >
                    <td>{g.interviewer_id}</td>

                    {/* ✅ ここで定義済みの role を使用 */}
                    <td>
                      <span className={`role-chip role-${role.toLowerCase()}`}>
                        {role}
                      </span>
                    </td>

                    <td>
                      <span className={g.reliability < 0.5 ? "low-reliability" : undefined}>
                        {Math.round(g.reliability * 100)}%
                      </span>
                    </td>
                    <td>{g.avg_total} / 10</td>
                    <td>{typeof g.avg_role_score === 'number' ? `${g.avg_role_score} / 10` : '—'}</td>
                    <td>{g.count}</td>
                    <td>{g.latest_at ? new Date(g.latest_at).toLocaleString('ja-JP') : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="reliability-note">
            ※ 信憑性スコアは以下の要素を元に算出されています：<br />
            ・平均基礎スコア（高いほど信憑性が高くなる）<br />
            ・基礎スコアの安定性（標準偏差）<br />
            ・面接件数（多いほど信頼性が向上）<br />
            ・観点スコア（各部門ロールに期待されるQA観点の網羅性）<br />
            ・面接官のロール（C &lt; SC &lt; M &lt; SM &lt; D+）<br />
          </p>
        </div>
      )}

      {viewMode === 'candidate' && (
        <div className="ria-container">
          <h2>異常スコアの検出</h2>
          <input
            className="candidate-iq-filter"
            placeholder="候補者IDでフィルタ"
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
          />
          {candidateGroups.map(g => (
            <div key={g.candidate_id} style={{ marginBottom: "2rem" }}>
              <h3>{g.candidate_id}</h3>
              <InterviewerAnomalyScore
                candidateId={g.candidate_id}
                stages={g.stages}
                interviewerIds={Array.from(new Set(g.items.map(it => it.interviewer_id)))}
                reliability={reliabilityMap}
              />
            </div>
          ))}
        </div>
      )}

      {viewMode === 'role' && (
        <div className="interviewer-ov-matrix-wrapper">
          <h2>質問内容の傾向</h2>
          <InterviewerRoleFocusOverview />
        </div>
      )}

      {detailTarget && rubric && (
        <div className="modal-overlay" onClick={() => setDetailTarget(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h4>詳細（{detailTarget.interviewer_id}）</h4>
            {(() => {
              const target = rows.filter(r => r.interviewer_id === detailTarget.interviewer_id);
              const acc: Record<string, number> = {};
              let n = 0;
              for (const r of target) {
                rubric.criteria.forEach(c => {
                  const v = r.breakdown?.[c.key];
                  if (typeof v === 'number') acc[c.key] = (acc[c.key] || 0) + v;
                });
                n++;
              }
              const avgMap: Record<string, number> = {};
              rubric.criteria.forEach(c => {
                avgMap[c.key] = n ? Math.round(((acc[c.key] || 0) / n) * 10) / 10 : 0;
              });
              return (
                <InterviewerDetail
                  interviewerId={detailTarget.interviewer_id}
                  rubric={rubric}
                  avgHeader={{ avgMap, count: n }}
                />
              );
            })()}
            <div>
              <button onClick={() => setDetailTarget(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {loading && <div>評価中です。しばらくお待ちください...</div>}
            <h4 className="diff-modal-title">差分評価オプション</h4>

            <div className="diff-modal-row">
              <label className="diff-modal-label">
                使用モデル：
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="diff-modal-select"
                >
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                  <option value="gpt-4">GPT-4</option>
                </select>
              </label>
            </div>

            <div className="diff-modal-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={includeReasons}
                  onChange={() => setIncludeReasons(!includeReasons)}
                />
                基礎スコア算出の理由をスキップ
              </label>
            </div>

            <div className="diff-modal-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={skipEval}
                  onChange={() => setSkipEval(!skipEval)}
                />
                基礎スコア算出をスキップ（観点スコアのみ算出）
              </label>
            </div>

            <div className="diff-modal-footer">
              <button className="diff-modal-btn cancel-btn" onClick={() => setIsModalOpen(false)}>
                キャンセル
              </button>
              <button
                className="diff-modal-btn execute-btn"
                  onClick={async () => {
                    await handleRefreshDiff();
                    setIsModalOpen(false);
                  }}
                disabled={loading}
              >
                {loading ? '評価中…' : '実行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReliabilityModal && (
        <div className="modal-overlay" onClick={() => setShowReliabilityModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h4 className="diff-modal-title">信憑性スコアの重み設定</h4>

            <label className="reliability-modal-label">
              ・基礎スコア安定性（標準偏差）重み（0〜1）:
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="reliability-modal-input"
                value={reliabilityConfig.consistencyWeight}
                onChange={(e) =>
                  setReliabilityConfig(cfg => ({
                    ...cfg,
                    consistencyWeight: parseFloat(e.target.value)
                  }))
                }
              />
              <span className="initial-value-note">（初期値: {defaultReliabilityConfig.consistencyWeight}）</span>
            </label>

            <label className="reliability-modal-label">
              ・観点スコア重み（0〜1）:
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className="reliability-modal-input"
                value={reliabilityConfig.roleWeight}
                onChange={(e) =>
                  setReliabilityConfig(cfg => ({
                    ...cfg,
                    roleWeight: parseFloat(e.target.value)
                  }))
                }
              />
              <span className="initial-value-note">（初期値: {defaultReliabilityConfig.roleWeight}）</span>
            </label>

            <label className="reliability-modal-label">・面接官ロール別重み（0.5〜2）：</label>
            {(Object.keys(reliabilityConfig.roleWeights) as RoleKey[]).map(role => (
              <div className="reliability-role-weight indent-role" key={role}>
                <label>{role}：</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  max="2"
                  className="reliability-modal-input"
                  value={reliabilityConfig.roleWeights[role]}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setReliabilityConfig(cfg => ({
                      ...cfg,
                      roleWeights: {
                        ...cfg.roleWeights,
                        [role]: val
                      }
                    }));
                  }}
                />
                <span className="initial-value-note">（初期値: {defaultReliabilityConfig.roleWeights[role]}）</span>
              </div>
            ))}

            <div className="diff-modal-footer">
              <button
                className="diff-modal-btn cancel-btn"
                onClick={() => setShowReliabilityModal(false)}
              >
                キャンセル
              </button>

              <button
                className="diff-modal-btn cancel-btn"
                onClick={() => setReliabilityConfig(defaultReliabilityConfig)}
              >
                クリア
              </button>

              <button
                className="diff-modal-btn execute-btn"
                onClick={() => setShowReliabilityModal(false)}
              >
                適用
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default InterviewerOverview;
