import React, { useRef, useLayoutEffect, useState } from "react";
import "./AIProcessingScreen.css";
import { stepToMasterMap, resolveStepId } from "./progressSteps";

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
  const masterContainerRef = useRef<HTMLDivElement>(null);
  const agentRef = useRef<HTMLDivElement>(null);
  const [agentStyle, setAgentStyle] = useState({ left: "50%", bottom: "20px" });

  // 現在のステップからマスタを特定
  const resolvedStep = resolveStepId(currentStatus);
  const mappedKey = stepToMasterMap[resolvedStep] || "resume";
  const agentEmoji = currentStatus === "llm" ? "🤖💭" : "🤖";

  // DOM 位置に基づいてロボットを移動
    useLayoutEffect(() => {
    const container = masterContainerRef.current;
    if (!container) return;

    const target = container.querySelector(`[data-master-id="${mappedKey}"]`) as HTMLElement;
    if (target) {
        // container左上を基準に座標を算出
        const left = target.offsetLeft + target.offsetWidth / 2;
        const top = target.offsetTop;

        // ロボットをカード上部に配置
        const bottom = container.clientHeight - top - target.offsetHeight / 2 - 10; 

        setAgentStyle({
        left: `${left}px`,
        bottom: `${bottom}px`,
        });
    } else {
        console.warn("🤖 target not found for", mappedKey);
    }
    }, [mappedKey, currentStatus]);

  // 稼働中・待機中分類
  const runningAgents = progressSteps.filter((s) => s.id === currentStatus);
  const idleAgents = progressSteps.filter((s) => s.id !== currentStatus);

  return (
    <div className="ai-stage-container">
      <h2 className="ai-section-title">エージェントのワークフロー</h2>

      {/* ===== 上段：マスタゾーン ===== */}
      <div className="ai-horizontal-masters" ref={masterContainerRef}>
        {Object.entries(masterDefinitions).map(([id, def]) => (
          <div
            key={id}
            data-master-id={id}
            className={`ai-master-card ${id === mappedKey ? "focus" : ""}`}
          >
            <div className="ai-master-icon">{def.icon}</div>
            <div className="ai-master-label">{def.label}</div>
          </div>
        ))}

        {/* 🤖 エージェント */}
        <div
          ref={agentRef}
          className={`ai-agent-mover bouncing`}
          style={{
            position: "absolute",
            left: agentStyle.left,
            bottom: agentStyle.bottom,
          }}
        >
          {agentEmoji}
        </div>
      </div>

      {/* ===== 下段：稼働状態 ===== */}
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
                  <div className="ai-agent-empty">稼働中エージェントなし</div>
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
                  <div className="ai-agent-empty">全エージェントが稼働中</div>
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