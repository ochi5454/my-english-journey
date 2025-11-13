import React from 'react';
import FileUploadModal from '../shared/FileUploadModal';
import appConfig from '../../config';

interface Props {
    candidateId: string;
    preferredDivision: string;
    reviewerId: string;
    onClose: () => void;
    onSuccess: () => void;
}

/**
 * 履歴書再アップロード用モーダル
 * AI評価時に履歴書が見つからない場合に表示される
 * 共通のFileUploadModalを使用
 */
const ResumeReuploadModal: React.FC<Props> = ({
    candidateId,
    preferredDivision,
    reviewerId,
    onClose,
    onSuccess
}) => {
    const handleUpload = async (files: File[]) => {
        // FormDataを作成
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        formData.append('candidate_id', candidateId);
        formData.append('uploader_id', reviewerId);
        if (preferredDivision) {
            formData.append('desired_division', preferredDivision);
        }

        // 履歴書アップロード＆スコアリング
        const res = await fetch(`${appConfig.API_BASE_URL}/resume-score-save`, {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            throw new Error('アップロードに失敗しました');
        }

        // SSE (Server-Sent Events) の処理
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));

                        // 最終結果を受け取ったら成功
                        if (data.status === 'done' || data.status === 'final_payload') {
                            onClose();
                            alert('履歴書のアップロードとAI評価が完了しました');
                            onSuccess();
                            return;
                        }

                        // エラーが発生した場合
                        if (data.status === 'error') {
                            throw new Error(data.log || 'アップロード処理中にエラーが発生しました');
                        }
                    }
                }
            }
        }

        onClose();
        alert('履歴書のアップロードとAI評価が完了しました');
        onSuccess();
    };

    return (
        <FileUploadModal
            title="📤 履歴書の再アップロード"
            description={`候補者 ${candidateId} の履歴書が見つかりません。ファイルをアップロードしてAI評価を実行します。`}
            acceptedFormats=".pdf,.doc,.docx,.xlsx,.xls"
            maxFiles={10}
            multiple={true}
            onClose={onClose}
            onUpload={handleUpload}
            allowCloseWhileUploading={false}
        />
    );
};

export default ResumeReuploadModal;
