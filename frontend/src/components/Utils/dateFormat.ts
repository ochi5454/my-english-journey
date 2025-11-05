export const formatToJST = (isoString: string | null | undefined): string => {
    if (!isoString) return '-';
    
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '-';
        
        const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000); // UTC+9
        
        const year = jstDate.getUTCFullYear();
        const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jstDate.getUTCDate()).padStart(2, '0');
        const hours = String(jstDate.getUTCHours()).padStart(2, '0');
        const minutes = String(jstDate.getUTCMinutes()).padStart(2, '0');
        
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch {
        return '-';
    }
};

export const formatDateOnly = (isoString: string | null | undefined): string => {
    if (!isoString) return '-';
    
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '-';
        
        const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        
        const year = jstDate.getUTCFullYear();
        const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(jstDate.getUTCDate()).padStart(2, '0');
        
        return `${year}/${month}/${day}`;
    } catch {
        return '-';
    }
};