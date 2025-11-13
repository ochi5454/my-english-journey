// src/components/ResumeScoringChatMode/JsonDataDisplay.tsx
import React from 'react';
import './JsonDataDisplay.css';

interface JsonDataDisplayProps {
    data: any;
}

const JsonDataDisplay: React.FC<JsonDataDisplayProps> = ({ data }) => {
    // データの種類を判定
    const renderData = () => {
        if (Array.isArray(data)) {
            return (
                <div className="json-array">
                    {data.map((item, idx) => (
                        <div key={idx} className="json-item">
                            <strong>項目 {idx + 1}:</strong>
                            <pre>{JSON.stringify(item, null, 2)}</pre>
                        </div>
                    ))}
                </div>
            );
        }

        if (typeof data === 'object' && data !== null) {
            return (
                <div className="json-object">
                    {Object.entries(data).map(([key, value]) => (
                        <div key={key} className="json-field">
                            <span className="json-key">{key}:</span>
                            <span className="json-value">
                                {typeof value === 'object' 
                                    ? <pre>{JSON.stringify(value, null, 2)}</pre>
                                    : String(value)
                                }
                            </span>
                        </div>
                    ))}
                </div>
            );
        }

        return <span>{String(data)}</span>;
    };

    return (
        <div className="json-data-display">
            <div className="json-header">📊 データ詳細</div>
            <div className="json-content">
                {renderData()}
            </div>
        </div>
    );
};

export default JsonDataDisplay; // ← これが重要