// BatchResultSection.tsx
import React, { useState } from 'react';
import './BatchResultSection.css';
import { useNavigate } from 'react-router-dom';

interface BatchResultSectionProps {
    result: {
        total: number;
        success: number;
        error: number;
        processing_time: number;
        successful_candidates: Array<{
            filename: string;
            candidate_id: string;
            name: string;
            gender: string;
            has_motivation: boolean;
            has_work_experience: boolean;
            processing_time: number;
        }>;
        results: Array<{
            filename: string;
            status: 'success' | 'error';
            error?: string;
        }>;
    } | null;
    userId: string;
}

const BatchResultSection: React.FC<BatchResultSectionProps> = ({ result, userId }) => {
    const navigate = useNavigate();
    const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');

    if (!result) return <div>結果を読み込んでいます...</div>;

    const filteredResults = result.results.filter(r => {
        if (filter === 'all') return true;
        return r.status === filter;
    });

    const handleDetailScoring = (candidateId: string, filename: string) => {
        // 個別スコアリング画面に遷移
        navigate(`/resume-scoring?candidate_id=${candidateId}&from_batch=true`);
    };

    return (
        <div className="batch-result-container">
            <div className="batch-summary">
                <h3>📊 一括処理結果</h3>
                <div className="summary-stats">
                    <div className="stat-item success">
                        <span className="stat-label">成功</span>
                        <span className="stat-value">{result.success}件</span>
                    </div>
                    <div className="stat-item error">
                        <span className="stat-label">エラー</span>
                        <span className="stat-value">{result.error}件</span>
                    </div>
                    <div className="stat-item total">
                        <span className="stat-label">総件数</span>
                        <span className="stat-value">{result.total}件</span>
                    </div>
                    <div className="stat-item time">
                        <span className="stat-label">処理時間</span>
                        <span className="stat-value">{result.processing_time.toFixed(1)}秒</span>
                    </div>
                </div>
            </div>

            {/* 成功した候補のリスト */}
            {result.successful_candidates.length > 0 && (
                <div className="candidates-list">
                    <h4>✅ 登録された候補者 ({result.successful_candidates.length}名)</h4>
                    <div className="candidates-grid">
                        {result.successful_candidates.map((candidate, idx) => (
                            <div key={idx} className="candidate-card">
                                <div className="candidate-header">
                                    <span className="candidate-name">
                                        {candidate.name || '名前不明'}
                                    </span>
                                    <span className="candidate-gender">
                                        {candidate.gender === '男' ? '👨' : 
                                         candidate.gender === '女' ? '👩' : '❓'}
                                    </span>
                                </div>
                                
                                <div className="candidate-info">
                                    <div className="info-item">
                                        📄 {candidate.filename}
                                    </div>
                                    <div className="info-badges">
                                        {candidate.has_motivation && (
                                            <span className="badge">📝 志望動機あり</span>
                                        )}
                                        {candidate.has_work_experience && (
                                            <span className="badge">💼 職務経歴あり</span>
                                        )}
                                    </div>
                                    <div className="processing-time">
                                        ⏱️ {candidate.processing_time.toFixed(1)}秒
                                    </div>
                                </div>

                                <button
                                    className="detail-score-btn"
                                    onClick={() => handleDetailScoring(
                                        candidate.candidate_id, 
                                        candidate.filename
                                    )}
                                >
                                    🎯 詳細スコアリング実行
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* エラーリスト */}
            {result.error > 0 && (
                <div className="error-list">
                    <h4>❌ エラーが発生したファイル ({result.error}件)</h4>
                    <div className="error-items">
                        {result.results
                            .filter(r => r.status === 'error')
                            .map((r, idx) => (
                                <div key={idx} className="error-item">
                                    <span className="error-filename">📄 {r.filename}</span>
                                    <span className="error-message">{r.error}</span>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* 全結果の詳細表示（折りたたみ） */}
            <details className="all-results-details">
                <summary>📋 全処理結果を表示 ({result.total}件)</summary>
                <div className="filter-tabs">
                    <button 
                        className={filter === 'all' ? 'active' : ''}
                        onClick={() => setFilter('all')}
                    >
                        すべて ({result.total})
                    </button>
                    <button 
                        className={filter === 'success' ? 'active' : ''}
                        onClick={() => setFilter('success')}
                    >
                        成功のみ ({result.success})
                    </button>
                    <button 
                        className={filter === 'error' ? 'active' : ''}
                        onClick={() => setFilter('error')}
                    >
                        エラーのみ ({result.error})
                    </button>
                </div>
                <table className="results-table">
                    <thead>
                        <tr>
                            <th>ファイル名</th>
                            <th>ステータス</th>
                            <th>詳細</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredResults.map((r, idx) => (
                            <tr key={idx} className={r.status}>
                                <td>{r.filename}</td>
                                <td>
                                    {r.status === 'success' ? '✅ 成功' : '❌ エラー'}
                                </td>
                                <td>{r.error || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        </div>
    );
};

export default BatchResultSection;