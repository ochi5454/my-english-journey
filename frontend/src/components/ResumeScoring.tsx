// ResumeScoring.tsx
import React, { useState } from 'react';
import './ResumeScoring.css';
import ResumeScoreMatrix from './ResumeScoreMatrix';

const ResumeScoring: React.FC<{ userId: string }> = ({ userId }) => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [candidateId, setCandidateId] = useState<string>('');
    const [viewMode, setViewMode] = useState<'form' | 'matrix'>('form');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
        setFile(e.target.files[0]);
        }
    };

    const generateCandidateId = () => {
        const id = 'cand_' + Math.random().toString(36).substring(2, 10);
        setCandidateId(id);
    };

    const handleSubmit = async () => {
        if (!file || !candidateId) return;
        setLoading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('candidate_id', candidateId);

        try {
        const response = await fetch('/resume-score', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json();
            alert(`エラー: ${errorData.error}`);
            return;
        }

        const data = await response.json();
        setResult(data);
        } catch (err) {
        console.error(err);
        alert('スコアリング中にエラーが発生しました。');
        } finally {
        setLoading(false);
        }
    };

    return (
        <div className="resume-container">
        <div className="resume-tabs">
        <div
            className={`resume-tab ${viewMode === 'form' ? 'active' : ''}`}
            onClick={() => setViewMode('form')}
        >
            履歴書アップロード
        </div>
        <div
            className={`resume-tab ${viewMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setViewMode('matrix')}
        >
            スコアマトリクス
        </div>
        </div>

        {viewMode === 'form' ? (
            <>
            <h2 className="resume-title">候補者判定</h2>

            <div className="resume-upload">
                <label htmlFor="candidateIdInput">候補者ID:</label>
                <input
                id="candidateIdInput"
                type="text"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                placeholder="候補者IDを入力または生成"
                />
                <button onClick={generateCandidateId} className="resume-generate-id">IDを自動生成</button>
            </div>

            <div className="resume-upload">
                <label htmlFor="resumeFile">履歴書ファイルを選択 (PDF/DOCX/XLSX)</label><br />
                <input id="resumeFile" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls" onChange={handleFileChange} />
            </div>

            <button onClick={handleSubmit} disabled={!file || loading || !candidateId} className="resume-submit">
                {loading ? 'スコアリング中...' : '送信'}
            </button>

            {result && (
                <div className="resume-result">
                <h3 className="resume-recommendation">推奨部門: {result.recommended_division}</h3>

                <div className="resume-must-check">
                <h4>マスト要件チェック:</h4>
                <ul>
                    {Object.entries(result.must_check || {}).map(([item, value]: any) => (
                    <li key={item} style={{ color: value.result ? 'green' : 'red' }}>
                        {item}: {value.result ? '✅' : '❌'} - {value.reason}
                    </li>
                    ))}
                </ul>
                </div>

                {result?.scores?.length > 0 && (
                    <div className="resume-score-list">
                        <h4>部門別スコア:</h4>
                        {result.scores.map((s: any) => (
                        <div key={s.division} className="resume-score-item">
                            <p><strong>{s.division}</strong>: {s.score}点</p>
                            <p className="resume-score-reason">{s.reason}</p>
                        </div>
                        ))}
                    </div>
                )}
                </div>
            )}
            </>
        ) : (
            <ResumeScoreMatrix />
        )}
        </div>
    );
};

export default ResumeScoring;