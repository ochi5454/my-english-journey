import React from 'react';

export type FocusTag = {
    id: string;
    label: string;
};

interface Props {
    allTags: FocusTag[];
    selectedTags: string[];
    onToggleTag: (id: string) => void;
}

export const TagSelector: React.FC<Props> = ({ allTags, selectedTags, onToggleTag }) => (
    <div className="resume-tag-list">
        {allTags.map(tag => (
        <div
            key={tag.id}
            className={`resume-tag ${selectedTags.includes(tag.id) ? 'selected' : ''}`}
            onClick={() => onToggleTag(tag.id)}
        >
            {tag.label}
        </div>
        ))}
    </div>
);