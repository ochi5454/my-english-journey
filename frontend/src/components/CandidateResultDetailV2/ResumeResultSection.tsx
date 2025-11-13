import React from 'react';
import './ResumeResultSection.css';

type Props = {
    result: any;
    getDivisionName: (prefix: string) => string;
};

const ResumeResultSection: React.FC<Props> = ({ result, getDivisionName }) => {
    if (!result) return null;

    return (
        <div className="chat-result-section">
        <h4>🎯 AIスコアリング結果</h4>

        {/* 希望部門 vs 推薦部門 */}
        <div className="resume-compare-section">
            <div className="resume-compare-card">
            <h5>希望部門</h5>
            <p className="resume-compare-division">
                {getDivisionName(result?.preferred_div) || '―'}
            </p>
            <p className="resume-compare-score">
                {result?.preferred_div_score != null ? `${result.preferred_div_score}点` : '―'}
            </p>
            {result?.preferred_div_reason && (
                <p className="resume-score-reason">理由: {result.preferred_div_reason}</p>
            )}
            </div>

            <div className="resume-compare-card">
            <h5>推薦部門（AI）</h5>
            <p className="resume-compare-division">
                {getDivisionName(result?.recommended_div) ||
                result?.llm_scoring?.recommended_division ||
                '―'}
            </p>
            <p className="resume-compare-score">
                {result?.recommended_div_score != null ? `${result.recommended_div_score}点` : '―'}
            </p>
            {result?.recommended_div_reason && (
                <p className="resume-score-reason">理由: {result.recommended_div_reason}</p>
            )}
            </div>
        </div>

        {/* 部門別スコア */}
        {result?.llm_scoring?.scores?.length > 0 && (
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

        {/* 共通マストチェック */}
        {result?.must_check && Object.keys(result.must_check).length > 0 && (
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

        {/* 部門別マストチェック */}
        {result?.must_check_by_division &&
            Object.keys(result.must_check_by_division).length > 0 && (
            <div className="resume-section">
                <h5>部門別スキルチェック</h5>
                {Object.entries(result.must_check_by_division).map(
                ([division, checks]: any, idx) => (
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
                )
                )}
            </div>
            )}
        </div>
    );
};

export default ResumeResultSection;