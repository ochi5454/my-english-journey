import React, { useEffect, useState } from 'react';
import ResumeResultDetail from './ResumeResultDetail';
import './ResumeScoring.css';

interface Props {
    interviewerId: string;
}

interface Score {
    division: string;
    score: number;
    reason: string;
}

interface MustCheckItem {
    result: boolean;
    reason: string;
}

interface Result {
    user_id: string;
    timestamp: string;
    uploader_id?: string; // 1次評価者
    updated_at?: string;  // 2次評価日時
    updated_by?: string;  // 2次評価者
    recommended_division: string;
    must_check: Record<string, MustCheckItem>;
    scores: Score[];
}

const ResumeScoreMatrix: React.FC<Props> = ({ interviewerId }) => {
    const [results, setResults] = useState<Result[]>([]);
    const [filterText, setFilterText] = useState('');
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    useEffect(() => {
        fetch('/resume-results')
            .then((res) => res.json())
            .then((data: Result[]) => {
                // ユーザーごとに最新のtimestampのデータだけを保持する
                const latestMap = new Map<string, Result>();

                data.forEach((item) => {
                    const existing = latestMap.get(item.user_id);
                    if (!existing || new Date(item.timestamp) > new Date(existing.timestamp)) {
                        latestMap.set(item.user_id, item);
                    }
                });

                // Mapから配列に変換してセット
                setResults(Array.from(latestMap.values()));
            })
            .catch((err) => console.error('読み込みエラー:', err));
    }, []);

    const filteredResults = results.filter((r) =>
        r.user_id.toLowerCase().includes(filterText.toLowerCase())
    );

    const allDivisions = Array.from(
        new Set(results.flatMap((r) => r.scores.map((s) => s.division)))
    );

    const allMustKeys = Object.keys(results[0]?.must_check || {});

    const handleRowClick = async (candidateId: string) => {
        try {
            const res = await fetch(`/resume-result/${candidateId}`);
            const data = await res.json();
            if (!data.error) setSelectedResult(data);
        } catch (e) {
            console.error("詳細取得エラー:", e);
        }
    };

    // ✅ AI調整後に子コンポーネントから呼ばれる
    const handleResultUpdate = (updated: Result) => {
        setResults((prev) =>
            prev.map((r) => r.user_id === updated.user_id ? updated : r)
        );
        setSelectedResult(updated); // 詳細表示も更新
    };

    return (
        <div className="resume-container">
            <input
                type="text"
                placeholder="候補者IDでフィルタ"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="resume-filter"
            />

            <div className="resume-matrix-wrapper">
                <table className="resume-matrix-table">
                    <thead>
                        <tr>
                            <th rowSpan={2}>候補者ID</th>
                            <th rowSpan={2}>評価日</th>
                            <th rowSpan={2}>推奨部門</th>
                            <th colSpan={allMustKeys.length}>必須</th>
                            <th colSpan={allDivisions.length}>AIスコア</th>
                        </tr>
                        <tr>
                            {allMustKeys.map((k) => (
                                <th key={`must-${k}`}>{k}</th>
                            ))}
                            {allDivisions.map((d) => (
                                <th key={`score-${d}`}>{d}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredResults.map((r, idx) => (
                            <tr
                                key={idx}
                                onClick={() => handleRowClick(r.user_id)}
                                className="resume-matrix-row"
                            >
                                <td>{r.user_id}</td>
                                <td>{r.timestamp.slice(0, 19).replace('T', ' ')}</td>
                                <td>{r.recommended_division}</td>
                                {allMustKeys.map((k) => (
                                    <td
                                        key={`must-${k}-${idx}`}
                                        style={{ color: r.must_check[k]?.result ? 'green' : 'red' }}
                                        title={r.must_check[k]?.reason}
                                    >
                                        {r.must_check[k]?.result ? '✅' : '❌'}
                                    </td>
                                ))}
                                {allDivisions.map((d) => {
                                    const found = r.scores.find((s) => s.division === d);
                                    const isRecommended = r.recommended_division === d;

                                    return (
                                        <td
                                            key={`score-${d}-${idx}`}
                                            className={`resume-score-cell ${isRecommended ? 'highlight-recommended' : ''}`}
                                        >
                                            {found ? found.score : '-'}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {selectedResult && (
                <ResumeResultDetail
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onResultUpdate={handleResultUpdate}
                    interviewerId={interviewerId}
                />
            )}
        </div>
    );
};

export default ResumeScoreMatrix;