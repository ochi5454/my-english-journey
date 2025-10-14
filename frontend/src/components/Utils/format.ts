export const formatDate = (isoStr?: string): string => {
    if (!isoStr) return '日時不明';
    const date = new Date(isoStr);
    return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};