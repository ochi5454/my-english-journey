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

export function renderDivisionChip(
    prefix?: string,
    prefixToName?: Record<string, string>,      // ← ✅ 和名辞書
    divisionColorMap?: Record<string, string>   // ← ✅ prefix → 色
) {

    if (!prefix) return <span>-</span>;

    // ✅ prefix → 和名に変換（例: "fac" → "ファシリティ"）
    const divisionName = prefixToName?.[prefix] || prefix;

    // ✅ 背景色は prefix をキーに取得（useDivisionColorMap が返してくれてる）
    const bgColor = divisionColorMap?.[prefix] || '#f0f0f0';

    return (
        <span
            style={{
                backgroundColor: bgColor,
                color: '#333',
                padding: '4px 8px',
                borderRadius: '6px',
                display: 'inline-block',
                fontSize: '0.85rem',
            }}
        >
            {divisionName}
        </span>
    );
}