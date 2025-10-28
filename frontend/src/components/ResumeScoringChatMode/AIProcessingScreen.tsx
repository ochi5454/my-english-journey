import React from "react";
import "./AIProcessingScreen.css";
import { stepToMasterMap } from "./progressSteps"; 

interface ProgressStep {
    id: string;
    label: string;
}

interface MasterDefinition {
    icon: string;
    label: string;
    comment: string;
}

interface AIProcessingScreenProps {
    currentStatus: string;
    progressSteps: ProgressStep[];
    masterDefinitions: Record<string, MasterDefinition>;
}

const AIProcessingScreen: React.FC<AIProcessingScreenProps> = ({
    currentStatus,
    progressSteps,
    masterDefinitions,
}) => {
  // masterDefinitions のキー一覧
    const masterKeys = Object.keys(masterDefinitions);

    // 現在ステータスがどのマスタに対応するか
    const mappedKey = stepToMasterMap[currentStatus] || "resume"; // 👈 マッピングを使う
    const activeIndex = masterKeys.findIndex((key) => key === mappedKey);
    const stepWidth = 100 / (masterKeys.length + 1);
    const agentPosition =
    activeIndex >= 0 ? (activeIndex + 1) * stepWidth : stepWidth;

    // === アイコン（考え中 or 通常） ===
    const agentEmoji = currentStatus === "llm" ? "🤖💭" : "🤖";

    // 稼働中・待機中の分類
    const runningAgents = progressSteps.filter(
        (step) => step.id === currentStatus
    );
    const idleAgents = progressSteps.filter(
        (step) => step.id !== currentStatus
    );

    return (
        <div className="ai-stage-container">
        {/* ===== 見出し ===== */}
        <h2 className="ai-section-title">エージェントのワークフロー</h2>

        {/* ===== 上段：マスタゾーン（固定） ===== */}
        <div className="ai-horizontal-masters">
            {Object.entries(masterDefinitions).map(([id, def]) => (
            <div
                key={id}
                className={`ai-master-card ${
                id === currentStatus ? "focus" : ""
                }`}
            >
                <div className="ai-master-icon">{def.icon}</div>
                <div className="ai-master-label">{def.label}</div>
            </div>
            ))}


            {/* 🤖 エージェント */}
            <div
                className="ai-agent-mover bouncing"
                style={{ left: `${agentPosition}%` }}
            >
                {agentEmoji}
            </div>
        </div>

        {/* ===== 下段：スクロール対象 ===== */}
        <div className="ai-status-scroll-area">
            <div className="ai-status-board">
            <h3>エージェントの稼働状態</h3>
            <div className="ai-status-columns">
                {/* 稼働中 */}
                <div className="ai-status-column">
                <h4>稼働中</h4>
                <div className="ai-agent-list">
                    {runningAgents.length > 0 ? (
                    runningAgents.map((agent) => (
                        <div key={agent.id} className="ai-agent-card active">
                        <span className="ai-agent-icon">🚀</span>
                        <div className="ai-agent-info">
                            <strong>{agent.label}</strong>
                            <span className="ai-agent-id">ID: {agent.id}</span>
                        </div>
                        </div>
                    ))
                    ) : (
                    <div className="ai-agent-empty">
                        稼働中エージェントなし
                    </div>
                    )}
                </div>
                </div>

                {/* 待機中 */}
                <div className="ai-status-column">
                <h4>待機中</h4>
                <div className="ai-agent-list">
                    {idleAgents.length > 0 ? (
                    idleAgents.map((agent) => (
                        <div key={agent.id} className="ai-agent-card idle">
                        <span className="ai-agent-icon">💤</span>
                        <div className="ai-agent-info">
                            <strong>{agent.label}</strong>
                            <span className="ai-agent-id">ID: {agent.id}</span>
                        </div>
                        </div>
                    ))
                    ) : (
                    <div className="ai-agent-empty">
                        全エージェントが稼働中
                    </div>
                    )}
                </div>
                </div>
            </div>
            </div>
        </div>
        </div>
    );
};

export default AIProcessingScreen;