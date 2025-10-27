import React, { useEffect, useRef } from "react";
import "./AIProcessingScreen.css";
import { stepToMasterMap } from "./progressSteps";

interface AIProcessingScreenProps {
    currentStatus: string;
    logs: string[];
    progressSteps: { id: string; label: string }[];
    masterMap: Record<string, string>;
    masterDefinitions: Record<string, { icon: string; label: string; comment: string }>;
}

const AIProcessingScreen: React.FC<AIProcessingScreenProps> = ({
    currentStatus,
    logs,
    progressSteps,
    masterDefinitions,
}) => {
    const logEndRef = useRef<HTMLDivElement | null>(null);
    const currentMaster = stepToMasterMap[currentStatus] || "resume";

    // ログ末尾に自動スクロール
    useEffect(() => {
        if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    // 位置計算をより正確に
    const masterKeys = Object.keys(masterDefinitions);
    const currentIndex = Math.max(0, masterKeys.indexOf(currentMaster));
    const segmentWidth = 100 / masterKeys.length;
    const leftPosition = `calc(${segmentWidth * currentIndex + segmentWidth / 2}% - 20px)`; // 中央に寄せる

    return (
        <div className="ai-stage-container">
        {/* === ステップバー === */}
        <div className="ai-progress-bar">
            {progressSteps.map((step, idx) => {
            const isActive =
                currentStatus === step.id || currentStatus.startsWith(`${step.id}_`);
            const nextStep = progressSteps[idx + 1];
            return (
                <React.Fragment key={step.id}>
                <div className={`ai-progress-step ${isActive ? "active" : ""}`}>
                    <span className="ai-step-label">{step.label}</span>
                </div>
                {nextStep && <div className="ai-arrow" />}
                </React.Fragment>
            );
            })}
        </div>

        {/* === マスタ一覧（AIの移動先） === */}
        <div className="ai-masters">
            {Object.entries(masterDefinitions).map(([key, meta]) => (
            <div
                key={key}
                className={`ai-master ${currentMaster === key ? "focus" : ""}`}
            >
                <span className="ai-icon">{meta.icon}</span>
                <p>{meta.label}</p>
                <small>{meta.comment}</small>
            </div>
            ))}

            {/* === AIエージェント === */}
            <div
            className="ai-agent"
            style={{ left: leftPosition }}
            >
            🤖
            </div>
        </div>

        {/* === ログ出力 === */}
        <div className="ai-log-console">
            <h4>📝 AI処理ログ</h4>
            <div className="ai-log-box">
            {logs.map((log, idx) => (
                <div key={idx} className="ai-log-line">
                {log}
                </div>
            ))}
            <div ref={logEndRef} />
            </div>
        </div>
        </div>
    );
};

export default AIProcessingScreen;