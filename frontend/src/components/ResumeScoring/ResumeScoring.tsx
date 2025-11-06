import React, { useEffect, useState } from 'react';
import './ResumeScoring.css';
import CandidateScoreMatrix from '../CandidateScoreMatrix/CandidateScoreMatrix.tsx';
import HRFinalReviewDashboard from '../HRFinalReviewDashboard/HRFinalReviewDashboard.tsx';
import AIProcessingScreen from './AIProcessingScreen.tsx';
import { progressSteps, masterMap, masterDefinitions, resolveStepId } from './progressSteps.ts'
import appConfig from '../../config.ts';

type ViewMode = 'form' | 'matrix' | 'hr';
type DivisionOption = { name: string; prefix: string };

const ResumeScoring: React.FC<{ userId: string }> = ({ userId }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [currentStatus, setCurrentStatus] = useState<string>('');
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<any>(null);
    const [candidateId, setCandidateId] = useState<string>('');
    const [viewMode, setViewMode] = useState<ViewMode>('form');
    const [divisions, setDivisions] = useState<DivisionOption[]>([]);
    const [selectedDivision, setSelectedDivision] = useState<string>('');

    useEffect(() => {
        const autoId = 'cand_' + Math.random().toString(36).substring(2, 10);
        setCandidateId(autoId);
    }, []);

    const getDivisionName = (prefix: string) => {
        const div = divisions.find(d => d.prefix === prefix);
        return div ? div.name : prefix;
    };

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
                        name: matched?.division || prefix,
                        prefix
                    };
                });

                setDivisions(uniqueDivisions);
            } catch (err) {
                console.error('部門一覧の取得に失敗しました', err);
            }
        };

        fetchDivisions();
    }, []);

    const handleSubmit = async () => {
        if (files.length === 0 || !candidateId) return;

        setLoading(true);
        setCurrentStatus("start");
        setLogs([]);

        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        formData.append("candidate_id", candidateId);
        formData.append("uploader_id", userId);
        formData.append("desired_division", selectedDivision);

        try {
            const response = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
                method: "POST",
                body: formData,
            });

            if (!response.ok || !response.body) {
                const errorData = await response.json();
                alert(`エラー: ${errorData.error}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                    if (line.startsWith("data:")) {
                        try {
                            const json = JSON.parse(line.slice(5).trim());
                            if (json.log) setLogs((prev) => [...prev, json.log]);
                            if (json.status) setCurrentStatus(json.status);
                            if (json.status === "final_payload" && json.data) setResult(json.data);
                        } catch (err) {
                            console.error("JSON parse error:", err, line);
                        }
                    }
                }
            }

            setCurrentStatus("done");
        } catch (err) {
            console.error(err);
            alert("スコアリング中にエラーが発生しました。");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`resume-container ${viewMode === 'matrix' ? 'wide-view' : ''}`}>
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

                    {/* ✅ ChatModeと同じUI */}
                    <div className="chat-input-container">
                        {/* 希望部門 */}
                        <div className="chat-input-row">
                            <select
                                className="chat-division-select"
                                value={selectedDivision}
                                onChange={(e) => setSelectedDivision(e.target.value)}
                            >
                                <option value="">希望部門を選択</option>
                                {divisions.map((d) => (
                                    <option key={d.prefix} value={d.prefix}>
                                        {d.name}
                                    </option>
                                ))}
                            </select>

                            {/* 候補者ID */}
                            <input
                                type="text"
                                className="chat-candidate-id-input"
                                value={candidateId}
                                readOnly
                                placeholder="候補者ID（自動生成）"
                            />
                        </div>

                        {/* ファイルドロップゾーン */}
                        <div 
                            className="chat-file-drop-zone"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                    setFiles(Array.from(e.dataTransfer.files));
                                    setResult(null);
                                    setLogs([]);
                                    setCurrentStatus('');
                                }
                            }}
                        >
                            <input
                                type="file"
                                multiple
                                accept=".pdf,.doc,.docx,.xls,.xlsx"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                        setFiles(Array.from(e.target.files));
                                        setResult(null);
                                        setLogs([]);
                                        setCurrentStatus('');
                                    }
                                }}
                                style={{ display: 'none' }}
                                id="file-input-resume"
                            />
                            <label htmlFor="file-input-resume" className="chat-file-drop-label">
                                {files.length > 0 ? (
                                    <div className="chat-files-selected">
                                        {files.map((f, i) => (
                                            <div key={i} className="chat-file-item">
                                                📄 {f.name}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="chat-file-placeholder">
                                        📁 ファイルをドラッグ&ドロップ または クリック
                                    </div>
                                )}
                            </label>
                        </div>

                        {/* 送信ボタン */}
                        <button
                            onClick={handleSubmit}
                            disabled={files.length === 0 || loading || !candidateId}
                            className="chat-upload-button"
                        >
                            {loading ? '処理中...' : '送信'}
                        </button>
                    </div>

                    {loading && (
                        <AIProcessingScreen
                            currentStatus={resolveStepId(currentStatus)}
                            logs={logs}
                            progressSteps={progressSteps}
                            masterMap={masterMap}
                            masterDefinitions={masterDefinitions}
                        />
                    )}

                    {result && (
                        <div className="resume-result">
                            <div className="resume-compare-section">
                                <div className="resume-compare-card">
                                    <h4>希望部門</h4>
                                    <p className="resume-compare-division">
                                        {getDivisionName(result.preferred_div) || '―'}
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

                            {result.llm_scoring?.scores?.length > 0 && (
                                <div className="resume-section">
                                    <h4>部門別スコア:</h4>
                                    {result.llm_scoring.scores.map((s: any) => (
                                        <div key={s.division}>
                                            <p><strong>{getDivisionName(s.division)}</strong>: {s.score}点</p>
                                            <p className="resume-score-reason">{s.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

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

                            {result.must_check && Object.keys(result.must_check).length > 0 && (
                                <div className="resume-section">
                                    <h4>マストチェック項目（共通）</h4>
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

                            {result.must_check_by_division && Object.keys(result.must_check_by_division).length > 0 && (
                                <div className="resume-section">
                                    <h4>部門別マストチェック</h4>
                                    {Object.entries(result.must_check_by_division).map(([division, checks]: any, idx) => (
                                        <div key={idx} className="resume-division-mustcheck">
                                            <h5 className="resume-division-title">{getDivisionName(division)}</h5>
                                            <ul className="resume-mustcheck-list">
                                                {Object.entries(checks).map(([label, val]: any, i) => (
                                                    <li key={i}>
                                                        <strong>{label}：</strong>
                                                        {val.result
                                                            ? <span className="mustcheck-pass">✔ 合格</span>
                                                            : <span className="mustcheck-fail">✖ 未達</span>}
                                                        <p className="resume-score-reason">理由: {val.reason}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
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