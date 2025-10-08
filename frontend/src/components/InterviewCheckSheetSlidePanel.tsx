import React, { useState, useEffect, useCallback } from 'react';
import './InterviewCheckSheetSlidePanel.css';
import { RatingBar } from './CommonRatingBar.tsx';
import { RubricHint } from './CommonRubricHint.tsx';
import Accordion from './CommonAccordion.tsx';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ConfigResponse, QualitativeItem, QuantitativeItem } from "./InterviewCheckSheet.ts";
import appConfig from '../config.ts';

type FocusTag = {
    id: string;
    label: string;
};

export interface PrepItem {
    question_id: string;
    question: string;
    answer: string;
    tags?: string[];
}

export interface QuantitativeRow {
    level: number;
    comment: string;
}

export interface Props {
    interviewerId: string;
    candidateId: string;
    stage: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        prepItems: PrepItem[];
        reviewedResume: boolean;
        qualitative?: Record<string, string>;
        quantitative?: Record<string, QuantitativeRow>;
        hiringDecision?: string;
        recommendedDivision?: string;
        recommendedTitle?: string;
    }) => void;
    initialData?: {
        prepItems?: PrepItem[];
        reviewedResume?: boolean;
        qualitative?: Record<string, string>;
        quantitative?: Record<string, QuantitativeRow>;
        ai_score_reviewed?: boolean;
    };
    loadingInitial?: boolean;
    onAiReviewed?: (updatedResult: any) => void;
}

const fetchConfig = async (interviewerId: string): Promise<ConfigResponse> => {
    const res = await fetch(`${appConfig.API_BASE_URL}/checksheet/config`, {
        headers: {
        'x-user-id': interviewerId
        }
    });
    if (!res.ok) throw new Error('設定の取得に失敗しました');
    return res.json();
};

const defaultQual = (items: QualitativeItem[]): Record<string, string> =>
    items.reduce((acc: Record<string, string>, item: QualitativeItem) => {
        acc[item.key] = '';
        return acc;
    }, {});

const defaultQuant = (items: QuantitativeItem[]): Record<string, QuantitativeRow> =>
    items.reduce((acc: Record<string, QuantitativeRow>, item: QuantitativeItem) => {
        acc[item.key] = { level: 0, comment: '' };
        return acc;
    }, {});

