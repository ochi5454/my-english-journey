import './HRFinalReviewDashboard.css';

export const RenderMustCheckChip = (result: boolean | undefined, reason?: string) => {
    if (result === true) {
        return <span className="hr-mustcheck-chip hr-mustcheck-ok" title={reason}>合格</span>;
    } else if (result === false) {
        return <span className="hr-mustcheck-chip hr-mustcheck-ng" title={reason}>不合格</span>;
    } else {
        return <span className="hr-mustcheck-chip hr-mustcheck-unknown" title="未評価">--</span>;
    }
};