export const renderGenderChip = (gender?: string) => {
    let label = 'その他';
    let className = 'gender-chip other';
    if (gender === '男') { label = '男性'; className = 'gender-chip male'; }
    else if (gender === '女') { label = '女性'; className = 'gender-chip female'; }
    return <span className={className}>{label}</span>;
};

export const renderStatusChip = (status?: string) => {
    if (!status || status === 'アップロード')
        return <span className="matrix-status-chip matrix-status-upload">アップロード</span>;
    return <span className="matrix-status-chip matrix-status-active">{status}</span>;
};

export const renderHrDecisionChip = (decision?: string) => {
    if (decision === 'hire_ok') return <span className="hr-chip hr-hire-ok">採用</span>;
    if (decision === 'hire_ng') return <span className="hr-chip hr-hire-ng">不採用</span>;
    return <span className="hr-chip hr-pending">選考中</span>;
};

export const renderMustCheckChip = (result?: boolean, reason?: string) => {
    if (result === true) return <span className="mustcheck-chip mustcheck-ok" title={reason}>合格</span>;
    if (result === false) return <span className="mustcheck-chip mustcheck-ng" title={reason}>不合格</span>;
    return <span className="mustcheck-chip mustcheck-unknown" title="未評価">--</span>;
};

export const renderAIRecommendationChip = (percentile?: number) => {
    if (percentile === undefined) return <span className="ai-chip ai-unknown">-</span>;
    let className = 'ai-chip ai-low';
    if (percentile >= 75) className = 'ai-chip ai-high';
    else if (percentile >= 50) className = 'ai-chip ai-mid';
    return <span className={className}>{percentile}%</span>;
};

export const renderDivisionChip = (
    division?: string,
    colorMap?: Record<string, string>
) => {
    if (!division) return <span className="chip chip-gray">-</span>;
    const bgColor = colorMap?.[division] || '#9ca3af';
    return (
        <span
        className="chip"
        style={{
            backgroundColor: bgColor,
            color: '#626161ff',
            borderRadius: '12px',
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: 600,
        }}
        >
        {division}
        </span>
    );
};