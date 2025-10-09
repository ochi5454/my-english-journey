import React, { useEffect, useState } from 'react';
import './CandidateScoreMatrix.css';
import CandidateResultDetail from './CandidateResultDetail.tsx';
import appConfig from '../config.ts';

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
    user_name?: string;
    gender?: string;
    status?: string;
    timestamp: string;
    uploader_id?: string; // 1次評価者
    updated_at?: string;  // 2次評価日時
    updated_by?: string;  // 2次評価者
    recommended_division: string;
    must_check: Record<string, MustCheckItem>;
    scores: Score[];
}

const renderGenderChip = (gender?: string) => {
    let label = 'その他';
    let className = 'gender-chip other';
    if (gender === '男') {
        label = '男性';
        className = 'gender-chip male';
    } else if (gender === '女') {
        label = '女性';
        className = 'gender-chip female';
    }
    return <span className={className}>{label}</span>;
};

const renderStatusChip = (status?: string) => {
    if (!status || status === 'アップロード') {
        return <span className="matrix-status-chip matrix-status-upload">アップロード</span>;
    }
    return <span className="matrix-status-chip matrix-status-active">{status}</span>;
};

const renderMustCheckChip = (result: boolean | undefined, reason?: string) => {
    if (result === true) {
        return <span className="mustcheck-chip mustcheck-ok" title={reason}>合格</span>;
    } else if (result === false) {
        return <span className="mustcheck-chip mustcheck-ng" title={reason}>不合格</span>;
    } else {
        return <span className="mustcheck-chip mustcheck-unknown" title="未評価">--</span>;
    }
};

const CandidateScoreMatrix: React.FC<Props> = ({ interviewerId }) => {
    const [results, setResults] = useState<Result[]>([]);
    const [filters, setFilters] = useState({
        userId: '',
        userName: '',
        gender: '',
        status: '',
        division: '',
        mustCheckAllPassed: false,
    });
    const [selectedResult, setSelectedResult] = useState<Result | null>(null);

    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/resume-results`, { cache: 'no-store' })
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

    const filteredResults = results.filter((r) => {
        const { userId, userName, gender, status, division, mustCheckAllPassed } = filters;

        const idMatch = r.user_id.toLowerCase().includes(userId.toLowerCase());
        const nameMatch = (r.user_name || '').toLowerCase().includes(userName.toLowerCase());
        const genderMatch = gender === '' || r.gender === gender;
        const statusMatch = status === '' || (r.status || '').includes(status);
        const divisionMatch = division === '' || r.recommended_division.includes(division);
        const mustPassed = !mustCheckAllPassed || Object.values(r.must_check || {}).every(m => m.result === true);

        return idMatch && nameMatch && genderMatch && statusMatch && divisionMatch && mustPassed;
    });

    const allDivisions = Array.from(
        new Set(results.flatMap((r) => r.scores.map((s) => s.division)))
    );

    const allMustKeys = Object.keys(results[0]?.must_check || {});

    const handleRowClick = async (candidateId: string) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${candidateId}`);
            const data = await res.json();
            if (!data.error) setSelectedResult(data);
        } catch (e) {
            console.error("詳細取得エラー:", e);
        }
    };

    const handleResultUpdate = (updated: Result) => {
        setResults((prev) =>
            prev.map((r) => r.user_id === updated.user_id ? updated : r)
        );
        setSelectedResult(updated);
    };

    return (
        <div className="matrix-container">
            <div className="matrix-filters">
                <input type="text" placeholder="候補者ID" value={filters.userId} onChange={(e) => setFilters({...filters, userId: e.target.value})} />
                <input type="text" placeholder="名前" value={filters.userName} onChange={(e) => setFilters({...filters, userName: e.target.value})} />
                <select value={filters.gender} onChange={(e) => setFilters({...filters, gender: e.target.value})}>
                    <option value="">全て</option>
                    <option value="男">男性</option>
                    <option value="女">女性</option>
                    <option value="その他">その他</option>
                </select>
                <input type="text" placeholder="ステータス" value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})} />
                <input type="text" placeholder="推奨部門" value={filters.division} onChange={(e) => setFilters({...filters, division: e.target.value})} />
                <label>
                    <input type="checkbox" checked={filters.mustCheckAllPassed} onChange={(e) => setFilters({...filters, mustCheckAllPassed: e.target.checked})} />
                    必須全合格のみ
                </label>
            </div>

            <div className="resume-matrix-wrapper">
                <table className="resume-matrix-table">
                    <thead>
                        <tr>
                            <th rowSpan={2}>候補者ID</th>
                            <th rowSpan={2}>名前</th>
                            <th rowSpan={2}>性別</th>
                            <th rowSpan={2}>ステータス</th>
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
                            >
                                <td>{r.user_id}</td>
                                <td>{r.user_name || '-'}</td>
                                <td>{renderGenderChip(r.gender)}</td>
                                <td>{renderStatusChip(r.status)}</td>
                                <td>{r.timestamp ? r.timestamp.slice(0, 19).replace('T', ' ') : '-'}</td>
                                <td>{r.recommended_division}</td>
                                {allMustKeys.map((k) => (
                                    <td
                                        key={`must-${k}-${idx}`}
                                    >
                                        {renderMustCheckChip(r.must_check[k]?.result, r.must_check[k]?.reason)}
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
                <CandidateResultDetail
                    result={selectedResult}
                    onClose={() => setSelectedResult(null)}
                    onResultUpdate={handleResultUpdate}
                    interviewerId={interviewerId}
                />
            )}
        </div>
    );
};

export default CandidateScoreMatrix;