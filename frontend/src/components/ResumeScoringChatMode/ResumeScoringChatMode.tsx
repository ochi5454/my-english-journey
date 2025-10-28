import React, { useEffect, useState, useRef } from 'react';
import './ResumeScoringChatMode.css';
import AIProcessingScreen from './AIProcessingScreen';
import ResumeResultSection from './ResumeResultSection';
import HRDecisionSection from './HRDecisionSection';
import InterviewSetupInline from './InterviewSetupInline';
import ChatInputArea, { type DivisionOption } from './ChatInputArea';
import DummyAILogGenerator from './DummyAILogGenerator';
import { progressSteps, masterDefinitions, resolveStepId } from './progressSteps';
import appConfig from '../../config';

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
    // ダミーログ用
    const [lastLogTime, setLastLogTime] = useState<number | null>(null);
    const [shouldShowDummy, setShouldShowDummy] = useState(false);

    // --- 特殊マーカー定義 ---
    const MSG_RESULT = '__RESULT__';
    const MSG_HR = '__HR__';
    const MSG_INTERVIEW = '__INTERVIEW__';

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

    // === チャット更新時にスクロール ===
    useEffect(() => {
        const t = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        return () => clearTimeout(t);
    }, [messages]);

    const getDivisionName = (prefix: string) => {
        const div = divisions.find((d) => d.prefix === prefix);
        return div ? div.name : prefix;
    };

    // === ファイル送信 ===
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
                            // まずログ受信の記録
                            setLastLogTime(Date.now());
                            const logText = json.log;

                            // ✅ dataText の生成前に空チェックを追加
                            const hasData =
                                json.data &&
                                !(
                                (typeof json.data === 'object' && Object.keys(json.data).length === 0) ||
                                (Array.isArray(json.data) && json.data.length === 0)
                                );

                            const dataText = hasData ? JSON.stringify(json.data, null, 2) : null;

                            setMessages((prev) => [
                                ...prev,
                                { role: 'ai' as const, text: logText },
                                ...(dataText ? [{ role: 'ai' as const, text: `\`\`\`json\n${dataText}\n\`\`\`` }] : []),
                            ]);
                        }
                        if (json.status) setCurrentStatus(json.status);
                        if (json.status === 'final_payload' && json.data) {
                            setResult(json.data);
                            setMessages((prev) => [
                                ...prev,
                                { role: 'ai', text: '✅ スコアリングが完了しました！結果を以下に表示します。' },
                                { role: 'ai', text: MSG_RESULT },
                                { role: 'ai', text: '🧩 これからHR最終判定をお願いします。' },
                                { role: 'ai', text: MSG_HR },
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

    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(() => {
            const now = Date.now();
            const threshold = 3000 + Math.random() * 1500; // 3〜4.5秒
            if (lastLogTime && now - lastLogTime > threshold) {
            setShouldShowDummy(true);
            }
        }, 1200 + Math.random() * 800);
        return () => clearInterval(interval);
    }, [lastLogTime, loading]);

    // === HR決定保存 ===
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
            setTimeout(() => setShowSaved(false), 3000);

            if (hrDecisionDraft === 'hire_ok') {
                setMessages((prev) => [
                    ...prev,
                    { role: 'ai', text: '💬 合格のため、面談設定を開始します。' },
                    { role: 'ai', text: MSG_INTERVIEW },
                ]);
            }
        } catch (err) {
            console.error(err);
            alert('保存エラーが発生しました');
        }
    };

    return (
        <div className="resume-chat-layout">
        {/* 左：AIProcessing */}
        <div className="left-panel">
            <AIProcessingScreen
            currentStatus={resolveStepId(currentStatus)}
            progressSteps={progressSteps}
            masterDefinitions={masterDefinitions}
            />
        </div>

        {/* 右：チャット */}
        <div className="right-panel">
            <div className="chat-header">
            <h2>履歴書AI判定チャット</h2>
            </div>

            <div className="chat-window">
            {messages.map((m, i) => (
                <div key={i} className={`chat-message ${m.role}`}>
                {m.text === MSG_RESULT ? (
                    <ResumeResultSection result={result} getDivisionName={getDivisionName} />
                ) : m.text === MSG_HR ? (
                    <HRDecisionSection
                        hrDecisionDraft={hrDecisionDraft}
                        setHrDecisionDraft={setHrDecisionDraft}
                        showSaved={showSaved}
                        onSave={handleSaveHrDecision}
                    />
                ) : m.text === MSG_INTERVIEW ? (
                    <InterviewSetupInline
                        candidateId={candidateId}
                        stage="面談・1次"
                        userId={userId}
                        onMessage={(msg) => setMessages((prev) => [...prev, msg])}
                        onFinish={() => {
                        setMessages((prev) => [
                            ...prev,
                            { role: 'ai', text: '🎉 面談設定が完了しました！' },
                        ]);
                        }}
                    />
                ) : (
                    m.text
                )}
                </div>
            ))}
            <div ref={chatEndRef} />
        </div>

        {/* === 入力行 === */}
        <ChatInputArea
            divisions={divisions}
            selectedDivision={selectedDivision}
            setSelectedDivision={setSelectedDivision}
            candidateId={candidateId}
            setCandidateId={setCandidateId}
            files={files}
            setFiles={setFiles}
            loading={loading}
            handleUpload={handleUpload}
        />
        {/* ダミーレスポンス */}
        <DummyAILogGenerator
            active={false} // 常時ではなく、トリガーで出す
            trigger={shouldShowDummy}
            onLog={(log) => {
                setMessages((prev) => [...prev, { role: 'ai', text: log }]);
                setShouldShowDummy(false); // 出したらリセット
                setLastLogTime(Date.now()); // ダミーも「最新ログ」として扱う
            }}
        />
        </div>
    </div>
    );
};

export default ResumeScoringChatMode;