import React, { useState, useEffect } from 'react';
import './CandidateResultDetailV2.css';
import VerticalStatusBar from './VerticalStatusBar';
import StatusContentPanel from './StatusContentPanel';
import ScoreDetail from '../CandidateResultDetail/ScoreDetail';
import InterviewSetupSlidePanel from '../InterviewSetupSlidePanel/InterviewSetupSlidePanel';
import InterviewCheckSheetSlidePanel from '../InterviewCheckSheetSlidePanel/InterviewCheckSheetSlidePanel';
import HrDecisionEditor from '../CandidateResultDetail/HrDecisionEditor';
import appConfig from '../../config';

interface Props {
    result: any;
    onClose: () => void;
    onResultUpdate?: (updatedResult: any) => void;
    interviewerId: string;
    prefixToName: Record<string, string>;
    configData: {
        hiringDecisions: { id: string; value: string }[];
    };
}

const CandidateResultDetailV2: React.FC<Props> = ({
    result,
    onClose,
    onResultUpdate,
    interviewerId,
    prefixToName,
    configData,
}) => {
    const [localResult, setLocalResult] = useState<any>(result);
    // 初期ステージを候補者のステータスに合わせる
    const [selectedStage, setSelectedStage] = useState<string>(result.status || "書類選考");
    const [showInterviewModal, setShowInterviewModal] = useState(false);
    const [showInterviewPrepModal, setShowInterviewPrepModal] = useState(false);
    const [interviewStage, setInterviewStage] = useState<string | null>(null);
    const [interviewPrepData, setInterviewPrepData] = useState<Record<string, any>>({});
    const [showReuploadModal, setShowReuploadModal] = useState(false);
    const [reuploadFiles, setReuploadFiles] = useState<File[]>([]);
    const [isReuploading, setIsReuploading] = useState(false);
    const [isEditingGender, setIsEditingGender] = useState(false);
    const [genderDraft, setGenderDraft] = useState(localResult.gender || 'その他');
    const [hrDecisionDraft, setHrDecisionDraft] = useState(localResult.hr_decision || '');
    const [isEditingHrDecision, setIsEditingHrDecision] = useState(false);
    const [chatLogByCandidate, setChatLogByCandidate] = useState<Record<string, any[]>>({});
    const [uploadDivision, setUploadDivision] = useState<string>('');

    useEffect(() => {
        setLocalResult(result);
        // resultが更新されたらステージも更新
        if (result.status) {
            setSelectedStage(result.status);
        }
    }, [result]);

    useEffect(() => {
        if (!interviewStage || !interviewerId || !result?.user_id) return;

        const url = `${appConfig.API_BASE_URL}/checksheet/one?` +
            new URLSearchParams({
                interviewer_id: interviewerId,
                candidate_id: result.user_id,
                stage: interviewStage,
            }).toString();

        fetch(encodeURI(url))
            .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
            .then(block => {
                setInterviewPrepData(prev => ({ ...prev, [interviewStage]: block }));
            })
            .catch(err => console.warn('面談準備取得失敗:', err));
    }, [interviewStage, interviewerId, result?.user_id]);

    const handleResultRefresh = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/resume-result/${localResult.user_id}`, {
                cache: 'no-store',
            });
            if (res.ok) {
                const updatedResult = await res.json();
                setLocalResult(updatedResult);
                onResultUpdate?.(updatedResult);
            }
        } catch (err) {
            console.error('結果の再取得に失敗:', err);
        }
    };

    const handleOpenInterviewFlow = (stage: string) => {
        setInterviewStage(stage);
        setShowInterviewModal(true);
    };

    const handleOpenInterviewPrep = (stage: string) => {
        setInterviewStage(stage);
        setShowInterviewPrepModal(true);
    };

    const handleOpenReupload = () => {
        setShowReuploadModal(true);
    };

    const handleReupload = async () => {
        if (reuploadFiles.length === 0) {
            alert('ファイルを選択してください');
            return;
        }

        setIsReuploading(true);
        const formData = new FormData();
        formData.append('candidate_id', localResult.user_id);
        formData.append('uploader_id', interviewerId);
        reuploadFiles.forEach(file => formData.append('files', file));

        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/reupload-resume`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) throw new Error('再アップロードに失敗しました');

            alert('ファイルを再アップロードしました');
            setShowReuploadModal(false);
            setReuploadFiles([]);
            await handleResultRefresh();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        } finally {
            setIsReuploading(false);
        }
    };

    const handleSaveGender = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/candidate-gender-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    gender: genderDraft,
                }),
            });

            if (!res.ok) throw new Error('性別の更新に失敗しました');

            setLocalResult((prev: any) => ({
                ...prev,
                gender: genderDraft,
            }));

            onResultUpdate?.({
                ...(localResult || {}),
                gender: genderDraft,
            });

            setIsEditingGender(false);
            alert('性別を更新しました');
        } catch (err) {
            console.error(err);
            alert('更新エラーが発生しました');
        }
    };

    const handleSaveHrDecision = async () => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/hr-review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': interviewerId,
                },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    review: {
                        decision: hrDecisionDraft,
                    }
                }),
            });

            if (!res.ok) throw new Error('保存に失敗しました');

            setLocalResult((prev: any) => ({
                ...prev,
                hr_decision: hrDecisionDraft,
            }));

            onResultUpdate?.({
                ...(localResult || {}),
                hr_decision: hrDecisionDraft,
            });

            setIsEditingHrDecision(false);
            alert('HR決定を保存しました');
        } catch (err) {
            console.error(err);
            alert('保存エラーが発生しました');
        }
    };

    const handleInterviewSubmit = async (data: any) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/interview/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_id: localResult.user_id,
                    ...data,
                }),
            });

            if (!res.ok) throw new Error('面談設定に失敗しました');

            alert('面談を設定しました');
            setShowInterviewModal(false);
            await handleResultRefresh();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    const handleCheckSheetSubmit = async (data: any) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/checksheet/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    interviewer_id: interviewerId,
                    candidate_id: localResult.user_id,
                    stage: interviewStage,
                    ...data,
                }),
            });

            if (!res.ok) throw new Error('チェックシート保存に失敗しました');

            alert('チェックシートを保存しました');
            setShowInterviewPrepModal(false);
            await handleResultRefresh();
        } catch (err: any) {
            alert(`エラー: ${err.message}`);
        }
    };

    return (
        <>
            <div className="result-detail-v2-overlay" onClick={onClose}></div>
            <div className="result-detail-v2-modal">
                {/* ヘッダー */}
                <div className="result-detail-v2-header">
                    <div className="header-left">
                        <h2>
                            👤 候補者: {localResult.user_name || localResult.user_id}
                        </h2>
                        <div className="header-meta">
                            {isEditingGender ? (
                                <div className="gender-edit-inline">
                                    <select
                                        value={genderDraft}
                                        onChange={(e) => setGenderDraft(e.target.value)}
                                    >
                                        <option value="男性">男性</option>
                                        <option value="女性">女性</option>
                                        <option value="その他">その他</option>
                                    </select>
                                    <button onClick={handleSaveGender}>保存</button>
                                    <button onClick={() => setIsEditingGender(false)}>
                                        キャンセル
                                    </button>
                                </div>
                            ) : (
                                <span onClick={() => setIsEditingGender(true)} style={{ cursor: 'pointer' }}>
                                    ⚧️ 性別: {localResult.gender || '不明'} ✏️
                                </span>
                            )}
                            <span>
                                📌 推奨部門: {prefixToName[localResult.recommended_division] || localResult.recommended_division}
                            </span>
                        </div>
                    </div>
                    <div className="header-right">
                        <HrDecisionEditor
                            value={hrDecisionDraft}
                            onChange={setHrDecisionDraft}
                            onSave={handleSaveHrDecision}
                            onCancel={() => {
                                setHrDecisionDraft(localResult.hr_decision || '');
                                setIsEditingHrDecision(false);
                            }}
                            isEditing={isEditingHrDecision}
                            setIsEditing={setIsEditingHrDecision}
                            hiringDecisions={configData.hiringDecisions}
                        />
                        <button className="close-button" onClick={onClose}>
                            ✕ 閉じる
                        </button>
                    </div>
                </div>

                {/* メインコンテンツ */}
                <div className="result-detail-v2-content">
                    {/* 左側: 縦型ステータスバー */}
                    <VerticalStatusBar
                        localResult={localResult}
                        selectedStage={selectedStage}
                        onStageSelect={setSelectedStage}
                    />

                    {/* 中央: 候補者詳細情報 */}
                    <ScoreDetail
                        localResult={localResult}
                        prefixToName={prefixToName}
                    />

                    {/* 右側: ステージ別コンテンツパネル */}
                    <StatusContentPanel
                        selectedStage={selectedStage}
                        localResult={localResult}
                        interviewerId={interviewerId}
                        onResultUpdate={handleResultRefresh}
                        onOpenInterviewFlow={handleOpenInterviewFlow}
                        onOpenInterviewPrep={handleOpenInterviewPrep}
                        onOpenReupload={handleOpenReupload}
                        chatLogByCandidate={chatLogByCandidate}
                        onChatLogChange={(candidateId, newLog) => {
                            setChatLogByCandidate(prev => ({ ...prev, [candidateId]: newLog }));
                        }}
                        uploadDivision={uploadDivision}
                        onUploadDivisionChange={setUploadDivision}
                    />
                </div>

                {/* 面談セットアップモーダル */}
                {showInterviewModal && interviewStage && (
                    <InterviewSetupSlidePanel
                        isOpen={showInterviewModal}
                        onClose={() => setShowInterviewModal(false)}
                        candidateId={localResult.user_id}
                        stage={interviewStage}
                        onSubmit={handleInterviewSubmit}
                    />
                )}

                {/* 面談準備シートモーダル */}
                {showInterviewPrepModal && interviewStage && (
                    <InterviewCheckSheetSlidePanel
                        isOpen={showInterviewPrepModal}
                        onClose={() => setShowInterviewPrepModal(false)}
                        candidateId={localResult.user_id}
                        interviewerId={interviewerId}
                        stage={interviewStage}
                        onSubmit={handleCheckSheetSubmit}
                        initialData={interviewPrepData[interviewStage] || undefined}
                        prefixToName={prefixToName}
                    />
                )}

                {/* 再アップロードモーダル */}
                {showReuploadModal && (
                    <div className="reupload-modal-overlay" onClick={() => setShowReuploadModal(false)}>
                        <div className="reupload-modal-content" onClick={(e) => e.stopPropagation()}>
                            <h3>📤 ファイル再アップロード</h3>
                            <input
                                type="file"
                                multiple
                                onChange={(e) => setReuploadFiles(Array.from(e.target.files || []))}
                            />
                            <div className="modal-buttons">
                                <button
                                    onClick={handleReupload}
                                    disabled={isReuploading}
                                    className="upload-button"
                                >
                                    {isReuploading ? 'アップロード中...' : 'アップロード'}
                                </button>
                                <button onClick={() => setShowReuploadModal(false)}>
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default CandidateResultDetailV2;
