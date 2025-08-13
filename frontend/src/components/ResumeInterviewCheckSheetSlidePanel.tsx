import React, { useState, useEffect } from 'react';
import { ResumeRatingBar } from './ResumeRatingBar';
import { ResumeRubricHint } from './ResumeRubricHint';
import ResumeAccordion from './ResumeAccordion';

type HiringDecision = 'strong_hire' | 'hire_ok' | 'no_hire';
type TitleRank = 'C' | 'SC' | 'M' | 'SM' | 'D+';
type Level5 = 1 | 2 | 3 | 4 | 5;

type QuantKey =
    | 'self_management'
    | 'workstyle_relation'
    | 'communication'
    | 'leadership'
    | 'logical_thinking'
    | 'execution_pm'
    | 'expertise'
    | 'biz_org_dev';

const QUANT_ITEMS: { key: QuantKey; label: string; hint?: string }[] = [
    { key: 'self_management',   label: '自己管理・モチベ・文化適合性' },
    { key: 'workstyle_relation',label: 'ワークスタイル・他者との関係性' },
    { key: 'communication',     label: 'コミュニケーション・スキル' },
    { key: 'leadership',        label: 'リーダーシップ', hint: 'タイトルに応じた経験や実績' },
    { key: 'logical_thinking',  label: '論理的思考力（地頭力）' },
    { key: 'execution_pm',      label: '作業・プロジェクト管理力', hint: 'タイトルに応じた経験や実績'},
    { key: 'expertise',         label: '専門性（知識・スキル）' },
    { key: 'biz_org_dev',       label: 'ビジネス＆組織開発', hint: '主としてM以上の採用候補'},
];

const RUBRICS: Record<QuantKey, string[]> = {
    self_management: [
        '組織文化への適合性',
        '困難・ストレスへの対処',
        '変化への柔軟性',
        '学習意欲・自己研鑽の継続',
    ],
    workstyle_relation: [
        '仕事の進め方の嗜好・得意領域',
        'チーム内での役割・貢献',
        '顧客/同僚など周囲との関係構築',
    ],
    communication: [
        'わかりやすい説明・要約',
        '意図や背景の正確な理解',
        '反論/合意形成の進め方',
        '議論の設計・推進',
    ],
    leadership: [
        '人/業務の管理・牽引経験',
        'スタイルの適合性',
        '育成・支援の経験と配慮',
    ],
    logical_thinking: [
        '構造化・モデル化',
        '筋道立てた説明',
        '仮説思考の活用',
        '本質的要因の洞察と意思決定',
    ],
    execution_pm: [
        '優先順位付け',
        '計画立案',
        'タスク配分と進捗管理',
        '実績/規模感',
    ],
    expertise: [
        '業種・ドメインの経験',
        '資格/習得計画',
        'スキル/知識の水準',
        '得意/対応可能領域の幅',
    ],
    biz_org_dev: [
        '営業/事業開発の経験・具体',
        '活用可能な人脈/ネットワーク',
        '市場機会の分析と見通し',
        'チーム組成やマネジメント経験',
    ],
};

const QUAL_PLACEHOLDERS = {
    careerGoals:     '例）やりたい役割・強み/弱み・3年後の姿 など',
    otherApps:       '例）他社選考の進捗、オファー有無、入社可能時期、条件面の希望',
    overall:         '例）評価の結論と根拠（強み/懸念）・採用可否の理由を簡潔に',
    assignmentPlan:  '例）配属想定チーム/ミッション・最初の90日プランの叩き台',
} as const;

const COMMENT_PLACEHOLDERS: Record<QuantKey, string> = {
    self_management:   '例）ストレス下での振る舞い/自己研鑽の具体例 など',
    workstyle_relation:'例）関係構築/チーム貢献が見えたシーン',
    communication:     '例）説明のわかりやすさ/合意形成の進め方',
    leadership:        '例）牽引した事例/育成・配慮の具体',
    logical_thinking:  '例）構造化/仮説検証の進め方と結果',
    execution_pm:      '例）優先順位/計画/進捗管理の事例',
    expertise:         '例）扱った領域・スキルの深さ',
    biz_org_dev:       '例）商談/市場分析/チーム組成の実績'
};

