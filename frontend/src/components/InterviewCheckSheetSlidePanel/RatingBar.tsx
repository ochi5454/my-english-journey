import './RatingBar.css';
export type RatingVariant = 'single' | 'fill-left';
export type RatingItem<T extends string | number> = {
    value: T;
    label: string;
    full?: string; 
};

interface Props<T extends string | number> {
    items: RatingItem<T>[];
    value?: T | null;
    onChange: (v: T) => void;
    variant?: RatingVariant;
    size?: 'sm' | 'md';
    disabled?: boolean;
}

export function RatingBar<T extends string | number>({
    items,
    value,
    onChange,
    variant = 'single',
    size = 'md',
    disabled = false,
}: Props<T>) {
    const activeIndex = items.findIndex(it => it.value === value);

    return (
        <div className={`rbar rbar--${variant} rbar--${size}`}>
        {items.map((it, i) => {
            const isActive = activeIndex === i;
            const isFilled = variant === 'fill-left' && activeIndex >= i && activeIndex >= 0;
            return (
            <button
                key={String(it.value)}
                type="button"
                className={`rbar-seg ${isFilled ? 'is-filled' : ''} ${isActive ? 'is-active' : ''}`}
                onClick={() => onChange(it.value)}
                disabled={disabled}
            >
                {it.label}
            </button>
            );
        })}
        </div>
    );
}