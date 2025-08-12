import React, { useState, useEffect } from 'react';

interface Props {
    candidateId: string;
    stage: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        prepItems: { question: string; answer: string }[];
        reviewedResume: boolean;
    }) => void;
    initialData?: {
        prepItems?: { question: string; answer: string }[];
        reviewedResume?: boolean;
    };
    onAiReviewed?: (updatedResult: any) => void; // 2025.8.12 Add（candidate score update after interview）
}

const ResumeInterviewPreparationSlidePanel: React.FC<Props> = ({
    candidateId,
    stage,
    isOpen,
    onClose,
    onSubmit,
    initialData,
    onAiReviewed // 2025.8.12 Add（candidate score update after interview）
}) => {
    const [prepItems, setPrepItems] = useState<{ question: string; answer: string }[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [reviewedResume, setReviewedResume] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false); // 2025.8.12 Add（candidate score update after interview）

    useEffect(() => {
        if (isOpen) {
        setPrepItems(initialData?.prepItems || []);
        setReviewedResume(initialData?.reviewedResume || false);
        setNewQuestion('');
        }
    }, [isOpen, initialData]);

    const addQuestion = () => {
        if (newQuestion.trim() === '') return;
        setPrepItems([...prepItems, { question: newQuestion.trim(), answer: '' }]);
        setNewQuestion('');
    };

    const updateAnswer = (index: number, answer: string) => {
        const updated = [...prepItems];
        updated[index].answer = answer;
        setPrepItems(updated);
    };

    const handleDelete = (index: number) => {
        const updated = [...prepItems];
        updated.splice(index, 1);
        setPrepItems(updated);
    };

    const moveItemUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...prepItems];
    [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
    setPrepItems(newItems);
    };

    const moveItemDown = (index: number) => {
    if (index === prepItems.length - 1) return;
    const newItems = [...prepItems];
    [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
    setPrepItems(newItems);
    };

    const handleSubmit = () => {
        onSubmit({ prepItems, reviewedResume });
        onClose();
    };

    // 2025.8.12 Add（candidate score update after interview）START
    const handleAiReview = async () => {
        try {
        setIsReviewing(true);

        // 1) まず現状のQAを保存（ベストエフォート）
        try {
            await fetch('/interview/prep', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                interviewer_id: 'user123',           // TODO: ログインIDに差し替え
                candidate_id: candidateId,
                stage,
                prepItems,
                reviewedResume
            })
            });
        } catch {
            // 保存失敗は致命ではないので継続
        }

        // 2) AI再スコア
        const res = await fetch('/interview/review-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            interviewer_id: 'user123',            // TODO: ログインIDに差し替え
            candidate_id: candidateId,
            stage,
            prepItems,
            reviewedResume 
            })
        });

        if (!res.ok) throw new Error(`再スコアに失敗しました: ${res.status}`);

        const updated = await res.json();
        onAiReviewed?.(updated); // 親に最新を渡す
        alert('AIが面談QAを考慮してスコアを再評価しました。');
        onClose();
        } catch (e: any) {
        alert(e.message || 'AI再スコア時にエラーが発生しました');
        } finally {
        setIsReviewing(false);
        }
    };
    // 2025.8.12 Add（candidate score update after interview）END

    return (
        <>
        <div className="slide-overlay" onClick={onClose}></div>
        <div className={`slide-panel ${isOpen ? 'open' : ''}`}>
            <div className="slide-panel-header">
            <h3>{stage} の質問リスト: {candidateId}</h3>
            <button className="slide-close" onClick={onClose}>✖</button>
            </div>

            <div className="resume-interview-field">
            <label>📋 新しい質問を追加:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="例: なぜ弊社を志望しましたか？"
                style={{ flexGrow: 1 }}
                />
                <button onClick={addQuestion}>追加</button>
            </div>
            </div>

            <div className="resume-interview-list">
            {prepItems.map((item, idx) => (
                <div key={item.question} className="resume-interview-item">
                <div className="resume-question-header">
                    <strong>Q{idx + 1}:</strong> {item.question}
                </div>
                <textarea
                    rows={3}
                    className="resume-answer-textarea"
                    value={item.answer}
                    onChange={(e) => updateAnswer(idx, e.target.value)}
                    placeholder="想定される回答や実際の回答メモ"
                />
                <div className="resume-interview-actions">
                    <button className="small-button" onClick={() => moveItemUp(idx)} disabled={idx === 0}>↑ 上へ</button>
                    <button className="small-button" onClick={() => moveItemDown(idx)} disabled={idx === prepItems.length - 1}>↓ 下へ</button>
                    <button className="small-button danger" onClick={() => handleDelete(idx)}>🗑️ 削除</button>
                </div>
                </div>
            ))}
            </div>

            <div className="resume-interview-field">
            <label>
                <input
                type="checkbox"
                checked={reviewedResume}
                onChange={(e) => setReviewedResume(e.target.checked)}
                />
                履歴書は事前に確認済みです
            </label>
            </div>

            <div className="modal-actions resume-modal-actions">
            <button onClick={handleSubmit}>保存</button>
            <button onClick={handleAiReview} disabled={isReviewing} className="resume-ai-rescore">
                {isReviewing ? '再スコア中…' : 'AIスコア精査'}
            </button>
            <button onClick={onClose} className="cancel-button">キャンセル</button>
            </div>
        </div>
        </>
    );
};

export default ResumeInterviewPreparationSlidePanel;