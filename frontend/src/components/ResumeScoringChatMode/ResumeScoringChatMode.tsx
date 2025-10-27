import React, { useEffect, useState, useRef } from 'react';
import './ResumeScoringChatMode.css';
import AIProcessingScreen from './AIProcessingScreen';
import InterviewSetupInline from './InterviewSetupInline';
import { progressSteps, masterDefinitions, resolveStepId } from './progressSteps';
import appConfig from '../../config';

type DivisionOption = { name: string; prefix: string };

const ResumeScoringChatMode: React.FC<{ userId: string }> = ({ userId }) => {
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<any>(null);
    const [candidateId, setCandidateId] = useState('');
    const [divisions, setDivisions] = useState<DivisionOption[]>([]);
    const [selectedDivision, setSelectedDivision] = useState('');
    const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
    const chatEndRef = useRef<HTMLDivElement | null>(null);
    const [currentStatus, setCurrentStatus] = useState<string>('start');
    const [hrDecisionDraft, setHrDecisionDraft] = useState<'hire_ok' | 'no_hire' | ''>('');
    const [showSaved, setShowSaved] = useState(false);
    const [showInterviewForm, setShowInterviewForm] = useState(false);

    // === 部門一覧を取得 ===
    useEffect(() => {
        const fetchDivisions = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/skills`);
            const data: any[] = await res.json();

            const uniqueDivisions: DivisionOption[] = Array.from(
            new Set(
                data
                .filter((item: any) => item.division_prefix !== 'common')
                .map((item: any) => item.division_prefix as string)
            )
            ).map((prefix: string): DivisionOption => {
            const matched = data.find((item: any) => item.division_prefix === prefix);
            return {
                name: String(matched?.division || prefix),
                prefix: String(prefix),
            };
            });

            setDivisions(uniqueDivisions);
        } catch (err) {
            console.error('部門一覧の取得に失敗しました', err);
        }
        };

        fetchDivisions();
    }, []);

    // === チャットが更新されたら自動スクロール ===
    useEffect(() => {
        const t = setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100); // 100ms後にスクロール
        return () => clearTimeout(t);
    }, [messages]);

    // === 部門prefix → 和名変換 ===
    const getDivisionName = (prefix: string) => {
        const div = divisions.find((d) => d.prefix === prefix);
        return div ? div.name : prefix;
    };

    // === ファイル変更 ===
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
        setFiles(Array.from(e.target.files));
        }
    };

    // === ファイル送信処理 ===
    const handleUpload = async () => {
        if (files.length === 0) return;
        const id = candidateId || 'cand_' + Math.random().toString(36).substring(2, 10);
        setCandidateId(id);

        setLoading(true);
        setLogs([]);
        setCurrentStatus('start');
        setResult(null);
        setMessages((prev) => [
        ...prev,
        { role: 'user', text: `📎 ファイルを送信しました (${files.map((f) => f.name).join(', ')})` },
        ]);

        const formData = new FormData();
        files.forEach((file) => formData.append('files', file));
        formData.append('candidate_id', id);
        formData.append('uploader_id', userId);
        formData.append('desired_division', selectedDivision);

        try {
        const response = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok || !response.body) {
            alert('エラーが発生しました。');
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
            if (line.startsWith('data:')) {
                try {
                const json = JSON.parse(line.slice(5).trim());
                if (json.log) {
                    setLogs((prev) => [...prev, json.log]);
                    setMessages((prev) => [...prev, { role: 'ai', text: json.log }]);
                }
                if (json.status) setCurrentStatus(json.status);
                if (json.status === 'final_payload' && json.data) {
                    setResult(json.data);
                    setMessages((prev) => [
                    ...prev,
                    { role: 'ai', text: '✅ スコアリングが完了しました！結果を下に表示します。' },
                    ]);
                }
                } catch (err) {
                console.error('JSON parse error:', err, line);
                }
            }
            }
        }

        setCurrentStatus('done');
        } catch (err) {
        console.error(err);
        alert('スコアリング中にエラーが発生しました。');
        } finally {
        setLoading(false);
        }
    };

    // === HR決定保存処理 ===
    const handleSaveHrDecision = async () => {
        if (!candidateId || !hrDecisionDraft) {
        alert('候補者IDと合否を選択してください');
        return;
        }

        try {
        const res = await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
            },
            body: JSON.stringify({
            candidate_id: candidateId,
            review: { decision: hrDecisionDraft },
            }),
        });

        if (!res.ok) throw new Error('保存に失敗しました');

        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 3000); // ✅ 3秒後に消える

        if (hrDecisionDraft === 'hire_ok') {
            setMessages(prev => [
                ...prev,
                { role: 'ai', text: '💬 合格のため、面談設定を開始します。' },
            ]);
            setShowInterviewForm(true); // ✅ 合格時に面談設定フォームを出す
        }
        } catch (err) {
        console.error(err);
        alert('保存エラーが発生しました');
        }
    };

    return (
        <div className="resume-chat-layout">
        {/* 左：AIProcessingScreen */}
        <div className="left-panel">
            <AIProcessingScreen
            currentStatus={resolveStepId(currentStatus)}
            progressSteps={progressSteps}
            masterDefinitions={masterDefinitions}
            />
        </div>

        {/* 右：チャット + 結果 */}
        <div className="right-panel">
            <div className="chat-header">
            <h2>履歴書AI判定チャット</h2>
            </div>

            {/* === チャットログ === */}
            <div className="chat-window">
                {messages.map((m, i) => (
                    <div key={i} className={`chat-message ${m.role}`}>
                    {m.text}
                    </div>
                ))}

                    {/* === 結果表示 === */}
                    {result && (
                    <div className="chat-result-section">
                        <h4>🎯 AIスコアリング結果</h4>

                        {/* 希望部門 vs 推薦部門 */}
                        <div className="resume-compare-section">
                        <div className="resume-compare-card">
                            <h5>希望部門</h5>
                            <p className="resume-compare-division">
                            {getDivisionName(result.preferred_div) || '―'}
                            </p>
                            <p className="resume-compare-score">
                            {result.preferred_div_score != null ? `${result.preferred_div_score}点` : '―'}
                            </p>
                            {result.preferred_div_reason && (
                            <p className="resume-score-reason">理由: {result.preferred_div_reason}</p>
                            )}
                        </div>

                        <div className="resume-compare-card">
                            <h5>推薦部門（AI）</h5>
                            <p className="resume-compare-division">
                            {getDivisionName(result.recommended_div) ||
                                result.llm_scoring?.recommended_division ||
                                '―'}
                            </p>
                            <p className="resume-compare-score">
                            {result.recommended_div_score != null ? `${result.recommended_div_score}点` : '―'}
                            </p>
                            {result.recommended_div_reason && (
                            <p className="resume-score-reason">理由: {result.recommended_div_reason}</p>
                            )}
                        </div>
                        </div>

                        {/* === 部門別スコア === */}
                        {result.llm_scoring?.scores?.length > 0 && (
                        <div className="resume-section">
                            <h5>部門別スコア</h5>
                            {result.llm_scoring.scores.map((s: any) => (
                            <div key={s.division}>
                                <p>
                                <strong>{getDivisionName(s.division)}</strong>：{s.score}点
                                </p>
                                <p className="resume-score-reason">{s.reason}</p>
                            </div>
                            ))}
                        </div>
                        )}

                        {/* === 共通マストチェック === */}
                        {result.must_check && Object.keys(result.must_check).length > 0 && (
                        <div className="resume-section">
                            <h5>マストスキル（共通）</h5>
                            <ul className="resume-mustcheck-list">
                            {Object.entries(result.must_check).map(([label, val]: any, idx) => (
                                <li key={idx}>
                                <strong>{label}：</strong>
                                {val.result ? (
                                    <span className="mustcheck-pass">✔ 合格</span>
                                ) : (
                                    <span className="mustcheck-fail">✖ 未達</span>
                                )}
                                <p className="resume-score-reason">理由: {val.reason}</p>
                                </li>
                            ))}
                            </ul>
                        </div>
                        )}

                        {/* === 部門別マストチェック === */}
                        {result.must_check_by_division && Object.keys(result.must_check_by_division).length > 0 && (
                        <div className="resume-section">
                            <h5>部門別スキルチェック</h5>
                            {Object.entries(result.must_check_by_division).map(([division, checks]: any, idx) => (
                            <div key={idx} className="resume-division-mustcheck">
                                <h6 className="resume-division-title">{getDivisionName(division)}</h6>
                                <ul className="resume-mustcheck-list">
                                {Object.entries(checks).map(([label, val]: any, i) => (
                                    <li key={i}>
                                    <strong>{label}：</strong>
                                    {val.result ? (
                                        <span className="mustcheck-pass">✔ 合格</span>
                                    ) : (
                                        <span className="mustcheck-fail">✖ 未達</span>
                                    )}
                                    <p className="resume-score-reason">理由: {val.reason}</p>
                                    </li>
                                ))}
                                </ul>
                            </div>
                            ))}
                        </div>
                        )}
                        {/* === HR判定追加 === */}
                        <div className="hr-decision-section">
                            <h4>👥 HR最終判定</h4>
                            <div className="hr-decision-options">
                            <label>
                                <input
                                type="radio"
                                name="hrDecision"
                                value="hire_ok"
                                checked={hrDecisionDraft === 'hire_ok'}
                                onChange={(e) => setHrDecisionDraft(e.target.value as any)}
                                />
                                ✅ 合格
                            </label>
                            <label>
                                <input
                                type="radio"
                                name="hrDecision"
                                value="no_hire"
                                checked={hrDecisionDraft === 'no_hire'}
                                onChange={(e) => setHrDecisionDraft(e.target.value as any)}
                                />
                                ❌ 不合格
                            </label>
                            </div>

                            <button
                            onClick={handleSaveHrDecision}
                            disabled={!hrDecisionDraft}
                            className="save-hr-btn"
                            >
                            💾 保存する
                            </button>
                            {showSaved && <span className="saved-label">✔ 保存しました</span>}
                        </div>

                        {/* === 合格時に面談設定フォームを表示 === */}
                        {showInterviewForm && (
                            <InterviewSetupInline
                                candidateId={candidateId}
                                stage="面談・1次"
                                userId={userId}
                                onMessage={(msg) => {
                                // チャット吹き出しを追加
                                setMessages((prev) => [...prev, msg]);
                                }}
                                onFinish={() => {
                                // 終了時にフォームを閉じてメッセージ追加
                                setShowInterviewForm(false);
                                setMessages((prev) => [
                                    ...prev,
                                    { role: 'ai', text: '🎉 面談設定が完了しました！' },
                                ]);
                                }}
                            />
                        )}

                    </div>
                    )}
                <div ref={chatEndRef} />
            </div>

                {/* === 入力エリア（2行構成＋ファイル名表示） === */}
                <div className="chat-input-rows">

                    {/* === 1行目：希望部門 + 候補者ID === */}
                    <div className="chat-input-row">
                        <select
                        value={selectedDivision}
                        onChange={(e) => setSelectedDivision(e.target.value)}
                        className="chat-select"
                        >
                        <option value="">希望部門を選択</option>
                        {divisions.map((d) => (
                            <option key={d.prefix} value={d.prefix}>
                            {d.name}
                            </option>
                        ))}
                        </select>

                        <div className="candidate-id-container">
                        <input
                            type="text"
                            placeholder="候補者IDを入力"
                            value={candidateId}
                            onChange={(e) => setCandidateId(e.target.value)}
                            className="chat-candidate-input"
                        />
                        <button
                            type="button"
                            className="generate-id-btn"
                            onClick={() => {
                            const newId = 'cand_' + Math.random().toString(36).substring(2, 10);
                            setCandidateId(newId);
                            }}
                        >
                            🔄 自動生成
                        </button>
                        </div>
                    </div>

                    {/* === 2行目：ファイル選択 + ファイル名表示 + 送信ボタン === */}
                    <div className="chat-input-row second-row">
                        <div className="file-upload-container">
                        <label className="custom-file-upload">
                            📎 ファイルを選択
                            <input type="file" multiple onChange={handleFileChange} />
                        </label>

                        {/* 選択済ファイル名表示 */}
                        {files.length > 0 && (
                            <div className="file-list">
                            {files.map((file, index) => (
                                <span key={index} className="file-name">
                                {file.name}
                                {index < files.length - 1 && ', '}
                                </span>
                            ))}
                            </div>
                        )}
                        </div>

                        {/* 右端固定の送信ボタン */}
                        <div className="send-btn-container">
                        <button onClick={handleUpload} disabled={loading} className="send-btn">
                            {loading ? '処理中...' : '送信'}
                        </button>
                        </div>
                    </div>
                </div>
        </div>
        </div>
    );
};

export default ResumeScoringChatMode;