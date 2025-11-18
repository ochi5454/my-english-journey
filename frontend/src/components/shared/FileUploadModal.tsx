import React, { useState, useRef } from 'react';
import './FileUploadModal.css';

interface FileUploadModalProps {
    title: string;
    description: string;
    acceptedFormats?: string;
    maxFiles?: number;
    multiple?: boolean;
    onClose: () => void;
    onUpload: (files: File[]) => Promise<void>;
    allowCloseWhileUploading?: boolean;
}

/**
 * 共通ファイルアップロードモーダル
 * - 複数ファイル対応
 * - ドラッグ&ドロップ
 * - アップロード中の画面ロック
 */
const FileUploadModal: React.FC<FileUploadModalProps> = ({
    title,
    description,
    acceptedFormats = '.pdf,.doc,.docx,.xlsx,.xls',
    maxFiles = 50,
    multiple = true,
    onClose,
    onUpload,
    allowCloseWhileUploading = false
}) => {
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (files: File[]) => {
        // ファイル形式チェック
        const validExtensions = acceptedFormats.split(',').map(ext => ext.trim().toLowerCase());
        const validFiles = files.filter(file => {
            const fileName = file.name.toLowerCase();
            return validExtensions.some(ext => fileName.endsWith(ext));
        });

        if (validFiles.length !== files.length) {
            alert(`対応ファイル形式: ${acceptedFormats}`);
        }

        if (validFiles.length > maxFiles) {
            alert(`一度に${maxFiles}件までアップロードできます`);
            return;
        }

        setSelectedFiles(validFiles);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files);
        handleFileSelect(droppedFiles);
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        handleFileSelect(files);
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        setIsUploading(true);
        try {
            await onUpload(selectedFiles);
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleClose = () => {
        if (isUploading && !allowCloseWhileUploading) {
            return; // アップロード中は閉じられない
        }
        onClose();
    };

    return (
        <div
            className={`file-upload-modal-overlay ${isUploading ? 'locked' : ''}`}
            onClick={handleClose}
        >
            <div
                className="file-upload-modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ヘッダー */}
                <div className="file-upload-modal-header">
                    <h2>{title}</h2>
                    <button
                        className="file-upload-modal-close"
                        onClick={handleClose}
                        disabled={isUploading && !allowCloseWhileUploading}
                    >
                        ✕
                    </button>
                </div>

                {/* ボディ */}
                <div className="file-upload-modal-body">
                    <p className="file-upload-description">{description}</p>

                    {/* ドロップゾーン */}
                    <div
                        className={`file-upload-dropzone ${isDragging ? 'dragging' : ''} ${selectedFiles.length > 0 ? 'has-files' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                    >
                        {selectedFiles.length === 0 ? (
                            <>
                                <span className="upload-icon">🗂️</span>
                                <p className="upload-text">
                                    ファイルをドラッグ&ドロップ または クリック
                                </p>
                                <p className="upload-hint">
                                    対応形式: {acceptedFormats.replace(/\./g, '').toUpperCase()}
                                    {multiple && ` (最大${maxFiles}件)`}
                                </p>
                            </>
                        ) : (
                            <div className="selected-files-list">
                                <div className="selected-files-header">
                                    <strong>選択中: {selectedFiles.length}件</strong>
                                    {!isUploading && (
                                        <button
                                            className="clear-files-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedFiles([]);
                                            }}
                                        >
                                            全削除
                                        </button>
                                    )}
                                </div>
                                <div className="files-scroll-area">
                                    {selectedFiles.map((file, index) => (
                                        <div key={index} className="file-item">
                                            <div className="file-info">
                                                <span className="file-icon">📄</span>
                                                <div className="file-details">
                                                    <span className="file-name">{file.name}</span>
                                                    <span className="file-size">
                                                        {(file.size / 1024).toFixed(1)} KB
                                                    </span>
                                                </div>
                                            </div>
                                            {!isUploading && (
                                                <button
                                                    className="remove-file-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveFile(index);
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple={multiple}
                        accept={acceptedFormats}
                        onChange={handleFileInputChange}
                        disabled={isUploading}
                        style={{ display: 'none' }}
                    />

                    {/* アクションボタン */}
                    <div className="file-upload-actions">
                        <button
                            className="file-upload-button cancel"
                            onClick={handleClose}
                            disabled={isUploading && !allowCloseWhileUploading}
                        >
                            キャンセル
                        </button>
                        <button
                            className="file-upload-button submit"
                            onClick={handleUpload}
                            disabled={selectedFiles.length === 0 || isUploading}
                        >
                            {isUploading ? 'アップロード中...' : `アップロード${selectedFiles.length > 0 ? ` (${selectedFiles.length}件)` : ''}`}
                        </button>
                    </div>
                </div>

                {/* アップロード中のオーバーレイ */}
                {isUploading && (
                    <div className="upload-progress-overlay">
                        <div className="upload-progress-content">
                            <div className="spinner"></div>
                            <p>処理中です...</p>
                            <p className="upload-progress-hint">
                                画面を閉じないでください
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileUploadModal;
