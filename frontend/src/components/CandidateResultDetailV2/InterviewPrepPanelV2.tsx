import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './InterviewPrepPanelV2.css';
import { RatingBar } from '../InterviewCheckSheetSlidePanel/RatingBar';
import { RubricHint } from '../InterviewCheckSheetSlidePanel/RubricHint';
import Accordion from '../InterviewCheckSheetSlidePanel/Accordion';
import type { ConfigResponse } from "../Utils/InterviewCheckSheet";
import { fetchConfig, defaultQual, defaultQuant } from '../InterviewCheckSheetSlidePanel/interviewCheckSheetUtils';
import { TagSelector } from '../InterviewCheckSheetSlidePanel/TagSelector';
import { useAiReview } from '../InterviewCheckSheetSlidePanel/useAiReview';

type QualitativeMap = {
    [key: string]: string | undefined;
    payType?: string;
    employmentType?: string;
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

export interface InterviewPrepPanelV2Props {
    interviewerId: string;
    candidateId: string;
    stage: string;
    onSubmit: (data: {
        prepItems: PrepItem[];
        reviewedResume: boolean;
        qualitative?: QualitativeMap;
        quantitative?: Record<string, QuantitativeRow>;
        hiringDecision?: string;
        recommendedDivision?: string;
        recommendedTitle?: string;
        payType?: string;
        employmentType?: string;
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
    onSkip?: () => void;
    prefixToName: Record<string, string>;
}

/**
 * 面接準備パネル V2
 * 右ペインにインライン表示するための面接準備コンポーネント
 * 元のInterviewCheckSheetSlidePanelからスライドパネル機能を削除し、静的表示に対応
 */
const InterviewPrepPanelV2: React.FC<InterviewPrepPanelV2Props> = ({
    interviewerId,
    candidateId,
    stage,
    onSubmit,
    initialData,
    onAiReviewed,
    onSkip,
    prefixToName,
}) => {
    const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [reviewedResume, setReviewedResume] = useState(false);
    const [qualitative, setQualitative] = useState<QualitativeMap>({});
    const [quantitative, setQuantitative] = useState<Record<string, QuantitativeRow>>({});
    const [config, setConfig] = useState<ConfigResponse | null>(null);
    const [newQuestionTags, setNewQuestionTags] = useState<string[]>([]);
    const [editTagIndex, setEditTagIndex] = useState<number | null>(null);
    const { isReviewing, aiScoreReviewed, handleAiReview } = useAiReview(onAiReviewed);

    const divisionItems = useMemo(
        () =>
            Object.entries(prefixToName)
                .filter(([_, name]) => name !== prefixToName['common'])
                .map(([code, name]) => ({ value: code, label: name })),
        [prefixToName]
    );

    const payTypeItems = useMemo(() => {
        if (!config?.employmentTypes) return [];
        const map = new Map<string, string>();
        for (const et of config.employmentTypes) {
            if (!map.has(et.pay_type)) map.set(et.pay_type, et.pay_type_label);
        }
        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [config]);

    const filteredEmploymentTypeItems = useMemo(() => {
        const selectedPay = qualitative?.payType;
        if (!config?.employmentTypes) return [];
        if (!selectedPay) return config.employmentTypes.map(et => ({ value: et.value, label: et.label }));
        return config.employmentTypes
            .filter(et => et.pay_type === selectedPay)
            .map(et => ({ value: et.value, label: et.label }));
    }, [config, qualitative?.payType]);

    const applyToState = useCallback((src: any = {}, cfg: ConfigResponse) => {
        setPrepItems(src.prepItems || []);
        setReviewedResume(!!src.reviewedResume);

        const normalizedPrepItems = (src.prepItems || []).map((item: any) => {
            const tags = (item.tags || []).map((t: any) => typeof t === 'string' ? t : t.id);
            return { ...item, tags };
        });
        setPrepItems(normalizedPrepItems);

        const ql = defaultQual(cfg.qualitativeItems);
        const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

        cfg.qualitativeItems.forEach(({ key }) => {
            const srcKey = Object.keys(src.qualitative || {}).find(
                (k) => snakeToCamel(k) === key
            );
            ql[key] = src.qualitative?.[srcKey ?? key] || '';
        });

        ['hiringDecision', 'recommendedDivision', 'recommendedTitle', 'payType', 'employmentType'].forEach((key) => {
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
    }, [initialData, applyToState, interviewerId]);

    const handleSubmit = () => {
        onSubmit({
            prepItems,
            reviewedResume,
            qualitative,
            quantitative,
            hiringDecision: qualitative.hiringDecision,
            recommendedDivision: qualitative.recommendedDivision,
            recommendedTitle: qualitative.recommendedTitle,
            payType: qualitative.payType,
            employmentType: qualitative.employmentType,
        });
    };

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    if (!config) {
        return (
            <div className="interview-prep-v2-loading">
                <p>設定を読み込み中...</p>
            </div>
        );
    }

    return (
        <div className="interview-prep-panel-v2">
            <div className="interview-prep-v2-header">
                <h3>{stage} の面談シート</h3>
                <div className="interview-prep-v2-actions">
                    {(stage === "1次面談" || stage === "2次面談") && onSkip && (
                        <button onClick={onSkip} className="btn-skip">
                            ⏭️ 面談省略
                        </button>
                    )}
                    <button onClick={handleSubmit} disabled={isReviewing} className="btn-save">
                        保存
                    </button>
                    <button
                        className="btn-ai-rescore"
                        onClick={() =>
                            handleAiReview(
                                {
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
                                    payType: qualitative.payType,
                                    employmentType: qualitative.employmentType,
                                },
                                () => {} // No close callback needed for inline display
                            )
                        }
                        disabled={isReviewing || aiScoreReviewed}
                    >
                        {isReviewing ? '再スコア中…' : 'AIスコア精査'}
                    </button>
                </div>
            </div>

            {/* 履歴書確認チェックボックス */}
            <div className="interview-prep-v2-field checkbox-field">
                <label>
                    <input
                        type="checkbox"
                        checked={reviewedResume}
                        onChange={(e) => setReviewedResume(e.target.checked)}
                    />
                    履歴書は事前に確認済みです
                </label>
            </div>

            <div className="interview-prep-v2-content">
                <Accordion title="最終評価" defaultOpen={false} span="half">
                    <div className="final-eval">
                        <div className="interview-prep-v2-field">
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

                        <div className="interview-prep-v2-field">
                            <label>部門</label>
                            <RatingBar
                                items={divisionItems}
                                value={qualitative['recommendedDivision'] || null}
                                onChange={v => setQualitative(s => ({ ...s, recommendedDivision: v }))}
                                variant="single"
                            />
                        </div>

                        <div className="interview-prep-v2-field">
                            <label>給与体系</label>
                            <RatingBar
                                items={payTypeItems}
                                value={qualitative['payType'] || null}
                                onChange={v => {
                                    setQualitative(s => {
                                        const next = { ...s, payType: v };
                                        const validValues = new Set(
                                            (config?.employmentTypes || [])
                                                .filter(et => et.pay_type === v)
                                                .map(et => et.value)
                                        );
                                        if (next.employmentType && !validValues.has(next.employmentType)) {
                                            next.employmentType = '';
                                        }
                                        return next;
                                    });
                                }}
                                variant="single"
                            />
                        </div>

                        <div className="interview-prep-v2-field">
                            <label>従業員区分</label>
                            {qualitative?.payType ? (
                                <RatingBar
                                    items={filteredEmploymentTypeItems}
                                    value={qualitative['employmentType'] || null}
                                    onChange={v => setQualitative(s => ({ ...s, employmentType: v }))}
                                    variant="single"
                                />
                            ) : (
                                <div className="hint-text">
                                    ← 給与体系を先に選択してください
                                </div>
                            )}
                        </div>

                        <div className="interview-prep-v2-field field--full">
                            <label>タイトル</label>
                            <RatingBar
                                items={config.titleOptions.map(opt => ({
                                    ...opt,
                                    label: opt.label,
                                }))}
                                value={qualitative['recommendedTitle'] || null}
                                onChange={v => setQualitative(s => ({ ...s, recommendedTitle: v }))}
                                variant="single"
                            />
                        </div>
                    </div>
                </Accordion>

                <Accordion title="定性評価" defaultOpen={false} span="half">
                    {!qualitative?.payType ? (
                        <div className="hint-text">
                            ← 給与体系を先に選択してください
                        </div>
                    ) : (
                        config.qualitativeItems
                            .filter(item => item.is_active !== false)
                            .filter(item => {
                                if (!item.pay_type) return true;
                                return item.pay_type === qualitative.payType;
                            })
                            .sort((a, b) => {
                                if (a.order == null && b.order == null) return 0;
                                if (a.order == null) return 1;
                                if (b.order == null) return -1;
                                return a.order - b.order;
                            })
                            .map(({ key, label, placeholder }) => (
                                <div key={key} className="interview-prep-v2-field">
                                    <label>{label}</label>
                                    <textarea
                                        className="interview-prep-v2-textarea"
                                        rows={3}
                                        placeholder={placeholder}
                                        value={qualitative[key]}
                                        onChange={(e) => {
                                            autoResize(e.currentTarget);
                                            setQualitative((s) => ({ ...s, [key]: e.target.value }));
                                        }}
                                    />
                                </div>
                            ))
                    )}
                </Accordion>

                <Accordion title="定量評価" defaultOpen={false} span="half">
                    <div className="iq-table-wrap">
                        <table className="iq-table iq-table--dense iq-table--compact">
                            <thead>
                                <tr>
                                    <th style={{ width: 280, textAlign: 'left' }}>評価項目</th>
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
                                                className="interview-prep-v2-textarea"
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
                    <div className="interview-prep-v2-field custom-qa-wrapper">
                        <div className="interview-prep-v2-field">
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
                                            .filter((item) => item.question_id)
                                            .map((item) => parseInt(item.question_id!.replace(/^Q/, '')))
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

                    <div className="interview-prep-v2-list">
                        {prepItems.map((item, idx) => (
                            <div key={`${item.question}-${idx}`} className="interview-prep-v2-item">
                                <div className="question-header">
                                    <strong>Q{idx + 1}:</strong> {item.question}
                                </div>

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
                                    className="interview-prep-v2-textarea answer-textarea"
                                    value={item.answer}
                                    onChange={(e) => {
                                        const updated = [...prepItems];
                                        updated[idx].answer = e.target.value;
                                        setPrepItems(updated);
                                    }}
                                    placeholder="想定される回答や実際の回答メモ"
                                />

                                <button
                                    onClick={() => {
                                        const updated = prepItems.filter((_, i) => i !== idx);
                                        setPrepItems(updated);
                                        if (editTagIndex === idx) setEditTagIndex(null);
                                    }}
                                    className="delete-question-btn"
                                    aria-label="この質問を削除"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                </Accordion>
            </div>
        </div>
    );
};

export default InterviewPrepPanelV2;
