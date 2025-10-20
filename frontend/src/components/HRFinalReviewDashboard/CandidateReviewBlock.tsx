import React from 'react';
import type { AIRawResult, InterviewEval, LabeledOption } from './hrReviewTypes';
import { RenderMustCheckChip } from './RenderMustCheckChip';
import HREvaluationModal from './HREvaluationModal';
import './HRFinalReviewDashboard.css';
import appConfig from '../../config.ts';

interface CandidateReviewBlockProps {
    candidateId: string;
    ai: AIRawResult | undefined;
    evals: InterviewEval[];
    allMustKeys: string[];
    qualItems: { key: string; label: string }[];
    quantItems: { key: string; label: string }[];
    titleOptions: LabeledOption[];
    hrEvaluation: {
        decision?: string;
        division?: string;
        title?: string;
        annualIncome?: string;
        savedAt?: string;
        savedBy?: string;
    };
    interviewerId: string;
    onOpenModal: (candidateId: string) => void;
    onCloseModal: () => void;
    activeCandidateId: string | null;
    onChangeHR: (updated: Partial<CandidateReviewBlockProps['hrEvaluation']>) => void;
    onSaveHR: (candidateId: string) => void;
    prefixToName: Record<string, string>;
}

const CandidateReviewBlock: React.FC<CandidateReviewBlockProps> = ({
    candidateId,
    ai,
    evals,
    allMustKeys,
    qualItems,
    quantItems,
    titleOptions,
    hrEvaluation,
    interviewerId,
    onOpenModal,
    onCloseModal,
    activeCandidateId,
    onChangeHR,
    onSaveHR,
    prefixToName,
}) => {
    const normalizedCandidateId = candidateId.replace(/^cand_/, '');
    const resumeURL = `${appConfig.API_BASE_URL}/resumes/by-candidate/${normalizedCandidateId}`;

    return (
        <div key={candidateId} className="candidate-block">
        <div className="candidate-header">
            <h3
            style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5em',
                flexWrap: 'wrap',
            }}
            >
            👤 {ai?.user_name || '-'}（{candidateId}）
            {ai?.gender && (
                <span
                className={`hr-gender-chip ${
                    ai.gender === '男'
                    ? 'male'
                    : ai.gender === '女'
                    ? 'female'
                    : 'other'
                }`}
                >
                {ai.gender === '男'
                    ? '男性'
                    : ai.gender === '女'
                    ? '女性'
                    : 'その他'}
                </span>
            )}
            {ai?.status && <span className="hr-status-chip">{ai.status}</span>}

            {resumeURL && (
                <a
                href={resumeURL}
                target="_blank"
                rel="noopener noreferrer"
                className="resume-link"
                >
                📄 履歴書を表示
                </a>
            )}
            </h3>

            <div className="hr-button-and-note">
            <div>
                <button
                onClick={() => onOpenModal(candidateId)}
                className={`hr-review-btn ${
                    hrEvaluation?.savedAt ? 'saved' : ''
                }`}
                >
                HR評価を入力
                </button>
            </div>

            {hrEvaluation?.savedAt && (
                <div className="hr-review-note">
                保存済: {new Date(hrEvaluation.savedAt).toLocaleString()}
                {hrEvaluation.decision && ` / ${hrEvaluation.decision}`}
                {hrEvaluation.division && ` / ${hrEvaluation.division}`}
                {hrEvaluation.title && ` / ${hrEvaluation.title}`}
                {hrEvaluation.annualIncome &&
                    ` / ${hrEvaluation.annualIncome}万円`}
                </div>
            )}
            </div>
        </div>

        {ai && (
            <>
            <h4>AI評価</h4>
            <table className="hr-result-check-table">
                <thead>
                <tr>
                    {Object.keys(ai.must_check).map((key) => (
                    <th key={key}>{key}</th>
                    ))}
                    {ai.scores.map((s) => (
                    <th key={s.division}>{prefixToName[s.division] || s.division}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                <tr>
                    {allMustKeys.map((key) => (
                    <td key={`must-${candidateId}-${key}`}>
                        {RenderMustCheckChip(
                        ai.must_check?.[key]?.result,
                        ai.must_check?.[key]?.reason
                        )}
                    </td>
                    ))}
                    {ai.scores.map((s) => (
                    <td
                        key={s.division}
                        className={
                        s.division === ai.recommended_division ? 'highlight' : ''
                        }
                    >
                        {s.score}
                    </td>
                    ))}
                </tr>
                </tbody>
            </table>
            </>
        )}

        {evals.length > 0 && (
            <>
            <h4>面接官評価</h4>
            <table className="hr-result-check-table">
                <thead>
                <tr>
                    <th>評価項目</th>
                    {evals.map((r, i) => (
                    <th key={`interviewer-${i}`}>{r.interviewer_id}</th>
                    ))}
                </tr>
                </thead>
                <tbody>
                <tr>
                    <td>ステージ</td>
                    {evals.map((r) => (
                    <td key={`stage-${r.interviewer_id}`}>{r.stage}</td>
                    ))}
                </tr>
                <tr>
                    <td>採用可否</td>
                    {evals.map((r, i) => {
                    const decision = r.qualitative?.hiringDecision ?? '-';
                    const className =
                        decision === 'strong_hire'
                        ? 'hire-decision-cell hire-strong'
                        : 'hire-decision-cell';
                    return (
                        <td key={`hire-${i}`} className={className}>
                        {decision}
                        </td>
                    );
                    })}
                </tr>
                <tr>
                    <td>部門</td>
                    {evals.map((r) => (
                    <td key={`division-${r.interviewer_id}`}>
                        {r.qualitative?.recommendedDivision
                            ? prefixToName[r.qualitative.recommendedDivision] || r.qualitative.recommendedDivision
                            : '-'}
                    </td>
                    ))}
                </tr>
                <tr>
                    <td>タイトル</td>
                    {evals.map((r) => (
                    <td key={`title-${r.interviewer_id}`}>
                        {r.qualitative?.recommendedTitle ?? '-'}
                    </td>
                    ))}
                </tr>

                {qualItems.map((item) => (
                    <tr key={`qual-${item.key}`}>
                        <td>{item.label}</td>
                        {evals.map((r) => {
                        const q = r.qualitative ?? {};
                        const camelKey =
                            item.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); // career_goals → careerGoals
                        const value = q[item.key] ?? q[camelKey] ?? '-';
                        return <td key={`${r.interviewer_id}-${item.key}`}>{value}</td>;
                        })}
                    </tr>
                ))}

                {quantItems.map((item) => (
                    <tr key={`quant-${item.key}`}>
                        <td>{item.label}</td>
                        {evals.map((r) => {
                        interface QuantRecord {
                            item_key: string;
                            level: number;
                            comment?: string;
                        }

                        const quantArray = (r.quantitative ?? []) as QuantRecord[];
                        const quantRecord = quantArray.find(
                            (q) => q.item_key === item.key
                        );
                        const level = quantRecord?.level;

                        const className =
                            level === 4 || level === 5
                            ? 'quant-cell quant-high'
                            : 'quant-cell';

                        return (
                            <td key={`${r.interviewer_id}-${item.key}`} className={className}>
                            {level ?? '-'}
                            </td>
                        );
                        })}
                    </tr>
                ))}

                <tr>
                    <td>カスタムQA</td>
                    {evals.map((r) => (
                    <td key={`qa-${r.interviewer_id}`}>
                        {r.prepItems && r.prepItems.length > 0 ? (
                        <ul style={{ paddingLeft: '1em', margin: 0 }}>
                            {r.prepItems.map((qa, index) => (
                            <li
                                key={`qa-${r.interviewer_id}-${index}`}
                                className="qa-entry"
                            >
                                <div>
                                <span className="question">Q:</span> {qa.question}
                                </div>
                                <div>
                                <span className="answer">A:</span> {qa.answer}
                                </div>
                            </li>
                            ))}
                        </ul>
                        ) : (
                        '-'
                        )}
                    </td>
                    ))}
                </tr>
                </tbody>
            </table>
            </>
        )}

        {activeCandidateId === candidateId && (
            <HREvaluationModal
            candidateId={candidateId}
            interviewerId={interviewerId}
            hrEvaluation={hrEvaluation}
            titleOptions={titleOptions}
            prefixToName={prefixToName}
            onChange={onChangeHR}
            onSave={onSaveHR}
            onCancel={onCloseModal}
            />
        )}
        </div>
    );
};

export default CandidateReviewBlock;