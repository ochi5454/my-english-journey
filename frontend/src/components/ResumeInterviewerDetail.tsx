import React, { useEffect, useMemo, useRef, useState } from 'react';

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

    type Props = {
    interviewerId?: string;
    defaultStage?: string;
    rubric?: Rubric;                             
    avgHeader?: { avgMap: Record<string, number>; count: number };
    };

    const ALL = 'すべて';

    const ResumeInterviewerDetail: React.FC<Props> = ({ interviewerId, defaultStage, rubric: rubricProp, avgHeader }) => {
        const [rubric, setRubric] = useState<Rubric | null>(rubricProp ?? null);
        const [rows, setRows] = useState<Row[]>([]);
        const [loading, setLoading] = useState(false);
        const [error, setError]   = useState<string | null>(null);

        // フィルタ
        const [iid, setIid] = useState<string>(interviewerId || '');
        const [candidateFilter, setCandidateFilter] = useState<string>('');
        const [stageFilter, setStageFilter] = useState<string>(defaultStage || ALL);

    // ルータ代替：#/interviewer-detail?iid=xxx&stage=面談・1次
    useEffect(() => {
        if (interviewerId) return;
        const hash = window.location.hash || '';
        const m = hash.match(/iid=([^&#]+)/);
        const s = hash.match(/stage=([^&#]+)/);
        if (m && !iid) setIid(decodeURIComponent(m[1]));
        if (s && !defaultStage) setStageFilter(decodeURIComponent(s[1]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // rubric は親から来ていれば fetch しない
    useEffect(() => {
        if (rubricProp) { setRubric(rubricProp); return; }
        (async () => {
        try {
            const r = await fetch('/interviewer/rubric');
            if (r.ok) setRubric(await r.json());
        } catch {}
        })();
    }, [rubricProp]);

    // クエリ組み立て（キャッシュ読み取り用）
    const buildQuery = () => {
    const p = new URLSearchParams();
    if (iid) p.set('interviewer_id', iid);
    if (stageFilter && stageFilter !== ALL) p.set('stage', stageFilter);
    if (candidateFilter) p.set('q', candidateFilter); // ★ ここを candidate_id → q に
    return p.toString();
    };

    const reqIdRef = useRef(0);

    // 初期表示＆再読込はキャッシュのみ
    const fetchCache = async () => {
        const myId = ++reqIdRef.current;
        setError(null);
        setLoading(true);
        try {
        const url = `/interviewer/evals-cache?${buildQuery()}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        // 古いレスポンスなら無視
        if (myId !== reqIdRef.current) return;
        setRows(data?.rows ?? []);
        } catch (e: any) {
        if (myId !== reqIdRef.current) return;
        setRows([]);
        setError(e.message || '読み込みに失敗しました');
        } finally {
        if (myId === reqIdRef.current) setLoading(false);
        }
    };

    // iid 変化で再取得（初回含む）
    useEffect(() => {
        if (!iid) return;                   // 面談者IDがなければ叩かない
        const t = setTimeout(fetchCache, 250); // 250ms デバウンス
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [iid, candidateFilter, stageFilter]);

    const prevIidRef = useRef<string>('');
    useEffect(() => {
    if (iid && prevIidRef.current && iid !== prevIidRef.current) {
        // 面談者を切り替えたら「すべて」に戻す（絞り込みでゼロ件になるのを防ぐ）
        setStageFilter(ALL);
    }
    prevIidRef.current = iid;
    }, [iid]);

    // 表示用
    const stages = useMemo(() => {
        const s = Array.from(new Set(rows.map(r => r.stage))).sort();
        return [ALL, ...s];
    }, [rows]);

    const visible = useMemo(() => {
    const candNeedle = (candidateFilter || '').trim().toLowerCase();
    const stageSel   = stageFilter;

    return rows.filter(r => {
        // 面談者IDは完全一致（この画面は特定面談者の明細なので）
        if (iid && r.interviewer_id !== iid) return false;

        // ステージ（"すべて" なら素通し）
        const okStage = stageSel === ALL || r.stage === stageSel;
        if (!okStage) return false;

        // 候補者IDの部分一致（大文字/小文字を無視）
        const okCand =
        !candNeedle ||
        (r.candidate_id || '').toLowerCase().includes(candNeedle);

        return okCand;
    });
    }, [rows, iid, stageFilter, candidateFilter]);

    return (
        <div className="iq-panel">
        <div className="iq-header">
            <h2 className="iq-title">面談者詳細（サブスコア）</h2>
            {/* 緑ボタンは不要なので削除 */}
        </div>

        {/* 追加：平均スコア×重みヘッダー（「平均内訳」を包括） */}
        {rubric && avgHeader && (
        <div className="iq-metricbar">
            {rubric.criteria.map(c => (
            <div key={c.key} className="iq-metric" title={c.guidance || ''}>
                <div className="label">{c.label}</div>
                <div className="value">{avgHeader.avgMap[c.key] ?? '—'}</div>
                <div className="weight">重み: {Math.round(c.weight * 100)}%</div>
            </div>
            ))}
            <div className="iq-metric-note">集計対象件数: {avgHeader.count}</div>
        </div>
        )}

        {/* フィルタ（維持） */}
        <div className="iq-toolbar iq-toolbar--compact">
        <div className="iq-field">
            <label>面談者ID</label>
            <input
            className="iq-input iq-input--sm"
            placeholder="interviewer_xxx"
            value={iid}
            onChange={e => setIid(e.target.value)}
            />
        </div>

        <div className="iq-field">
            <label>候補者ID</label>
            <input
            className="iq-input iq-input--sm"
            placeholder="cand_xxx"
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
            />
        </div>

        <div className="iq-field">
            <label>ステージ</label>
            <select
            className="iq-input iq-input--sm"
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value)}
            >
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
        </div>

        <div className="iq-toolbar__aside">
            <span className="iq-pill">{visible.length} 件</span>
            <button
            className="small-button"
            onClick={() => { setCandidateFilter(''); setStageFilter(ALL); }}
            title="絞り込みをクリア"
            >
            クリア
            </button>
        </div>
        </div>

        {/* ステージ・クイックチップ（任意） */}
        {stages.length > 1 && (
        <div className="iq-chips">
            {stages.map(s => (
            <button
                key={s}
                className={`iq-chip ${stageFilter === s ? 'active' : ''}`}
                onClick={() => setStageFilter(s)}
            >
                {s}
            </button>
            ))}
        </div>
        )}

        {loading && <div className="iq-muted">読み込み中…</div>} 

        {/* エラーメッセージ */}
        {error && <div className="iq-error">{error}</div>}

        {/* 明細テーブル*/}
        <div className="iq-table-wrap">
            <table className="iq-table iq-table--dense iq-table--compact iq-table--stickyhead">
            <colgroup>
                <col className="col-id" />        {/* 候補者 */}
                <col className="col-stage" />     {/* ステージ */}
                {/* 事前準備〜プロ意識：すべて同じ幅 */}
                {rubric?.criteria.map(() => <col key={crypto.randomUUID()} className="col-score" />)}
                <col className="col-total" />     {/* 総合 */}
                <col className="col-reason" />    {/* 最終評価（コメント） */}
                <col className="col-updated" />   {/* 更新 */}
            </colgroup>
            <thead>
            <tr>
                <th>候補者</th>
                <th>ステージ</th>
                {rubric?.criteria.map(c => (
                <th key={c.key} title={`重み ${Math.round(c.weight * 100)}%`}>{c.label}</th>
                ))}
                <th>総合</th>
                <th>総合評価</th>
                <th>評価日時</th>
            </tr>
            </thead>
            <tbody>
            {visible.length === 0 ? (
                <tr>
                <td colSpan={(rubric?.criteria.length ?? 0) + 5} className="iq-empty">データがありません</td>
                </tr>
            ) : visible.map((r, i) => (
                <tr key={`${r.interviewer_id}-${r.stage}-${r.candidate_id}-${i}`}>
                <td className="td-id">{r.candidate_id ?? '—'}</td>
                <td className="td-badge">{r.stage}</td>

                {rubric?.criteria.map(c => {
                    const s = r.breakdown?.[c.key];
                    return <td key={c.key} className="td-num" title={c.guidance || ''}>
                    {typeof s === 'number' ? s : '—'}
                    </td>;
                })}

                <td className="td-num"><strong>{r.total}</strong> / 10</td>
                <td className="td-reason">{r.reasons?.[0] ?? '—'}</td>
                <td className="td-dim">{new Date(r.evaluated_at).toLocaleString('ja-JP')}</td>
                </tr>
            ))}
            </tbody>
        </table>
        </div>
        </div>
    );
};

export default ResumeInterviewerDetail;