const commentPh = (k: QuantKey, lv: number | 0) =>
    `${COMMENT_PLACEHOLDERS[k]}${lv ? `（レベル${lv}の根拠）` : ''}`;

interface Qualitative {
    careerGoals: string;
    otherApps: string;
    overall: string;
    assignmentPlan: string;
    hiringDecision: HiringDecision | '';
    recommendedTitle: TitleRank | '';
    recommendedDivision: string; // 1つ選択
}

interface QuantitativeRow {
    level: Level5 | 0;   // 0 は未選択
    comment: string;
}

type Quantitative = Record<QuantKey, QuantitativeRow>;

interface Props {
    interviewerId: string; 
    candidateId: string;
    stage: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: {
        prepItems: { question: string; answer: string }[];
        reviewedResume: boolean;
        qualitative?: Qualitative;
        quantitative?: Quantitative;
    }) => void;
    initialData?: {
        prepItems?: { question: string; answer: string }[];
        reviewedResume?: boolean;
        qualitative?: Partial<Qualitative>;
        quantitative?: Partial<Quantitative>;
    };
    loadingInitial?: boolean;
    onAiReviewed?: (updatedResult: any) => void; // 2025.8.12 Add（candidate score update after interview）
    divisions?: string[];
}

const defaultQual = (): Qualitative => ({
    careerGoals: '',
    otherApps: '',
    overall: '',
    assignmentPlan: '',
    hiringDecision: '',
    recommendedTitle: '',
    recommendedDivision: '',
});

const defaultQuant = (): Quantitative =>
    QUANT_ITEMS.reduce((acc, it) => {
        acc[it.key] = { level: 0, comment: '' };
        return acc;
    }, {} as Quantitative);

