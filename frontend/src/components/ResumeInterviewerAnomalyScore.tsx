import React, { useEffect, useState } from "react";
import axios from "axios";

type Props = {
  candidateId: string;
  stages: string[];
  interviewerIds: string[];
  reliability: Record<string, number>; // 0‰1
};

type CriterionRow = {
  criterion: string;
  scores: Record<string, number | string>;
};

const QUANT_ITEMS: { key: string; label: string }[] = [
  { key: 'self_management', label: '自己管理・モチベ・文化適合性' },
  { key: 'workstyle_relation', label: 'ワークスタイル・他者との関係性' },
  { key: 'communication', label: 'コミュニケーション・スキル' },
  { key: 'leadership', label: 'リーダーシップ' },
  { key: 'logical_thinking', label: '論理的思考力（地頭力）' },
  { key: 'execution_pm', label: '作業・プロジェクト管理力' },
  { key: 'expertise', label: '専門性（知識・スキル）' },
  { key: 'biz_org_dev', label: 'ビジネス＆組織開発' },
];

const FINAL_ITEMS = [
  { key: 'hiringDecision', label: '採用可否' },
  { key: 'recommendedDivision', label: '推奨部門' },
  { key: 'recommendedTitle', label: '推奨タイトル' },
];

const labelMap = Object.fromEntries([...QUANT_ITEMS, ...FINAL_ITEMS].map(({ key, label }) => [key, label]));
const QUANT_KEYS = new Set(QUANT_ITEMS.map(i => i.key));

const ResumeInterviewerAnomalyScore: React.FC<Props> = ({ candidateId, stages, interviewerIds, reliability }) => {
  const [rows, setRows] = useState<CriterionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const allData: CriterionRow[] = [];

        for (const stage of stages) {
          for (const iid of interviewerIds) {
            const res = await axios.get(`/checksheet/one?interviewer_id=${encodeURIComponent(iid)}&candidate_id=${encodeURIComponent(candidateId)}&stage=${encodeURIComponent(stage)}`);
            const qdata = (res.data as { quantitative?: Record<string, any> })?.quantitative || {};
            const qldata = (res.data as { qualitative?: Record<string, any> })?.qualitative || {};

            Object.entries(qdata).forEach(([criterion, scoreObj]) => {
              let scoreValue: number | string = "-";
              if (typeof scoreObj === "number") {
                scoreValue = scoreObj;
              } else if (scoreObj && typeof scoreObj === "object" && "level" in scoreObj) {
                scoreValue = scoreObj.level;
              }

              let row = allData.find((r) => r.criterion === criterion);
              if (!row) {
                row = { criterion, scores: {} };
                allData.push(row);
              }
              row.scores[iid] = scoreValue;
            });

            FINAL_ITEMS.forEach(({ key }) => {
              const value = qldata[key];
              if (value !== undefined) {
                let row = allData.find((r) => r.criterion === key);
                if (!row) {
                  row = { criterion: key, scores: {} };
                  allData.push(row);
                }
                row.scores[iid] = value;
              }
            });
          }
        }

        setRows(allData);
      } catch (err) {
        console.error(err);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [candidateId, stages, interviewerIds]);

  const renderTable = (filtered: CriterionRow[], title: string) => (
    <>
      <h4 className="ria-section-title">{title}</h4>
      <table className="ria-score-table">
        <thead>
          <tr>
            <th className="ria-criterion-col">評価観点</th>
            <th className="ria-score-col">面接官別スコア（異常値を検出）</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={2} className="ria-text-center">読み込み中...</td></tr>
          ) : filtered.length === 0 ? (
            <tr><td colSpan={2} className="ria-text-center">データがありません</td></tr>
          ) : (
            filtered.map((row, idx) => {
              const label = labelMap[row.criterion] ?? row.criterion;
              const values = Object.values(row.scores).filter(v => typeof v === 'number') as number[];
              const strings = Object.values(row.scores).filter(v => typeof v === 'string') as string[];
              let isAnomalyMap: Record<string, boolean> = {};

              if (values.length) {
                const sorted = [...values].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                const threshold = 2;
                Object.entries(row.scores).forEach(([iid, score]) => {
                  if (typeof score === 'number') {
                    isAnomalyMap[iid] = Math.abs(score - median) >= threshold;
                  }
                });
              } else if (strings.length) {
                const freq = strings.reduce<Record<string, number>>((acc, s) => {
                  acc[s] = (acc[s] || 0) + 1;
                  return acc;
                }, {});
                const maxCount = Math.max(...Object.values(freq));
                const majority = Object.entries(freq).find(([, count]) => count === maxCount)?.[0];
                Object.entries(row.scores).forEach(([iid, score]) => {
                  if (typeof score === 'string') {
                    isAnomalyMap[iid] = score !== majority;
                  }
                });
              }

              return (
                <tr key={idx}>
                  <td className="ria-criterion-col">{label}</td>
                  <td className="ria-score-col">
                    <div className="ria-score-container">
                      {interviewerIds.map((iid) => {
                        const score = row.scores[iid];
                        const isAnomaly = isAnomalyMap[iid];
                        const rel = reliability[iid];
                        return (
                          <span key={iid} className={`ria-score-chip ${isAnomaly ? "anomaly" : ""}`}>
                            {iid}: {score ?? "-"}
                            {typeof rel === "number" && (
                              <span className="ria-score-reliability">信: {rel.toFixed(2)}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </>
  );

  const quantRows = rows.filter(r => QUANT_KEYS.has(r.criterion));
  const finalRows = rows.filter(r => FINAL_ITEMS.map(f => f.key).includes(r.criterion));

  return (
    <div className="ria-container">
      {renderTable(quantRows, '定量評価スコア')}
      {renderTable(finalRows, '最終評価スコア')}
    </div>
  );
};

export default ResumeInterviewerAnomalyScore;