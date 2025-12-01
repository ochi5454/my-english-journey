import React, { useState, useEffect, useRef } from 'react';
import { useDivisionColorMap } from './useDivisionColorMap';
import { renderGenderChip, renderStatusChip, renderHrDecisionChip, renderMustCheckChip, renderAIRecommendationChip, renderDivisionChip } from './RenderChips';
import type { Result } from './types';
import appConfig from '../../config';
import { formatDateOnly } from '../Utils/dateFormat';
import '../CandidateScoreMatrix/CandidateMatrixTable.css';

export default function CandidateMatrixTable({
    filteredResults,
    allMustKeys,
    selectedIds,
    setSelectedIds,
    handleRowClick,
    setShowAIPanel
}: {
    filteredResults: Result[];
    allMustKeys: string[];
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    handleRowClick: (id: string) => void;
    setShowAIPanel: React.Dispatch<React.SetStateAction<boolean>>;
}) {

    const { divisionColorMap, prefixToName, loading } = useDivisionColorMap();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editedName, setEditedName] = useState<string>('');
    const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
    const [isFullscreen, setIsFullscreen] = useState(false);

    const wrapperRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [scrollWidth, setScrollWidth] = useState(0);
    const [clientWidth, setClientWidth] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartScrollLeft, setDragStartScrollLeft] = useState(0);

    // ステータスマスタから取得
    const [statusSteps, setStatusSteps] = useState<string[]>([]);
    useEffect(() => {
        fetch(`${appConfig.API_BASE_URL}/admin/status/master`)
            .then(res => res.json())
            .then(rows => {
                setStatusSteps(rows.map((r: any) => r.label));
            })
            .catch(err => console.error("StatusMaster取得エラー:", err));
    }, []);
    const allStatuses = statusSteps;

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const handleScroll = () => {
            setScrollLeft(wrapper.scrollLeft);
            setScrollWidth(wrapper.scrollWidth);
            setClientWidth(wrapper.clientWidth);
        };

        const handleResize = () => {
            setScrollWidth(wrapper.scrollWidth);
            setClientWidth(wrapper.clientWidth);
            setScrollLeft(wrapper.scrollLeft);
        };

        wrapper.addEventListener('scroll', handleScroll);
        window.addEventListener('resize', handleResize);
        
        handleResize();

        const observer = new MutationObserver(handleResize);
        observer.observe(wrapper, { childList: true, subtree: true });

        return () => {
            wrapper.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', handleResize);
            observer.disconnect();
        };
    }, [filteredResults, collapsedStages, isFullscreen]);

    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        
        setTimeout(() => {
            setScrollWidth(wrapper.scrollWidth);
            setClientWidth(wrapper.clientWidth);
            setScrollLeft(wrapper.scrollLeft);
        }, 100);
    }, [isFullscreen]);

    const handleThumbMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStartX(e.clientX);
        setDragStartScrollLeft(scrollLeft);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const wrapper = wrapperRef.current;
            if (!wrapper) return;

            const deltaX = e.clientX - dragStartX;
            const maxScroll = scrollWidth - clientWidth;
            const indicatorWidth = window.innerWidth - 20;
            const thumbWidthPx = maxScroll > 0 
                ? Math.max(30, Math.min((clientWidth / scrollWidth) * indicatorWidth, indicatorWidth - 10))
                : indicatorWidth;
            const maxThumbLeft = indicatorWidth - thumbWidthPx;
            const scrollRatio = maxScroll / maxThumbLeft;
            const newScrollLeft = dragStartScrollLeft + (deltaX * scrollRatio);

            wrapper.scrollLeft = Math.max(0, Math.min(maxScroll, newScrollLeft));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartX, dragStartScrollLeft, scrollWidth, clientWidth]);

    const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;

        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const maxScroll = wrapper.scrollWidth - wrapper.clientWidth;
        const indicatorWidth = rect.width;
        const thumbWidthPx = (wrapper.clientWidth / wrapper.scrollWidth) * indicatorWidth;
        const maxThumbLeft = indicatorWidth - thumbWidthPx;
        const percentage = clickX / indicatorWidth;
        const targetScrollLeft = (percentage * maxScroll);
        
        wrapper.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    };

    if (loading) return <p>読み込み中...</p>;

    const groupedByStatus = allStatuses.reduce((acc, status) => {
        acc[status] = filteredResults.filter(r => {
            const rStatus = r.status || 'アップロード';
            return rStatus === status || (status === 'アップロード' && rStatus.includes('アップロード'));
        });
        return acc;
    }, {} as Record<string, Result[]>);

    const toggleStage = (stage: string) => {
        setCollapsedStages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(stage)) {
                newSet.delete(stage);
            } else {
                newSet.add(stage);
            }
            return newSet;
        });
    };

    const calculateAge = (birthDate?: string) => {
        if (!birthDate) return '-';
        const birth = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    };

    const handleSaveName = async (userId: string) => {
        try {
            const res = await fetch(`${appConfig.API_BASE_URL}/admin/candidates/${userId}/name`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: editedName }),
            });

            if (!res.ok) {
                throw new Error(`Failed to update name: ${res.status}`);
            }
        } catch (error) {
            console.error('名前更新エラー:', error);
            alert('名前の更新に失敗しました。');
        } finally {
            setEditingId(null);
        }
    };

    const renderRow = (r: Result, idx: number) => (
        <tr key={`${r.user_id}-${idx}`} onClick={() => handleRowClick(r.user_id)}>
            <td onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={selectedIds.has(r.user_id)}
                    onChange={(e) => {
                        e.stopPropagation();
                        setSelectedIds(prev => {
                            const s = new Set(prev);
                            e.target.checked ? s.add(r.user_id) : s.delete(r.user_id);
                            return s;
                        });
                    }}
                />
            </td>

            <td onClick={(e) => e.stopPropagation()}>
                {editingId === r.user_id ? (
                    <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onBlur={() => handleSaveName(r.user_id)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName(r.user_id);
                            if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        style={{ width: '100%' }}
                    />
                ) : (
                    <span
                        onDoubleClick={() => {
                            setEditingId(r.user_id);
                            setEditedName(r.user_name || '');
                        }}
                        style={{ cursor: 'text' }}
                    >
                        {r.user_name || '-'}
                    </span>
                )}
            </td>

            <td>{r.user_id}</td>
            <td>{renderGenderChip(r.gender)}</td>
            <td>
                {r.birth_date ? (
                    <>
                        {calculateAge(r.birth_date)}
                        <br />
                        <span style={{ fontSize: '0.8em', color: '#888' }}>
                            {r.birth_date}
                        </span>
                    </>
                ) : '-'}
            </td>
            <td>{formatDateOnly(r.timestamp)|| '-'}</td>
            <td>{r.uploader_id || '-'}</td>
            <td>-</td>
            <td>{renderDivisionChip(r.preferred_div, prefixToName, divisionColorMap)}</td>
            <td>{r.preferred_div_score ? `${r.preferred_div_score}点` : '-'}</td>
            <td>{renderDivisionChip(r.recommended_div, prefixToName, divisionColorMap)}</td>
            <td>{r.recommended_div_score ? `${r.recommended_div_score}点` : ''}</td>
            <td>
                {r.ai_score_percentile !== undefined ? 
                    renderAIRecommendationChip(r.ai_score_percentile) : '-'}
            </td>
            <td>{renderStatusChip(r.status)}</td>
            <td>-</td>
            <td>-</td>
            <td className="allow-wrap">{r.summarized_motivation || r.notes || '-'}</td>
            <td className="allow-wrap">{r.summarized_work || r.work_summary || '-'}</td>
            <td>{r.experience?.toFixed(1) || '-'}年</td>
            <td className="allow-wrap">
                {allMustKeys.map(k => (
                    <div key={k}>
                        {k}: {renderMustCheckChip(r.must_check?.[k]?.result, r.must_check?.[k]?.reason)}
                    </div>
                ))}
            </td>
            <td>-</td>
            <td>{r.document_review_result || '-'}</td>
            <td>{formatDateOnly(r.document_review_date) || '-'}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>            
            <td>{formatDateOnly(r.interview_1_date) || '-'}</td>
            <td>{r.interview_1_result || '-'}</td>
            <td>{formatDateOnly(r.interview_2_date) || '-'}</td>
            <td>{r.interview_2_result || '-'}</td>
            <td>{formatDateOnly(r.interview_final_date) || '-'}</td>
            <td>{r.interview_final_result || '-'}</td>
            <td>{renderHrDecisionChip(r.hr_decision)}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>{r.hr_division || '-'}</td>
            <td>-</td>
            <td>{r.hr_employment_type || '-'}</td>
            <td>{r.hr_pay_type || '-'}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
        </tr>
    );

    const maxScroll = scrollWidth - clientWidth;
    const indicatorWidth = window.innerWidth - 20;
    const thumbWidthPx = maxScroll > 0 
        ? Math.max(30, Math.min((clientWidth / scrollWidth) * indicatorWidth, indicatorWidth - 10))
        : indicatorWidth;
    const scrollPercentage = maxScroll > 0 ? (scrollLeft / maxScroll) : 0;
    const maxThumbLeft = indicatorWidth - thumbWidthPx;
    const thumbLeftPx = Math.min(scrollPercentage * maxThumbLeft, maxThumbLeft);

    const tableContent = (
        <>
            <div 
                className="resume-matrix-wrapper" 
                ref={wrapperRef}
                style={{ paddingBottom: isFullscreen ? '0' : '40px' }}
            >
                {allStatuses.map(status => {
                    const group = groupedByStatus[status];
                    const count = group?.length || 0;
                    
                    if (count === 0) return null;

                    const isCollapsed = collapsedStages.has(status);

                    return (
                        <div key={status} className="status-group">
                            <div 
                                className="status-group-header"
                                onClick={() => toggleStage(status)}
                                style={{
                                    cursor: 'pointer',
                                    padding: '12px',
                                    backgroundColor: '#f5f5f5',
                                    borderBottom: '2px solid #ddd',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontWeight: 'bold',
                                    fontSize: '1.1em'
                                }}
                            >
                                <span style={{ fontSize: '1.2em' }}>
                                    {isCollapsed ? '▶' : '▼'}
                                </span>
                                <span>{status}</span>
                                <span style={{ 
                                    marginLeft: 'auto', 
                                    fontSize: '0.9em',
                                    color: '#666',
                                    backgroundColor: '#fff',
                                    padding: '4px 12px',
                                    borderRadius: '12px'
                                }}>
                                    {count}件
                                </span>
                            </div>

                            {!isCollapsed && (
                                <table className="resume-matrix-table">
                                    <thead>
                                        <tr>
                                            <th>
                                                <input
                                                    type="checkbox"
                                                    checked={group.length > 0 && group.every(r => selectedIds.has(r.user_id))}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedIds(prev => {
                                                                const newSet = new Set(prev);
                                                                group.forEach(r => newSet.add(r.user_id));
                                                                return newSet;
                                                            });
                                                        } else {
                                                            setSelectedIds(prev => {
                                                                const newSet = new Set(prev);
                                                                group.forEach(r => newSet.delete(r.user_id));
                                                                return newSet;
                                                            });
                                                        }
                                                    }}
                                                />
                                            </th>
                                            <th>応募者 名前</th>
                                            <th>応募者No</th>
                                            <th>性別</th>
                                            <th>年齢（応募時）</th>
                                            <th>応募日</th>
                                            <th>対応担当</th>
                                            <th>本社/支社</th>
                                            <th>希望職種</th>
                                            <th>希望職種採点</th>
                                            <th>AI推奨職種</th>
                                            <th>AI推奨職種採点</th>
                                            <th>AI推薦度</th>
                                            <th>進行状況</th>
                                            <th>進行状況詳細</th>
                                            <th>応募求人名</th>
                                            <th>紹介資料などから_</th>
                                            <th>職務経歴サマリー</th>
                                            <th>勤続年数</th>
                                            <th>参考情報</th>
                                            <th>応募経路</th>
                                            <th>応募雇用区分</th>
                                            <th>配属先部署名</th>
                                            <th>採用G見解結果</th>
                                            <th>採用G見解日</th>
                                            <th>採用G見解理由</th>
                                            <th>採用応募判断</th>
                                            <th>採用応募使用</th>
                                            <th>Web面接日時</th>
                                            <th>Web面接合否</th>
                                            <th>二次面接日時</th>
                                            <th>二次合否</th>
                                            <th>合否</th>
                                            <th>内定通知日</th>
                                            <th>内定通知の採択日</th>
                                            <th>入社意欲確認日</th>
                                            <th>入社日</th>
                                            <th>入社意欲再次理由</th>
                                            <th>拒否入社意欲状況</th>
                                            <th>入社意欲非不活動...</th>
                                            <th>契約方式選定の詳...</th>
                                            <th>社員番号</th>
                                            <th>従業員区分</th>
                                            <th>青部パートなど</th>
                                            <th>応募履歴区分</th>
                                            <th>契約依頼書</th>
                                            <th>起業契約</th>
                                            <th>入社対応（契約）</th>
                                            <th>その他記</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.map((r, idx) => renderRow(r, idx))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    );
                })}
            </div>

            {scrollWidth > clientWidth && (
                <div 
                    className="matrix-scroll-indicator"
                    style={{ 
                        zIndex: isFullscreen ? 1001 : 999 
                    }}
                >
                    <div 
                        className="matrix-scroll-indicator-track"
                        onClick={handleTrackClick}
                    >
                        <div 
                            ref={thumbRef}
                            className="matrix-scroll-indicator-thumb"
                            style={{
                                width: `${thumbWidthPx}px`,
                                left: `${thumbLeftPx}px`,
                                cursor: isDragging ? 'grabbing' : 'grab'
                            }}
                            onMouseDown={handleThumbMouseDown}
                        />
                    </div>
                </div>
            )}
        </>
    );

    if (isFullscreen) {
        return (
            <div className="matrix-fullscreen-overlay" onClick={() => setIsFullscreen(false)}>
                <div className="matrix-fullscreen-content" onClick={(e) => e.stopPropagation()}>
                    <button 
                        className="matrix-fullscreen-close"
                        onClick={() => setIsFullscreen(false)}
                    >
                        ✕ 閉じる
                    </button>
                    {tableContent}
                </div>
            </div>
        );
    }

    return (
        <>
            <button 
                className="matrix-fullscreen-button"
                onClick={() => setIsFullscreen(true)}
            >
                🔍 フルスクリーン表示
            </button>
            {tableContent}
        </>
    );
}