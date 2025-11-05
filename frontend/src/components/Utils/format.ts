export const formatDate = (isoStr?: string): string => {
  if (!isoStr) return '日時不明';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return '日時不明';

  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    // つけたい場合：timeZoneName: 'short'  // → 例: "2025/11/06 13:45 GMT+9"
  });
};