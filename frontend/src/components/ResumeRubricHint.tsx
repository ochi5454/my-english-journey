// components/RubricHint.tsx
import React, { useState, useRef, useEffect } from 'react';

export const ResumeRubricHint: React.FC<{ title: string; bullets: string[] }> = ({ title, bullets }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
        if (!ref.current || ref.current.contains(e.target as Node)) return;
        setOpen(false);
        };
        document.addEventListener('click', onDoc);
        return () => document.removeEventListener('click', onDoc);
    }, []);

    return (
        <div className="iq-hint" ref={ref}>
        <button
            type="button"
            className="iq-hint-btn"
            aria-label={`${title} の説明`}
            onClick={() => setOpen(v => !v)}
        >i</button>
        {open && (
            <div className="iq-hint-pop" role="dialog" aria-label={title}>
            <div className="iq-hint-title">{title}</div>
            <ul className="iq-hint-list">
                {bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
            </div>
        )}
        </div>
    );
};