const InterviewCheckSheetSlidePanel: React.FC<Props> = ({
    interviewerId,
    candidateId,
    stage,
    isOpen,
    onClose,
    onSubmit,
    initialData,
    onAiReviewed,
}) => {
    const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [reviewedResume, setReviewedResume] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [qualitative, setQualitative] = useState<Record<string, string>>({});
    const [quantitative, setQuantitative] = useState<Record<string, QuantitativeRow>>({});
    const [config, setConfig] = useState<ConfigResponse | null>(null);
    const [newQuestionTags, setNewQuestionTags] = useState<string[]>([]);
    const [editTagIndex, setEditTagIndex] = useState<number | null>(null);
    const [aiScoreReviewed, setAiScoreReviewed] = useState<boolean>(false);


    const applyToState = useCallback((src: any = {}, cfg: ConfigResponse) => {
        setPrepItems(src.prepItems || []);
        setReviewedResume(!!src.reviewedResume);
        setAiScoreReviewed(!!src.ai_score_reviewed);

        const normalizedPrepItems = (src.prepItems || []).map((item: any) => {
            const tags = (item.tags || []).map((t: any) => typeof t === 'string' ? t : t.id);
            return { ...item, tags };
        });
        setPrepItems(normalizedPrepItems);

        const ql = defaultQual(cfg.qualitativeItems);

        // 🟢 snake_case → camelCase 変換関数
        const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

        cfg.qualitativeItems.forEach(({ key }) => {
            // 同じ意味のキーを src.qualitative から探す
            const srcKey = Object.keys(src.qualitative || {}).find(
            (k) => snakeToCamel(k) === key
            );
            ql[key] = src.qualitative?.[srcKey ?? key] || '';
        });

        ['hiringDecision', 'recommendedDivision', 'recommendedTitle'].forEach((key) => {
            if (src[key] !== undefined && src[key] !== null) {
                ql[key] = src[key];
            }
        });

        setQualitative(ql);

        const qt = defaultQuant(cfg.quantitativeItems);
        cfg.quantitativeItems.forEach(({ key }) => {
            const row = src.quantitative?.[key] || {};
            qt[key] = {
            level: [1, 2, 3, 4, 5].includes(row.level) ? row.level : 0,
            comment: row.comment || '',
            };
        });
        setQuantitative(qt);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        (async () => {
        try {
            const cfg = await fetchConfig(interviewerId);
            setConfig(cfg);
            applyToState(initialData || {}, cfg);
        } catch (e: unknown) {
            const err = e as Error;
            alert(err.message);
        }
        })();
    }, [isOpen, initialData, applyToState, interviewerId]);

    const handleSubmit = () => {
        onSubmit({
            prepItems,
            reviewedResume,
            qualitative,
            quantitative,
            hiringDecision: qualitative.hiringDecision,
            recommendedDivision: qualitative.recommendedDivision,
            recommendedTitle: qualitative.recommendedTitle,
        });
        onClose();
    };

    const handleAiReview = async () => {
        try {
        setIsReviewing(true);
        await fetch(`${appConfig.API_BASE_URL}/checksheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                interviewer_id: interviewerId,
                candidate_id: candidateId,
                stage,
                prepItems,
                reviewedResume,
                qualitative,
                quantitative,
                hiringDecision: qualitative.hiringDecision,
                recommendedDivision: qualitative.recommendedDivision,
                recommendedTitle: qualitative.recommendedTitle,
            }),
        });

        const res = await fetch(`${appConfig.API_BASE_URL}/interview/review-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                interviewer_id: interviewerId, 
                candidate_id: candidateId, 
                stage, 
                prepItems, 
                reviewedResume, 
                qualitative, 
                quantitative,
                hiringDecision: qualitative.hiringDecision,
                recommendedDivision: qualitative.recommendedDivision,
                recommendedTitle: qualitative.recommendedTitle,
            }),
        });

        if (!res.ok) throw new Error('再スコアに失敗しました');
        const updated = await res.json();

        setAiScoreReviewed(true);
        onAiReviewed?.(updated);
        alert('AIが面談内容を元に再スコアしました');
        onClose();
        } catch (e: unknown) {
        const err = e as Error;
        alert(err.message || '再スコア中にエラーが発生しました');
        } finally {
        setIsReviewing(false);
        }
    };

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    if (!config) return null;

    const TagSelector = ({
    allTags,
    selectedTags,
    onToggleTag
    }: {
    allTags: FocusTag[];
    selectedTags: string[];
    onToggleTag: (id: string) => void;
    }) => {
    return (
        <div className="resume-tag-list">
        {allTags.map(tag => (
            <div
            key={tag.id}
            className={`resume-tag ${selectedTags.includes(tag.id) ? 'selected' : ''}`}
            onClick={() => onToggleTag(tag.id)}
            >
            {tag.label}
            </div>
        ))}
        </div>
    );
    };

    return (
        <div className={`slide-panel ${isOpen ? 'open' : ''}`}>
        <div className="slide-panel-header">
            <h3>{stage} の面談シート: {candidateId}</h3>
            <div className="resume-modal-actions">
            <button onClick={handleSubmit} disabled={isReviewing}>保存</button>
            <button className="resume-ai-rescore" onClick={handleAiReview}  disabled={isReviewing || aiScoreReviewed}>{isReviewing ? '再スコア中…' : 'AIスコア精査'}</button>
            <button className="slide-close" onClick={onClose}>✖</button>
            </div>
        </div>

        {/* ✅ 履歴書確認チェックボックス */}
        <div className="resume-interview-field resume-interview-field:last-of-type">
            <label>
            <input
                type="checkbox"
                checked={reviewedResume}
                onChange={(e) => setReviewedResume(e.target.checked)}
            />
            履歴書は事前に確認済みです
            </label>
        </div>

        <div className="sheet-grid">
            <Accordion title="最終評価" defaultOpen={false} span="half">
                <div className="final-eval">
                <div className="resume-interview-field">
                    <label>採用可否</label>
                    <RatingBar
                    items={config.hiringDecisions.map(decision => ({
                        ...decision,
                        label: decision.value
                    }))}
                    value={qualitative['hiringDecision'] || null}
                    onChange={v => setQualitative(s => ({ ...s, hiringDecision: v }))}
                    variant="single"
                    />
                </div>

                <div className="resume-interview-field">
                    <label>部門</label>
                    <select
                    value={qualitative['recommendedDivision'] || ''}
                    onChange={e => setQualitative(s => ({ ...s, recommendedDivision: e.target.value }))}
                    >
                    <option value="">選択してください</option>
                    {config.divisions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <div className="resume-interview-field field--full">
                <label>タイトル</label>
                <RatingBar
                    items={config.titleOptions.map(opt => ({
                    ...opt,
                    label: opt.label.split('（')[0], // または .replace(/（.*$/, '')
                    }))}
                    value={qualitative['recommendedTitle'] || null}
                    onChange={v => setQualitative(s => ({ ...s, recommendedTitle: v }))}
                    variant="single"
                />
                </div>
                </div>
            </Accordion>

            <Accordion title="定性評価" defaultOpen={false} span="half">
                {config.qualitativeItems.map(({ key, label, placeholder }) => (
                <div key={key} className="resume-interview-field">
                    <label>{label}</label>
                    <textarea
                    className="resume-template-textarea"
                    rows={3}
                    placeholder={placeholder}
                    value={qualitative[key]}
                    onChange={e => {
                        autoResize(e.currentTarget);
                        setQualitative(s => ({ ...s, [key]: e.target.value }));
                    }}
                    />
                </div>
                ))}
            </Accordion>

            <Accordion title="定量評価" defaultOpen={false} span="half">
                <div className="iq-table-wrap">
                    <table className="iq-table iq-table--dense iq-table--compact">
                        <thead>
                        <tr>
                            <th style={{ width: 280, textAlign:'left' }}>評価項目</th>
                            <th style={{ width: 160 }}>レベル</th>
                            <th style={{ minWidth: 280 }}>コメント</th>
                        </tr>
                        </thead>
                        <tbody>
                        {config.quantitativeItems.map(item => (
                            <tr key={item.key}>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span>{item.label}</span>
                                <RubricHint title={item.label} bullets={item.rubrics} />
                                </div>
                                {item.hint && <div className="iq-muted">※ {item.hint}</div>}
                            </td>
                            <td>
                                <RatingBar
                                items={item.levels}
                                value={quantitative[item.key].level || null}
                                onChange={v => setQuantitative(q => ({ ...q, [item.key]: { ...q[item.key], level: v } }))}
                                variant="fill-left"
                                />
                            </td>
                            <td>
                                <textarea
                                className="resume-template-textarea"
                                rows={2}
                                placeholder={`${item.comment_placeholder}${quantitative[item.key].level ? `（レベル${quantitative[item.key].level}の根拠）` : ''}`}
                                value={quantitative[item.key].comment}
                                onChange={e => {
                                    autoResize(e.currentTarget);
                                    setQuantitative(q => ({ ...q, [item.key]: { ...q[item.key], comment: e.target.value } }));
                                }}
                                />
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </Accordion>

            <Accordion title="カスタムQA" defaultOpen={false} span="half">
            <div className="resume-interview-field custom-qa-wrapper">
                <div className="resume-interview-field">
                    <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                        type="text"
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        placeholder="以下の期待されるQA観点タグに関連する質問を入力"
                        style={{ flexGrow: 1 }}
                    />
                    <button
                        className="qa-add-button"
                        onClick={() => {
                            if (newQuestion.trim() === '') return;

                            const usedIds = prepItems
                                .filter((item) => item.question_id) // question_id があるものだけに絞る
                                .map((item) => parseInt(item.question_id!.replace(/^Q/, ''))) // ! で非nullを保証
                                .filter((num) => !isNaN(num));
                            const maxId = usedIds.length > 0 ? Math.max(...usedIds) : 0;
                            const nextQuestionId = `Q${String(maxId + 1).padStart(3, '0')}`;

                            const newItem: PrepItem = {
                            question_id: nextQuestionId,
                            question: newQuestion.trim(),
                            answer: '',
                            tags: newQuestionTags,
                            };

                            setPrepItems([...prepItems, newItem]);
                            setNewQuestion('');
                            setNewQuestionTags([]);
                        }}
                        >
                        追加
                    </button>
                    </div>
                </div>
                {/* ✅ ここに追加：新規質問用タグセレクター */}
                {config.focusTags?.length > 0 && (
                    <TagSelector
                    allTags={config.focusTags}
                    selectedTags={newQuestionTags}
                    onToggleTag={(id) => {
                        setNewQuestionTags((prev) =>
                        prev.includes(id)
                            ? prev.filter((t) => t !== id)
                            : [...prev, id]
                        );
                    }}
                    />
                )}
            </div>

            <div className="resume-interview-list">
                {prepItems.map((item, idx) => (
                <div key={`${item.question}-${idx}`} className="resume-interview-item" style={{ position: 'relative', paddingRight: '32px' }}>
                    <div className="resume-question-header">
                    <strong>Q{idx + 1}:</strong> {item.question}
                    </div>

                    {/* 🏷 タグセレクター */}
                    <div style={{ position: 'relative' }}>
                    {editTagIndex === idx ? (
                        <TagSelector
                        allTags={config.focusTags}
                        selectedTags={item.tags || []}
                        onToggleTag={(id) => {
                            const updated = [...prepItems];
                            const currentTags = updated[idx].tags || [];
                            updated[idx].tags = currentTags.includes(id)
                            ? currentTags.filter(t => t !== id)
                            : [...currentTags, id];
                            setPrepItems(updated);
                        }}
                        />
                    ) : (
                        <div className="resume-tag-list read-only">
                        {(item.tags || []).map(id => {
                            const tag = config.focusTags.find(t => t.id === id);
                            return (
                            <span key={id} className="resume-tag selected">
                                {tag?.label ?? id}
                            </span>
                            );
                        })}
                        </div>
                    )}

                    {/* ✏️ 編集ボタン */}
                    <div style={{ position: 'absolute', bottom: '-4px', right: '0px' }}>
                        <button
                        onClick={() => setEditTagIndex(editTagIndex === idx ? null : idx)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#888',
                        }}
                        aria-label="タグ編集"
                        >
                        #
                        </button>
                    </div>
                    </div>

                    <textarea
                    rows={3}
                    className="resume-answer-textarea"
                    value={item.answer}
                    onChange={(e) => {
                        const updated = [...prepItems];
                        updated[idx].answer = e.target.value;
                        setPrepItems(updated);
                    }}
                    placeholder="想定される回答や実際の回答メモ"
                    />

                    <div className="resume-interview-actions">
                        <button
                        onClick={() => {
                            const updated = prepItems.filter((_, i) => i !== idx);
                            setPrepItems(updated);
                            if (editTagIndex === idx) setEditTagIndex(null);
                        }}
                        style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            border: 'none',
                            background: 'transparent',
                            color: '#999',
                            fontSize: '16px',
                            cursor: 'pointer',
                            lineHeight: 1,
                        }}
                        aria-label="この質問を削除"
                        >
                        ×
                        </button>
                    </div>
                </div>
                ))}
            </div>
            </Accordion>
        </div>
    </div>
  );
};

export default InterviewCheckSheetSlidePanel;