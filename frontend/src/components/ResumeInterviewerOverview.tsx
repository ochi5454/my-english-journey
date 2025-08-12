// ResumeInterviewerOverview.tsx
import React, { useEffect, useMemo, useState } from 'react';
import ResumeInterviewerDetail from './ResumeInterviewerDetail';

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
    latest_reason: string | null;
    latest_at: string | null;
    };

    const ResumeInterviewerOverview: React.FC = () => {
    const [rows, setRows] = useState<Row[]>([]);
    const [rubric, setRubric] = useState<Rubric | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [interviewerFilter, setInterviewerFilter] = useState<string>('');
    const [detailTarget, setDetailTarget] = useState<Group | null>(null);

    // rubric
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

    // 一覧（面談者ごとに集計）
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
        out.push({
            interviewer_id: iid,
            avg_total: avg,
            count: arr.length,
            latest_reason: latest?.reasons?.[0] || null,
            latest_at: latest?.evaluated_at || null,
        });
        });

        out.sort((a, b) => b.avg_total - a.avg_total || a.interviewer_id.localeCompare(b.interviewer_id));
        return out;
    }, [rows, interviewerFilter]);

    // 平均内訳を計算（Detail ヘッダーに渡す）
    function calcAvgBreakdown(iid: string): { out: Record<string, number>; count: number } {
        const target = rows.filter(r => r.interviewer_id === iid);
        const acc: Record<string, number> = {};
        let n = 0;
        for (const r of target) {
        rubric?.criteria.forEach(c => {
            const v = r.breakdown?.[c.key];
            if (typeof v === 'number') acc[c.key] = (acc[c.key] || 0) + v;
        });
        n++;
        }
        const out: Record<string, number> = {};
        rubric?.criteria.forEach(c => {
        out[c.key] = n ? Math.round(((acc[c.key] || 0) / n) * 10) / 10 : 0;
        });
        return { out, count: n };
    }

    return (
        <div className="resume-container">
        <h2 className="resume-title">面談者評価</h2>

        <div className="resume-header" style={{ gap: 12 }}>
            <input
            className="resume-filter"
            placeholder="面談者IDでフィルタ"
            value={interviewerFilter}
            onChange={e => setInterviewerFilter(e.target.value)}
            onBlur={fetchCache}
            />
            <button
            className="resume-submit"
            onClick={refreshDiff}
            disabled={loading}
            title="不足/古い評価だけを再計算してキャッシュを更新します"
            >
            {loading ? '再評価中…' : '差分を再評価'}
            </button>
        </div>

        {error && <div className="iq-error" style={{ marginTop: 8 }}>{error}</div>}

        <div className="resume-matrix-wrapper">
            <table className="resume-matrix-table">
            <thead>
                <tr>
                <th>面談者</th>
                <th>平均スコア</th>
                <th>面談件数</th>
                <th>総合評価</th>
                <th>評価日時</th>
                </tr>
            </thead>
            <tbody>
                {grouped.length === 0 ? (
                <tr><td colSpan={5} className="iq-empty">データがありません</td></tr>
                ) : grouped.map(g => (
                <tr
                    key={g.interviewer_id}
                    className="iq-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDetailTarget(g)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setDetailTarget(g); }}
                    role="button"
                    tabIndex={0}
                >
                    <td className="iq-strong">{g.interviewer_id}</td>
                    <td><span className="iq-strong">{g.avg_total}</span> / 10</td>
                    <td>{g.count}</td>
                    <td className="eval-col">{g.latest_reason ?? '—'}</td>
                    <td>{g.latest_at ? new Date(g.latest_at).toLocaleString('ja-JP') : '—'}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>

        {detailTarget && rubric && (
            <div className="modal-overlay" onClick={() => setDetailTarget(null)}>
            <div className="modal-box modal-box--lg" onClick={e => e.stopPropagation()}>
                <h4 style={{ marginTop: 0 }}>詳細（{detailTarget.interviewer_id}）</h4>

                {(() => {
                const { out: avgMap, count } = calcAvgBreakdown(detailTarget.interviewer_id);
                return (
                    <ResumeInterviewerDetail
                    interviewerId={detailTarget.interviewer_id}
                    rubric={rubric}
                    avgHeader={{ avgMap, count }}
                    />
                );
                })()}

                <div style={{ textAlign: 'right', marginTop: 12 }}>
                <button className="small-button" onClick={() => setDetailTarget(null)}>閉じる</button>
                </div>
            </div>
            </div>
        )}
        </div>
    );
};

export default ResumeInterviewerOverview;