// ResumeResultDetail.tsx
import React from 'react';

interface Props {
    result: any;
    onClose: () => void;
}

const ResumeResultDetail: React.FC<Props> = ({ result, onClose }) => {
    return (
    <>
        <div className="resume-modal-overlay" onClick={onClose}></div>
        <div className="resume-modal">
        <button onClick={onClose} className="resume-close-button">✖ 閉じる</button>

        <h3>候補者: {result.user_id}</h3>
        <p>評価日: {result.timestamp}</p>
        <p>推奨部門: {result.recommended_division}</p>

        <h4>マスト要件チェック:</h4>
        <ul>
            {Object.entries(result.must_check || {}).map(([key, val]: any) => (
            <li key={key} style={{ color: val.result ? 'green' : 'red' }}>
                {key}: {val.result ? '✅' : '❌'} - {val.reason}
            </li>
            ))}
        </ul>

        <h4>スコア評価:</h4>
        {result.scores.map((s: any) => (
            <div key={s.division} className="resume-score-item">
            <p><strong>{s.division}</strong>: {s.score}点</p>
            <p className="resume-score-reason">{s.reason}</p>
            </div>
        ))}
        </div>
    </>
    );
};

export default ResumeResultDetail;