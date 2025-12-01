import React, { useEffect, useState } from 'react';
import appConfig from '../../config';
import './CandidateFullEvaluationModal.css';

interface Props {
    candidateId: string;
    onClose: () => void;
}

interface CandidateDetail {
    user_id: string;
    user_name?: string;
    name?: string;
    gender?: string;
    birth_date?: string;
    status?: string;
    preferred_div?: string;
    recommended_division?: string;
    document_review_date?: string;
    document_review_reviewer?: string;
    document_review_result?: string;
    scores?: Array<{
        division: string;
        score: number;
        reason: string;
    }>;
    histories?: Record<string, Array<{
        score: number;
        reason: string;
        reviewer: string;
        reviewed_at: string;
        source: string;
    }>>;
    must_checks?: Array<{
        item_name: string;
        result: boolean;
        reason?: string;
    }>;
    division_must_checks?: Array<{
        division: string;
        item_name: string;
        result: boolean;
        reason?: string;
    }>;
    notes?: string;
    work_summary?: string;
}

/**
 * 候補者全評価表示モーダル
 * 候補者の詳細な評価情報をすべて表示する
 */
const CandidateFullEvaluationModal: React.FC<Props> = ({ candidateId, onClose }) => {
    const [candidate, setCandidate] = useState<CandidateDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [divisionMap, setDivisionMap] = useState<Record<string, string>>({});

    useEffect(() => {
        // 部門マッピングを取得
        fetch(`${appConfig.API_BASE_URL}/admin/skills`)
            .then(res => res.json())
            .then((data: any[]) => {
                const map: Record<string, string> = {};
                data.forEach(item => {
                    if (item.division_prefix && item.division) {
                        map[item.division_prefix] = item.division;
                    }
                });
                setDivisionMap(map);
            })
            .catch(err => console.error('部門情報取得エラー:', err));

        // 候補者情報を取得
        fetch(`${appConfig.API_BASE_URL}/resume-result/${candidateId}`)
            .then(res => res.json())
            .then(data => {
                // must_check がオブジェクト形式で返るケースに対応して配列へ正規化
                const normalizeMustChecks = (): CandidateDetail["must_checks"] => {
                    if (Array.isArray((data as any).must_checks)) return (data as any).must_checks;
                    if (data.must_check && typeof data.must_check === "object") {
                        return Object.entries(data.must_check).map(([item_name, info]: any) => ({
                            item_name,
                            result: info.result,
                            reason: info.reason,
                        }));
                    }
                    return [];
                };

                const normalizeDivisionMustChecks = (): CandidateDetail["division_must_checks"] => {
                    if (Array.isArray((data as any).division_must_checks)) return (data as any).division_must_checks;
                    if (data.division_must_check && typeof data.division_must_check === "object") {
                        return Object.entries(data.division_must_check).flatMap(
                            ([division, checks]: [string, any]) =>
                                Object.entries(checks || {}).map(([item_name, info]: any) => ({
                                    division,
                                    item_name,
                                    result: info.result,
                                    reason: info.reason,
                                }))
                        );
                    }
                    return [];
                };

                setCandidate({
                    ...data,
                    must_checks: normalizeMustChecks(),
                    division_must_checks: normalizeDivisionMustChecks(),
                });
                setLoading(false);
            })
            .catch(err => {
                console.error('候補者情報取得エラー:', err);
                setLoading(false);
            });
    }, [candidateId]);

    const getDivisionName = (prefix: string): string => {
        return divisionMap[prefix] || prefix;
    };

    const calculateAge = (birthDate: string): number => {
        if (!birthDate) return 0;
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    if (loading) {
        return (
            <div className="full-eval-modal-overlay" onClick={onClose}>
                <div className="full-eval-modal-content loading" onClick={(e) => e.stopPropagation()}>
                    <div className="loading-spinner">読み込み中...</div>
                </div>
            </div>
        );
    }

    if (!candidate) {
        return (
            <div className="full-eval-modal-overlay" onClick={onClose}>
                <div className="full-eval-modal-content error" onClick={(e) => e.stopPropagation()}>
                    <p>候補者情報が見つかりませんでした</p>
                    <button onClick={onClose} className="close-btn">閉じる</button>
                </div>
            </div>
        );
    }

    return (
        <div className="full-eval-modal-overlay" onClick={onClose}>
            <div className="full-eval-modal-content" onClick={(e) => e.stopPropagation()}>
                {/* ヘッダー */}
                <div className="full-eval-header">
                    <h2>📊 評価サマリー</h2>
                    <button onClick={onClose} className="close-btn-icon">✕</button>
                </div>

                {/* 候補者基本情報 */}
                <div className="full-eval-section">
                    <h3>👤 基本情報</h3>
                    <div className="info-grid">
                        <div className="info-item">
                            <span className="label">候補者名:</span>
                            <span className="value">
                                <div>{candidate.name || candidate.user_name || '-'}</div>
                                <div className="candidate-id-small">{candidate.user_id}</div>
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="label">性別:</span>
                            <span className="value">{candidate.gender || '不明'}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">年齢:</span>
                            <span className="value">
                                {candidate.birth_date ? `${calculateAge(candidate.birth_date)}歳` : '未設定'}
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="label">ステータス:</span>
                            <span className="value status-badge">{candidate.status || '-'}</span>
                        </div>
                        <div className="info-item">
                            <span className="label">希望部門:</span>
                            <span className="value">
                                {candidate.preferred_div ? getDivisionName(candidate.preferred_div) : '未設定'}
                            </span>
                        </div>
                        <div className="info-item">
                            <span className="label">推奨部門:</span>
                            <span className="value">
                                {candidate.recommended_division ? getDivisionName(candidate.recommended_division) : '未設定'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 書類選考結果 */}
                {candidate.document_review_date && (
                    <div className="full-eval-section">
                        <h3>📋 書類選考結果</h3>
                        <div className="info-grid">
                            <div className="info-item">
                                <span className="label">審査日:</span>
                                <span className="value">
                                    {new Date(candidate.document_review_date).toLocaleString('ja-JP')}
                                </span>
                            </div>
                            <div className="info-item">
                                <span className="label">審査者:</span>
                                <span className="value">{candidate.document_review_reviewer || '-'}</span>
                            </div>
                            <div className="info-item">
                                <span className="label">結果:</span>
                                <span className={`value result-badge ${candidate.document_review_result === '合格' ? 'pass' : 'fail'}`}>
                                    {candidate.document_review_result || '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* AIスコア */}
                {candidate.scores && candidate.scores.length > 0 && (
                    <div className="full-eval-section">
                        <h3>🤖 AI評価スコア</h3>
                        <div className="score-list">
                            {candidate.scores.map((score, idx) => (
                                <div key={idx} className="score-item">
                                    <div className="score-header">
                                        <span className="division-name">{getDivisionName(score.division)}</span>
                                        <span className="score-value">{score.score}点</span>
                                    </div>
                                    {score.reason && (
                                        <div className="score-reason">{score.reason}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 志望動機・職務経歴 */}
                {(candidate.notes || candidate.work_summary) && (
                    <div className="full-eval-section">
                        <h3>📄 志望動機・職務経歴</h3>
                        {candidate.notes && (
                            <div className="text-content">
                                <h4>🧭 志望動機:</h4>
                                <p>{candidate.notes}</p>
                            </div>
                        )}
                        {candidate.work_summary && (
                            <div className="text-content">
                                <h4>💼 職務経歴:</h4>
                                <p>{candidate.work_summary}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* 必須要件チェック項目（部門別スコアの下にまとめて表示） */}
                {(candidate.must_checks && candidate.must_checks.length > 0) ||
                 (candidate.division_must_checks && candidate.division_must_checks.length > 0) ? (
                    <div className="full-eval-section">
                        {candidate.must_checks && candidate.must_checks.length > 0 && (
                            <>
                                <h3>✅ 必須要件</h3>
                                <div className="must-check-list">
                                    {candidate.must_checks.map((check, idx) => (
                                        <div key={idx} className={`must-check-item ${check.result ? 'pass' : 'fail'}`}>
                                            <div className="check-header">
                                                <span className="check-icon">{check.result ? '✓' : '✗'}</span>
                                                <span className="check-name">{check.item_name}</span>
                                            </div>
                                            {check.reason && (
                                                <div className="check-reason">{check.reason}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {candidate.division_must_checks && candidate.division_must_checks.length > 0 && (
                            <>
                                <h3>📂 部門別必須要件</h3>
                                <div className="division-must-check-list">
                                    {Object.entries(
                                        candidate.division_must_checks.reduce((acc: Record<string, any[]>, check) => {
                                            const div = check.division || '共通';
                                            if (!acc[div]) acc[div] = [];
                                            acc[div].push(check);
                                            return acc;
                                        }, {})
                                    ).map(([division, checks]) => (
                                        <div key={division} className="division-must-check-group">
                                            <h4>{getDivisionName(division)}</h4>
                                            <div className="must-check-list">
                                                {checks.map((check: any, idx: number) => (
                                                    <div key={idx} className={`must-check-item ${check.result ? 'pass' : 'fail'}`}>
                                                        <div className="check-header">
                                                            <span className="check-icon">{check.result ? '✓' : '✗'}</span>
                                                            <span className="check-name">{check.item_name}</span>
                                                        </div>
                                                        {check.reason && (
                                                            <div className="check-reason">{check.reason}</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                ) : null}

                {/* 評価履歴 */}
                {candidate.histories && Object.keys(candidate.histories).length > 0 && (
                    <div className="full-eval-section">
                        <h3>📝 評価履歴</h3>
                        <div className="history-list">
                            {Object.entries(candidate.histories).map(([division, historyList]) => (
                                <div key={division} className="history-group">
                                    <h4>{getDivisionName(division)}</h4>
                                    {historyList.map((history, idx) => (
                                        <div key={idx} className="history-item">
                                            <div className="history-meta">
                                                <span className="history-score">{history.score}点</span>
                                                <span className="history-reviewer">{history.reviewer}</span>
                                                <span className="history-source">{history.source}</span>
                                                <span className="history-date">
                                                    {new Date(history.reviewed_at).toLocaleString('ja-JP')}
                                                </span>
                                            </div>
                                            {history.reason && (
                                                <div className="history-reason">{history.reason}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* フッター */}
                <div className="full-eval-footer">
                    <button onClick={onClose} className="close-btn">閉じる</button>
                </div>
            </div>
        </div>
    );
};

export default CandidateFullEvaluationModal;
