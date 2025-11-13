import React, { useEffect, useState } from 'react';
import './InterviewSetupInline.css';
import appConfig from '../../config';

interface Interviewer {
    name: string;
    email: string;
}
interface TodoItem {
    id: string;
    label: string;
}

interface Props {
    candidateId: string;
    candidateName?: string;
    stage: string;
    userId: string;
    onMessage: (msg: { role: 'ai' | 'user'; text: string }) => void;
    onFinish: () => void;
}

const InterviewSetupInline: React.FC<Props> = ({
    candidateId,
    candidateName,  // ✅ 追加
    stage,
    userId,
    onMessage,
    onFinish,
}) => {
    const [shownSteps, setShownSteps] = useState<string[]>(['interviewer']); // ✅ 履歴保持
    const [currentStep, setCurrentStep] = useState<'interviewer' | 'date' | 'todo' | 'mail' | 'done'>('interviewer');

    const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState('');
    const [interviewDate, setInterviewDate] = useState('');
    const [candidateMail, setCandidateMail] = useState('');
    const [interviewerMail, setInterviewerMail] = useState('');

    // === 初期データ読み込み ===
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/interview/config`)
        .then((res) => res.json())
        .then((data) => {
            setInterviewers(data.interviewers || []);
            setTodos(data.todos || []);
            setCandidateMail(data.email_templates?.to_candidate?.body || '');
            setInterviewerMail(data.email_templates?.to_interviewer?.body || '');
        });
    }, []);

    // === テンプレ置換 ===
    const renderTemplate = (template: string): string => {
        const mapping: Record<string, string> = {
        candidate_name: candidateId,
        interview_date: interviewDate || '',
        interviewer_name: selectedInterviewer || '',
        };
        return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => mapping[key] || '');
    };

    // === 送信処理 ===
    const handleSubmit = async () => {
        try {
        const sentText = `📨 送信内容：\n\n${renderTemplate(candidateMail)}`;
        onMessage({ role: 'user', text: sentText });
        onMessage({ role: 'ai', text: '⏳ 面談設定を送信中です...' });

        const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            candidate: candidateId,
            candidateName: candidateName || candidateId,  // ✅ 追加
            interviewer: selectedInterviewer,
            interviewDate,
            todo: todos.map((t) => t.label).join(', '),
            candidateMail: renderTemplate(candidateMail),
            interviewerMail: renderTemplate(interviewerMail),
            stage,
            userId,
            }),
        });

        if (!res.ok) throw new Error(`送信エラー: ${res.status}`);

        setCurrentStep('done');
        onMessage({ role: 'ai', text: '✅ 面談設定を保存しました！📧' });
        setTimeout(onFinish, 500);
        } catch (err: any) {
        onMessage({ role: 'ai', text: `⚠️ 送信エラー: ${err.message}` });
        }
    };

    // === 次のステップへ ===
    const goToNext = (next: 'interviewer' | 'date' | 'todo' | 'mail' | 'done') => {
        setCurrentStep(next);
        setShownSteps((prev) => (prev.includes(next) ? prev : [...prev, next]));
    };

    // === UI ===
    return (
        <div className="inline-chatflow-container">

        {/* === Step 1: 面談担当者 === */}
        {shownSteps.includes('interviewer') && (
            <>
            <div className="chat-message ai">👤 面談担当者を選んでください：</div>
            {currentStep === 'interviewer' && (
                <div className="chat-step">
                <select
                    className="inline-chatflow-select"
                    value={selectedInterviewer}
                    onChange={(e) => setSelectedInterviewer(e.target.value)}
                >
                    <option value="">選択してください</option>
                    {interviewers.map((i) => (
                    <option key={i.email} value={i.name}>
                        {i.name}（{i.email}）
                    </option>
                    ))}
                </select>
                <button
                    className="inline-chatflow-btn"
                    onClick={() => {
                    if (!selectedInterviewer) return alert('担当者を選択してください');
                    onMessage({ role: 'user', text: selectedInterviewer });
                    goToNext('date');
                    }}
                >
                    次へ
                </button>
                </div>
            )}
            </>
        )}

        {/* === Step 2: 面談日程 === */}
        {shownSteps.includes('date') && (
            <>
            <div className="chat-message ai">🗓️ 面談日程を入力してください：</div>
            {currentStep === 'date' && (
                <div className="chat-step">
                <input
                    type="datetime-local"
                    className="inline-chatflow-input"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                />
                <button
                    className="inline-chatflow-btn"
                    onClick={() => {
                    if (!interviewDate) return alert('面談日程を入力してください');
                    onMessage({ role: 'user', text: interviewDate });
                    goToNext('todo');
                    }}
                >
                    次へ
                </button>
                </div>
            )}
            </>
        )}

        {/* === Step 3: TODO === */}
        {shownSteps.includes('todo') && (
            <>
            <div className="chat-message ai">📝 面談前TODOを確認してください：</div>
            {currentStep === 'todo' && (
                <div className="chat-step">
                <ul className="inline-chatflow-todo-list no-check">
                    {todos.map((t) => (
                    <li key={t.id} className="inline-chatflow-todo-item">
                        ・{t.label}
                    </li>
                    ))}
                </ul>
                <button
                    className="inline-chatflow-btn"
                    onClick={() => {
                    onMessage({ role: 'user', text: 'TODOを確認しました。' });
                    goToNext('mail');
                    }}
                >
                    確認しました
                </button>
                </div>
            )}
            </>
        )}

        {/* === Step 4: メール === */}
        {shownSteps.includes('mail') && (
            <>
            <div className="chat-message ai">📧 候補者宛メールテンプレート：</div>
            {currentStep === 'mail' && (
                <div className="chat-step">
                <textarea
                    className="inline-chatflow-textarea"
                    rows={4}
                    value={candidateMail}
                    onChange={(e) => setCandidateMail(e.target.value)}
                />
                <p className="inline-chatflow-preview">プレビュー:</p>
                <div className="inline-chatflow-preview-box">{renderTemplate(candidateMail)}</div>
                <button className="inline-chatflow-btn" onClick={handleSubmit}>
                    送信
                </button>
                </div>
            )}
            </>
        )}
        </div>
    );
};

export default InterviewSetupInline;