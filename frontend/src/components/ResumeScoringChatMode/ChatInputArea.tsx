import React from 'react';
import './ChatInputArea.css';

export type DivisionOption = { name: string; prefix: string };

type Props = {
    divisions: DivisionOption[];
    selectedDivision: string;
    setSelectedDivision: (v: string) => void;

    candidateId: string;
    setCandidateId: (v: string) => void;

    files: File[];
    setFiles: (files: File[]) => void;

    loading: boolean;
    handleUpload: () => void;
};

const ChatInputArea: React.FC<Props> = ({
    divisions,
    selectedDivision,
    setSelectedDivision,
    candidateId,
    setCandidateId,
    files,
    setFiles,
    loading,
    handleUpload,
}) => {
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
        setFiles(Array.from(e.target.files));
        }
    };

    return (
        <div className="chat-input-rows">
        <div className="chat-input-row">
            <select
            value={selectedDivision}
            onChange={(e) => setSelectedDivision(e.target.value)}
            className="chat-select"
            >
            <option value="">希望部門を選択</option>
            {divisions.map((d) => (
                <option key={d.prefix} value={d.prefix}>
                {d.name}
                </option>
            ))}
            </select>

            <div className="candidate-id-container">
            <input
                type="text"
                placeholder="候補者IDを入力"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="chat-candidate-input"
            />
            <button
                type="button"
                className="generate-id-btn"
                onClick={() => {
                const newId = 'cand_' + Math.random().toString(36).substring(2, 10);
                setCandidateId(newId);
                }}
            >
                🔄 自動生成
            </button>
            </div>
        </div>

        <div className="chat-input-row second-row">
            <div className="file-upload-container">
            <label className="custom-file-upload">
                📎 ファイルを選択
                <input type="file" multiple onChange={handleFileChange} />
            </label>

            {files.length > 0 && (
                <div className="file-list">
                {files.map((file, index) => (
                    <span key={index} className="file-name">
                    {file.name}
                    {index < files.length - 1 && ', '}
                    </span>
                ))}
                </div>
            )}
            </div>

            <div className="send-btn-container">
            <button onClick={handleUpload} disabled={loading} className="send-btn">
                {loading ? '処理中...' : '送信'}
            </button>
            </div>
        </div>
        </div>
    );
};

export default ChatInputArea;