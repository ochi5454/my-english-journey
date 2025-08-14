import React, { useEffect, useMemo, useState } from 'react';
import ResumeInterviewerDetail from './ResumeInterviewerDetail';
import ResumeInterviewerAnomalyScore from './ResumeInterviewerAnomalyScore';

// ======================== 型定義 ========================
type Row = {
  interviewer_id: string;
  stage: string;
  total: number;
  breakdown?: Record<string, number>;
  reasons?: string[];
  evaluated_at: string;
  candidate_id?: string;
};

type Rubric = {
  version: string;
  max_score: number;
  criteria: { key: string; label: string; weight: number; guidance?: string }[];
};

type Group = {
  interviewer_id: string;
  avg_total: number;
  count: number;
  reliability: number;
  latest_reason: string | null;
  latest_at: string | null;
};

// ======================== 本体コンポーネント ========================
const ResumeInterviewerOverview: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interviewerFilter, setInterviewerFilter] = useState<string>('');
  const [candidateFilter, setCandidateFilter] = useState<string>('');
  const [detailTarget, setDetailTarget] = useState<Group | null>(null);
  const [viewMode, setViewMode] = useState<'interviewer' | 'candidate'>('interviewer');

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/interviewer/rubric');
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
      const r = await fetch(`/interviewer/evals-cache?${buildQuery()}`);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchCache(); }, []);

  const refreshDiff = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: any = { auto: true };
      const q = interviewerFilter.trim();
      if (q) payload.q = q;
      const r = await fetch('/interviewer/evals-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchCache();
    } catch (e: any) {
      setError(e.message || '再評価に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // ======================== 信頼性スコア計算 ========================
  const calculateReliability = (rows: Row[]): number => {
    const count = rows.length;
    // ✅ 要素1: 平均スコア（高いほど信憑性が高くなる）
    const avg = rows.reduce((acc, r) => acc + r.total, 0) / count;
    // ✅ 要素2: スコアのばらつき（分散→標準偏差）から一貫性を評価
    const variance = rows.reduce((acc, r) => acc + Math.pow(r.total - avg, 2), 0) / count;
    const stdDev = Math.sqrt(variance);
    // ✅ 要素3: 面談件数（多いほど信頼性が高くなる）
    const base = Math.min(1, Math.sqrt(count) / 3);
    const consistency = 1 - Math.min(1, stdDev / 5); // stdDevが大きいほど信頼性低下
    // 件数 × 一貫性 の複合スコアとして信頼性を算出（0〜1）
    return Math.round(base * consistency * 100) / 100;
  };

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
      const sum = arr.reduce((acc, cur) => acc + (cur.total || 0), 0);
      const avg = Math.round((sum / arr.length) * 10) / 10;
      const latest = arr.slice().sort(
        (a, b) => new Date(b.evaluated_at).getTime() - new Date(a.evaluated_at).getTime()
      )[0];

      const reliability = calculateReliability(arr);

      out.push({
        interviewer_id: iid,
        avg_total: avg,
        count: arr.length,
        reliability,
        latest_reason: latest?.reasons?.[0] || null,
        latest_at: latest?.evaluated_at || null,
      });
    });

    out.sort((a, b) => b.avg_total - a.avg_total || a.interviewer_id.localeCompare(b.interviewer_id));
    return out;
  }, [rows, interviewerFilter]);

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
    <div className="resume-container">
      <h2 className="resume-title">面接官の品質確認</h2>

      <div className="resume-header">
        <div className="iq-tab-switch">
          <button className={`iq-tab-switch-btn ${viewMode === 'interviewer' ? 'active' : ''}`} onClick={() => setViewMode('interviewer')}>
            面接官軸
          </button>
          <button className={`iq-tab-switch-btn ${viewMode === 'candidate' ? 'active' : ''}`} onClick={() => setViewMode('candidate')}>
            候補者軸
          </button>
        </div>
        <button className="resume-submit" onClick={refreshDiff} disabled={loading}>
          {loading ? '再評価中…' : '差分を再評価'}
        </button>
      </div>

      {error && <div className="iq-error">{error}</div>}

      {viewMode === 'interviewer' && (
        <div className="resume-matrix-wrapper">
          <input
            className="resume-filter"
            placeholder="面接官IDでフィルタ"
            value={interviewerFilter}
            onChange={e => setInterviewerFilter(e.target.value)}
            onBlur={fetchCache}
          />
          <table className="resume-matrix-table">
            <thead>
              <tr>
                <th>面接官</th>
                <th>信憑性</th>
                <th>平均スコア</th>
                <th>面談件数</th>
                <th>総合評価</th>
                <th>評価日時</th>
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 ? (
                <tr><td colSpan={6} className="iq-empty">データがありません</td></tr>
              ) : grouped.map(g => (
                <tr
                  key={g.interviewer_id}
                  onClick={() => setDetailTarget(g)}
                  role="button"
                  tabIndex={0}
                >
                  <td>{g.interviewer_id}</td>
                <td>
                <span className={g.reliability < 0.5 ? "low-reliability" : undefined}>
                    {Math.round(g.reliability * 100)}%
                </span>
                </td>
                  <td>{g.avg_total} / 10</td>
                  <td>{g.count}</td>
                  <td>{g.latest_reason ?? '—'}</td>
                  <td>{g.latest_at ? new Date(g.latest_at).toLocaleString('ja-JP') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'candidate' && (
        <div className="ria-container">
          <input
            className="resume-filter"
            placeholder="候補者IDでフィルタ"
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
          />
          {candidateGroups.map(g => (
            <div key={g.candidate_id} style={{ marginBottom: "2rem" }}>
              <h3>{g.candidate_id}</h3>
              <ResumeInterviewerAnomalyScore
                candidateId={g.candidate_id}
                stages={g.stages}
                interviewerIds={Array.from(new Set(g.items.map(it => it.interviewer_id)))}
                reliability={reliabilityMap}
              />
            </div>
          ))}
        </div>
      )}

      {detailTarget && rubric && (
        <div className="modal-overlay" onClick={() => setDetailTarget(null)}>
          <div className="modal-box modal-box--lg" onClick={e => e.stopPropagation()}>
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
                <ResumeInterviewerDetail
                  interviewerId={detailTarget.interviewer_id}
                  rubric={rubric}
                  avgHeader={{ avgMap, count: n }}
                />
              );
            })()}
            <div className="modal-footer">
              <button onClick={() => setDetailTarget(null)}>閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeInterviewerOverview;
