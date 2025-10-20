import React, { useEffect, useState } from 'react';
import './ResumeScoring.css';
import CandidateScoreMatrix from '../CandidateScoreMatrix/CandidateScoreMatrix.tsx';
import HRFinalReviewDashboard from '../HRFinalReviewDashboard/HRFinalReviewDashboard.tsx';
import appConfig from '../../config.ts';

type ViewMode = 'form' | 'matrix' | 'hr';
type DivisionOption = { name: string; prefix: string };

const ResumeScoring: React.FC<{ userId: string }> = ({ userId }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [candidateId, setCandidateId] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('form');
    const [divisions, setDivisions] = useState<DivisionOption[]>([]);
    const [selectedDivision, setSelectedDivision] = useState<string>('');

    // prefix → 和名に変換する lookup 関数をつくっておく
    const getDivisionName = (prefix: string) => {
        const div = divisions.find(d => d.prefix === prefix);
        return div ? div.name : prefix;  // ← fallbackで prefix をそのまま出すようにする
    };

    // 部門一覧を取得（division_prefix ≠ "common" のみ）
    useEffect(() => {
        const fetchDivisions = async () => {
            try {
                const response = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
                const data: any[] = await response.json();

                const uniqueDivisions: DivisionOption[] = Array.from(
                    new Set(data.filter((item) => item.division_prefix !== 'common')
                                .map((item) => item.division_prefix))
                ).map(prefix => {
                    const matched = data.find((item) => item.division_prefix === prefix);
                    return {
                        name: matched?.division || prefix, // ← 表示する和名
                        prefix                       // ← 保存・API送信用の値
                    };
                });

                setDivisions(uniqueDivisions);
            } catch (err) {
                console.error('部門一覧の取得に失敗しました', err);
            }
        };

        fetchDivisions();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFiles(Array.from(e.target.files));
        }
    };

    const generateCandidateId = () => {
        const id = 'cand_' + Math.random().toString(36).substring(2, 10);
        setCandidateId(id);
    };

    const handleSubmit = async () => {
        if (files.length === 0 || !candidateId) return;
        setLoading(true);
        const formData = new FormData();
        files.forEach((file) => formData.append('files', file)); // ← 複数append
        formData.append('candidate_id', candidateId);
        formData.append('uploader_id', userId);
        formData.append('desired_division', selectedDivision);

        try {
            const response = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
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
            履歴書判定
        </div>
        <div
            className={`resume-tab ${viewMode === 'matrix' ? 'active' : ''}`}
            onClick={() => setViewMode('matrix')}
        >
            候補者一覧
        </div>
        <div
            className={`resume-tab ${viewMode === 'hr' ? 'active' : ''}`}
            onClick={() => setViewMode('hr')}
        >
            候補者全評価
        </div>
        </div>

        {viewMode === 'form' ? (
            <>
                <h2 className="resume-title">履歴書AI判定</h2>

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

                {/* 希望部門プルダウン */}
                <div className="resume-upload">
                    <label htmlFor="divisionSelect">希望部門:</label>
                    <select
                        id="divisionSelect"
                        className="resume-select" 
                        value={selectedDivision}
                        onChange={(e) => setSelectedDivision(e.target.value)}
                        >
                        <option value="">選択してください</option>
                        {divisions.map((d) => (
                            <option key={d.prefix} value={d.prefix}>
                            {d.name} {/* ← 和名表示 */}
                            </option>
                        ))}
                    </select>
                </div>


                {/* ✅ 複数ファイル選択可能に変更 */}
                <div className="resume-upload">
                    <label htmlFor="resumeFile">
                        応募書類を選択（PDF / DOCX / XLSX）※複数選択可
                    </label><br />
                    <input
                        id="resumeFile"
                        type="file"
                        accept=".pdf,.doc,.docx,.xlsx,.xls"
                        multiple // ← ここを追加
                        onChange={handleFileChange}
                    />
                </div>

                {/* ✅ ファイルプレビュー表示 */}
                {files.length > 0 && (
                    <div className="resume-file-list">
                        <h4>選択中のファイル:</h4>
                        <ul>
                            {files.map((f) => (
                                <li key={f.name}>{f.name}</li>
                            ))}
                        </ul>
                    </div>
                )}

                <button
                    onClick={handleSubmit}
                    disabled={files.length === 0 || loading || !candidateId}
                    className="resume-submit"
                >
                    {loading ? 'スコアリング中...' : '送信'}
                </button>

                {result && (
                    <div className="resume-result">

                        {/* ✅ 希望部門と推薦部門の比較カード */}
                        <div className="resume-compare-section">
                        <div className="resume-compare-card">
                            <h4>希望部門</h4>
                            <p className="resume-compare-division">
                            {getDivisionName(result.preferred_div) || '―' }
                            </p>
                            <p className="resume-compare-score">
                            {result.preferred_div_score !== null && result.preferred_div_score !== undefined
                                ? `${result.preferred_div_score}点`
                                : '―'}
                            </p>
                            {result.preferred_div_reason && (
                            <p className="resume-score-reason">理由: {result.preferred_div_reason}</p>
                            )}
                        </div>

                        <div className="resume-compare-card">
                            <h4>推薦部門（AI）</h4>
                            <p className="resume-compare-division">
                            {getDivisionName(result.recommended_div) || result.llm_scoring?.recommended_division || '―'}
                            </p>
                            <p className="resume-compare-score">
                            {result.recommended_div_score !== null && result.recommended_div_score !== undefined
                                ? `${result.recommended_div_score}点`
                                : '―'}
                            </p>
                            {result.recommended_div_reason && (
                            <p className="resume-score-reason">理由: {result.recommended_div_reason}</p>
                            )}
                        </div>
                        </div>

                        {/* === 部門別スコア === */}
                        {result.llm_scoring?.scores?.length > 0 && (
                        <div className="resume-section">
                            <h4>部門別スコア:</h4>
                            {result.llm_scoring.scores.map((s: any) => (
                            <div key={s.division}>
                                <p><strong>{s.division}</strong>: {s.score}点</p>
                                <p className="resume-score-reason">{s.reason}</p>
                            </div>
                            ))}
                        </div>
                        )}

                        {/* === 志望動機 === */}
                        {(result.summarized_motivation || result.score_motivation) && (
                        <div className="resume-section">
                            <h4>志望動機</h4>
                            {result.summarized_motivation && (
                            <p><strong>要約：</strong>{result.summarized_motivation}</p>
                            )}
                            {result.score_motivation !== undefined && (
                            <p><strong>スコア：</strong>{result.score_motivation}点</p>
                            )}
                        </div>
                        )}

                        {/* === 職務経歴 === */}
                        {(result.summarized_work || result.score_work) && (
                        <div className="resume-section">
                            <h4>職務経歴</h4>
                            {result.summarized_work && (
                            <p><strong>要約：</strong>{result.summarized_work}</p>
                            )}
                            {result.score_work !== undefined && (
                            <p><strong>スコア：</strong>{result.score_work}点</p>
                            )}
                        </div>
                        )}

                        {/* === マストチェック === */}
                        {result.must_check && Object.keys(result.must_check).length > 0 && (
                            <div className="resume-section">
                                <h4>マストチェック項目</h4>
                                <ul className="resume-mustcheck-list">
                                {Object.entries(result.must_check).map(([label, val]: any, idx) => (
                                    <li key={idx}>
                                    <strong>{label}：</strong>
                                    {val.result
                                        ? <span className="mustcheck-pass">✔ 合格</span>
                                        : <span className="mustcheck-fail">✖ 未達</span>}
                                    <p className="resume-score-reason">理由: {val.reason}</p>
                                    </li>
                                ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </>
        ) : viewMode === 'matrix' ? (
            <div>
                <h2 className="resume-title">候補者一覧</h2>
            <CandidateScoreMatrix interviewerId={userId}/>
            </div>
        ) : viewMode === 'hr' ? (
            <div>
                <h2 className="resume-title">候補者全評価</h2>
            <HRFinalReviewDashboard interviewerId={userId}/>
            </div>
        ) : null}
        </div>
    );
};

export default ResumeScoring;