import React, { useEffect, useState } from "react";
import './ResumeInterviewerAnomalyScore.css';
import axios from "axios";
import type { ConfigResponse } from "./ResumeInterviewCheckSheet";
import appConfig from '../config.ts';

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

const FINAL_ITEM_KEYS = ["hiringDecision", "recommendedDivision", "recommendedTitle"];

const ResumeInterviewerAnomalyScore: React.FC<Props> = ({ candidateId, stages, interviewerIds, reliability }) => {
  const [rows, setRows] = useState<CriterionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<ConfigResponse | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await axios.get<ConfigResponse>(`${appConfig.API_BASE_URL}/checksheet/config`);
        setConfig(res.data);
      } catch (err) {
        console.error("設定の取得に失敗しました", err);
      }
    };

    fetchConfig();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const allData: CriterionRow[] = [];

        for (const stage of stages) {
          for (const iid of interviewerIds) {
            const res = await axios.get(`${appConfig.API_BASE_URL}/checksheet/one?interviewer_id=${encodeURIComponent(iid)}&candidate_id=${encodeURIComponent(candidateId)}&stage=${encodeURIComponent(stage)}`);
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

            FINAL_ITEM_KEYS.forEach((key) => {
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

    if (config) fetchData();
  }, [candidateId, stages, interviewerIds, config]);

  const labelMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    config?.quantitativeItems.forEach(item => {
      map[item.key] = item.label;
    });
    FINAL_ITEM_KEYS.forEach(key => {
      const match = config?.hiringDecisions?.find(d => d.value === key) ||
                    config?.divisions?.includes(key) ||
                    config?.titleOptions?.find(t => t.value === key);
      if (typeof match === "string") map[key] = key; // for divisions
    });
    map["hiringDecision"] = "採用可否";
    map["recommendedDivision"] = "推奨部門";
    map["recommendedTitle"] = "推奨タイトル";
    return map;
  }, [config]);

  const quantKeys = React.useMemo(() => new Set(config?.quantitativeItems.map(i => i.key)), [config]);

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
                // 多数決が存在する場合のみ anomaly 判定
                if (maxCount >= 2) {
                  const majority = Object.entries(freq).find(([, count]) => count === maxCount)?.[0];
                  Object.entries(row.scores).forEach(([iid, score]) => {
                    if (typeof score === 'string') {
                      isAnomalyMap[iid] = score !== majority;
                    }
                  });
                } else {
                  // maxCount === 1 → 全員バラバラ（票が割れている）→ 異常値扱いしない
                  Object.keys(row.scores).forEach(iid => {
                    isAnomalyMap[iid] = false;
                  });
                }
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

  const quantRows = rows.filter(r => quantKeys.has(r.criterion));
  const finalRows = rows.filter(r => FINAL_ITEM_KEYS.includes(r.criterion));

  return (
    <div className="ria-container">
      {renderTable(quantRows, '定量評価スコア')}
      {renderTable(finalRows, '最終評価スコア')}
    </div>
  );
};

export default ResumeInterviewerAnomalyScore;
