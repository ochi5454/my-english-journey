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
    stage: string;
    userId: string;
    onMessage: (msg: { role: 'ai' | 'user'; text: string }) => void;
    onFinish: () => void;
}

const InterviewSetupInline: React.FC<Props> = ({ candidateId, stage, onMessage, onFinish }) => {
    const [interviewStep, setInterviewStep] = useState<'interviewer' | 'date' | 'todo' | 'mail' | 'done'>('interviewer');
    const [interviewerList, setInterviewerList] = useState<Interviewer[]>([]);
    const [todoList, setTodoList] = useState<TodoItem[]>([]);
    const [selectedInterviewer, setSelectedInterviewer] = useState('');
    const [interviewDate, setInterviewDate] = useState('');
    const [selectedTodos] = useState<string[]>([]);
    const [candidateMail, setCandidateMail] = useState('');
    const [interviewerMail, setInterviewerMail] = useState('');

    // 初回ロード：設定データ取得
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/interview/config`)
        .then(res => res.json())
        .then(data => {
            setInterviewerList(data.interviewers || []);
            setTodoList(data.todos || []);
            setCandidateMail(data.email_templates.to_candidate.body || '');
            setInterviewerMail(data.email_templates.to_interviewer.body || '');
        });
    }, []);

    const renderTemplate = (template: string): string => {
        const mapping: Record<string, string> = {
        candidate_name: candidateId,
        interview_date: interviewDate || '',
        interviewer_name: selectedInterviewer || '',
        };
        return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => mapping[key] || '');
    };

    const handleSubmit = async () => {
        try {
            // 送信内容をチャットに残す
            const sentText = `📨 送信内容：\n\n${renderTemplate(candidateMail)}`;
            onMessage({ role: 'user', text: sentText });

            // 送信中メッセージ
            onMessage({ role: 'ai', text: '⏳ 面談設定を送信中です...' });

            const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                candidate: candidateId,
                interviewer: selectedInterviewer,
                interviewDate,
                todo: selectedTodos.join(', '),
                candidateMail: renderTemplate(candidateMail),
                interviewerMail: renderTemplate(interviewerMail),
                stage,
            }),
            });

            if (!res.ok) throw new Error(`送信エラー: ${res.status}`);

            // ✅ メール送信UIを閉じる
            setInterviewStep('done');

            // ✅ 完了メッセージを順に表示
            setTimeout(() => {
            onMessage({ role: 'ai', text: '✅ 面談設定を保存しました！📧' });

            // 完了吹き出しを少し遅らせて出す
            setTimeout(() => {
                onFinish();
            }, 500);
            }, 400);

        } catch (err: any) {
            onMessage({ role: 'ai', text: `⚠️ 送信エラー: ${err.message}` });
        }
    };

    // 各ステップのUI
    return (
        <div className="inline-chatflow-container">
        {interviewStep === 'interviewer' && (
            <div className="chat-message ai">
            <p>👤 面談担当者を選んでください：</p>
            <select
                className="inline-chatflow-select"
                value={selectedInterviewer}
                onChange={(e) => {
                const name = e.target.value;
                setSelectedInterviewer(name);
                onMessage({ role: 'user', text: name });
                setInterviewStep('date');
                }}
            >
                <option value="">選択してください</option>
                {interviewerList.map((i) => (
                <option key={i.email} value={i.name}>{i.name}（{i.email}）</option>
                ))}
            </select>
            </div>
        )}

        {interviewStep === 'date' && (
            <div className="chat-message ai">
            <p>🗓️ 面談日程を入力してください：</p>
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
                setInterviewStep('todo');
                }}
            >
                次へ
            </button>
            </div>
        )}

        {interviewStep === 'todo' && (
            <div className="chat-message ai">
                <p>📝 面談前TODOを確認してください：</p>

                {/* TODO一覧（チェックなし） */}
                <ul className="inline-chatflow-todo-list no-check">
                {todoList.map((t) => (
                    <li key={t.id} className="inline-chatflow-todo-item">
                    ・{t.label}
                    </li>
                ))}
                </ul>

                {/* 確認ボタンのみ */}
                <button
                className="inline-chatflow-btn"
                onClick={() => {
                    onMessage({
                    role: 'user',
                    text: 'TODOを確認しました。',
                    });
                    setInterviewStep('mail');
                }}
                >
                確認しました
                </button>
            </div>
        )}

        {interviewStep === 'mail' && (
            <div className="chat-message ai">
            <p>📧 候補者宛メールテンプレート：</p>
            <textarea
                className="inline-chatflow-textarea"
                rows={4}
                value={candidateMail}
                onChange={(e) => setCandidateMail(e.target.value)}
            />
            <p className="inline-chatflow-preview">プレビュー:</p>
            <div className="inline-chatflow-preview-box">{renderTemplate(candidateMail)}</div>
            <button className="inline-chatflow-btn" onClick={handleSubmit}>送信</button>
            </div>
        )}
        </div>
    );
};

export default InterviewSetupInline;