const ResumeInterviewCheckSheetSlidePanel: React.FC<Props> = ({
    interviewerId,
    candidateId,
    stage,
    isOpen,
    onClose,
    onSubmit,
    initialData,
    onAiReviewed,
    divisions,
    loadingInitial = false,
}) => {
    const [prepItems, setPrepItems] = useState<{ question: string; answer: string }[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [reviewedResume, setReviewedResume] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);

    const [qualitative, setQualitative] = useState<Qualitative>(defaultQual());
    const [quantitative, setQuantitative] = useState<Quantitative>(defaultQuant());
    const [divisionOptions, setDivisionOptions] = useState<string[]>(divisions || []);

    // ✅ 共通：initialData → state 反映（1か所だけ）
    const applyToState = React.useCallback((src: any = {}) => {
        setPrepItems(src.prepItems || []);
        setReviewedResume(!!src.reviewedResume);

        setQualitative({ ...defaultQual(), ...(src.qualitative || {}) });

        setQuantitative(() => {
        const base = defaultQuant();
        const q = src.quantitative || {};
        QUANT_ITEMS.forEach((it) => {
            const row = (q as any)[it.key] || {};
            const raw = row.level;
            const lv: Level5 | 0 = typeof raw === 'number' && [1, 2, 3, 4, 5].includes(raw) ? (raw as Level5) : 0;
            base[it.key] = { level: lv, comment: row.comment || '' };
        });
        return base;
        });
    }, []);

    // ✅ 子はフェッチしない：初期データだけを流し込む
    useEffect(() => {
        if (!isOpen) return;
        applyToState(initialData || {});
    }, [isOpen, initialData, applyToState]);

    // 部門リスト（props無ければ取得）
    useEffect(() => {
        if (divisions && divisions.length) return;
        (async () => {
        try {
            const r = await fetch('/divisions');
            if (r.ok) {
            const list = await r.json();
            if (Array.isArray(list)) setDivisionOptions(list);
            }
        } catch {}
        })();
    }, [divisions]);

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
        onSubmit({ prepItems, reviewedResume, qualitative, quantitative });
        onClose();
    };

    // 2025.8.12 Add（candidate score update after interview）START
    const handleAiReview = async () => {
        try {
        setIsReviewing(true);

        // 1) まず現状のQAを保存（ベストエフォート）
        try {
            await fetch('/checksheet', {
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
            }),
            });
        } catch {
            // 保存失敗は致命ではないので継続
        }

        // 2) AI再スコア
        const res = await fetch('/interview/review-score', {
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
            }),
        });

        if (!res.ok) throw new Error(`再スコアに失敗しました: ${res.status}`);

        const updated = await res.json();
        onAiReviewed?.(updated); // 親に最新を渡す
        alert('AIが面談QAと評価メモを考慮してスコアを再評価しました。');
        onClose();
        } catch (e: any) {
        alert(e.message || 'AI再スコア時にエラーが発生しました');
        } finally {
        setIsReviewing(false);
        }
    };
    // 2025.8.12 Add（candidate score update after interview）END

    const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    };

    return (
        <>
        {/* ✨ 背面をブロックしない（スクロール可）オーバーレイ */}
        <div className="slide-overlay" />

        {/* ✨ パネル横の細いクリックゾーン（ここだけクリックで閉じる） */}
        {isOpen && <div className="slide-dim" onClick={onClose} />}

        <div className={`slide-panel ${isOpen ? 'open' : ''}`}>
            <div className="slide-panel-header">
            <h3>{stage} の面談シート: {candidateId}</h3>
            <div className="resume-modal-actions header-actions">
                <button onClick={handleSubmit} disabled={isReviewing}>保存</button>
                <button className="resume-ai-rescore" onClick={handleAiReview} disabled={isReviewing}>
                {isReviewing ? '再スコア中…' : 'AIスコア精査'}
                </button>
                <button className="slide-close" onClick={onClose}>✖</button>
            </div>
            </div>

            {(loadingInitial) && (
            <div className="sheet-loading">
                <div className="sheet-spinner" aria-hidden />
                <span>面談シートを読み込み中です…</span>
            </div>
            )}

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
                <ResumeAccordion title="最終評価" defaultOpen={false} span="half">
                    <div className="final-eval">
                        <div className="resume-interview-field">
                        <label>採用可否</label>
                        <ResumeRatingBar
                            items={[
                            { value: 'no_hire',     label: '🙅‍♂️ 採用すべきでない', full: '採用すべきでない' },
                            { value: 'hire_ok',     label: '✅ 採用しても良い',   full: '採用しても良い' },
                            { value: 'strong_hire', label: '🌟 積極的に採用', full: '積極的に採用' },
                            ]}
                            value={qualitative.hiringDecision || null}
                            onChange={v => setQualitative(s => ({ ...s, hiringDecision: v as HiringDecision }))}
                            variant="single"
                        />
                        </div>

                        <div className="resume-interview-field">
                        <label>部門</label>
                        <select
                            className="resume-chat-stage-selector"
                            value={qualitative.recommendedDivision}
                            onChange={e => setQualitative(s => ({ ...s, recommendedDivision: e.target.value }))}
                        >
                            <option value="">選択してください</option>
                            {divisionOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        </div>

                        {/* タイトルは1行使いたければ field--full を付ける */}
                        <div className="resume-interview-field field--full">
                        <label>タイトル</label>
                        <ResumeRatingBar
                            items={[
                            { value: 'C', label: 'C' },
                            { value: 'SC', label: 'SC' },
                            { value: 'M', label: 'M' },
                            { value: 'SM', label: 'SM' },
                            { value: 'D+', label: 'D+' },
                            ]}
                            value={qualitative.recommendedTitle || null}
                            onChange={v => setQualitative(s => ({ ...s, recommendedTitle: v as TitleRank }))}
                            variant="single"
                        />
                        </div>
                    </div>
                </ResumeAccordion>

                <ResumeAccordion title="定性評価" defaultOpen={false} span="half">
                    <div className="resume-interview-field">
                        <label>本人希望・キャリアゴール等</label>
                        <textarea
                        className="resume-template-textarea"
                        rows={3}
                        placeholder={QUAL_PLACEHOLDERS.careerGoals}
                        value={qualitative.careerGoals}
                        onChange={e => {
                            autoResize(e.currentTarget);
                            setQualitative(s => ({ ...s, careerGoals: e.target.value }));
                        }}
                        />
                    </div>

                    <div className="resume-interview-field">
                        <label>他社応募・選考状況、入社可能日等の情報</label>
                        <textarea
                        className="resume-template-textarea"
                        rows={3}
                        placeholder={QUAL_PLACEHOLDERS.otherApps}
                        value={qualitative.otherApps}
                        onChange={e => {
                            autoResize(e.currentTarget);
                            setQualitative(s => ({ ...s, otherApps: e.target.value }));
                        }}
                        />
                    </div>

                    <div className="resume-interview-field">
                        <label>総評</label>
                        <textarea
                        className="resume-template-textarea"
                        rows={4}
                        placeholder={QUAL_PLACEHOLDERS.overall}
                        value={qualitative.overall}
                        onChange={e => {
                            autoResize(e.currentTarget);
                            setQualitative(s => ({ ...s, overall: e.target.value }));
                        }}
                        />
                    </div>

                    <div className="resume-interview-field">
                        <label>アサインメントプラン（次回最終面接へ進める場合）</label>
                        <textarea
                        className="resume-template-textarea"
                        rows={3}
                        placeholder={QUAL_PLACEHOLDERS.assignmentPlan}
                        value={qualitative.assignmentPlan}
                        onChange={e => {
                            autoResize(e.currentTarget);
                            setQualitative(s => ({ ...s, assignmentPlan: e.target.value }));
                        }}
                        />
                    </div>
                </ResumeAccordion>

                <ResumeAccordion title="定量評価" defaultOpen={false} span="half">
                    <div className="iq-table-wrap">
                    <table className="iq-table iq-table--dense iq-table--compact">
                        <thead>
                        <tr>
                            <th style={{ width: 280, textAlign:'left' }}>評価項目</th>
                            <th style={{ width: 160 }}>レベル</th>
                            <th style={{ minWidth: 360 }}>コメント</th>
                        </tr>
                        </thead>
                        <tbody>
                        {QUANT_ITEMS.map(it => (
                            <tr key={it.key}>
                                <td>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                    <div style={{ fontWeight: 600 }}>{it.label}</div>
                                    {/* ← ここに ⓘ を追加 */}
                                    <ResumeRubricHint title={it.label} bullets={RUBRICS[it.key]} />
                                    </div>
                                    {it.hint && <div className="iq-muted">※ {it.hint}</div>}
                                </td>

                                <td>
                                    <ResumeRatingBar
                                    items={[1,2,3,4,5].map(n => ({ value: n as Level5, label: String(n) }))}
                                    value={quantitative[it.key].level || null}
                                    onChange={(lv) =>
                                        setQuantitative(q => ({ ...q, [it.key]: { ...q[it.key], level: lv as Level5 } }))
                                    }
                                    variant="fill-left"
                                    />
                                </td>

                                <td>
                                <textarea
                                    className="resume-template-textarea"
                                    rows={2}
                                    placeholder={commentPh(it.key, quantitative[it.key].level)}
                                    value={quantitative[it.key].comment}
                                    onChange={e => {
                                    // 伸縮
                                    autoResize(e.currentTarget);
                                    // 状態更新
                                    setQuantitative(q => ({
                                        ...q,
                                        [it.key]: { ...q[it.key], comment: e.target.value }
                                    }));
                                    }}
                                />
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>            
                </ResumeAccordion>

                <ResumeAccordion title="カスタムQA" defaultOpen={false} span="half">
                    <div className="resume-interview-field">
                    <label>📋 質問を追加:</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                        type="text"
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        placeholder="例: どのようにして営業成績を伸ばしましたか？"
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
                </ResumeAccordion>
            </div>
        </div>
        </>
    );
};

export default ResumeInterviewCheckSheetSlidePanel;