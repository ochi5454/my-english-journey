// WorkerDetail.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./WorkerDetail.css";

type Report = {
  type: string;
  reporter: string;
  reporter_id?: number;
  target: string;
  target_id?: number;
  summary: string;
  status: string;
  timestamp: string;
  reporter_role?: "上位" | "下位" | "同僚";
};

type Worker = {
  id: number;
  name: string;
  avatar: string;
  role: string;
  team: string;
  score: number;
  tags: string[];
  level: number;
};

export default function WorkerDetail() {
  const { name } = useParams();
  const [reports, setReports] = useState<Report[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [targetWorker, setTargetWorker] = useState<Worker | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/workers").then((res) => res.json()),
      fetch("/api/reports").then((res) => res.json()),
    ]).then(([workers, reportData]) => {
      setWorkers(workers);
      const target = workers.find((w: Worker) => w.name === name) || null;
      setTargetWorker(target);

      const enriched = reportData
        .filter((r: Report) => r.target === name)
        .map((r: Report) => {
          const reporter = workers.find((w: Worker) => w.id === Number(r.reporter_id));
          const target = workers.find((w: Worker) => w.id === Number(r.target_id));

          const relation: "上位" | "下位" | "同僚" =
            reporter && target && reporter.level != null && target.level != null
              ? reporter.level < target.level
                ? "上位"
                : reporter.level > target.level
                ? "下位"
                : "同僚"
              : "同僚";

          return { ...r, reporter_role: relation };
        });

      setReports(enriched);
    });
  }, [name]);

  if (!targetWorker) return <div>読み込み中...</div>;

  const upper: Report[] = [];
  const lower: Report[] = [];
  const peers: Report[] = [];
  const anonymous: Report[] = [];

  for (const r of reports) {
    if (!r.reporter_id) {
      anonymous.push(r);
    } else {
      if (r.reporter_role === "上位") upper.push(r);
      else if (r.reporter_role === "下位") lower.push(r);
      else peers.push(r);
    }
  }

  return (
    <div className="detail-layout">
      <h2 className="detail-title">{name} さんの詳細</h2>

      <div className="report-layout-grid">
        {/* 上位評価 */}
        <div className="report-zone upper">
          {upper.map((r, idx) => (
            <ReportBox key={`u-${idx}`} report={r} position="upper" />
          ))}
        </div>

        {/* 左側：同僚 */}
        <div className="report-zone peer">
          {peers.map((r, idx) => (
            <ReportBox key={`p-${idx}`} report={r} position="peer" />
          ))}
        </div>

        {/* 中央アバター */}
        <div className="avatar-center">
          {targetWorker && (
            <img
              src={targetWorker.avatar}
              alt={targetWorker.name}
              className="avatar-large"
            />
          )}
        </div>

        {/* 匿名レポート（右側） */}
        <div className="report-zone anonymous">
          {anonymous.map((r, idx) => (
            <ReportBox key={`a-${idx}`} report={r} position="anonymous" />
          ))}
        </div>

        {/* 下位評価 */}
        <div className="report-zone lower">
            {lower.map((r, idx) => (
              <ReportBox key={`l-${idx}`} report={r} position="lower" />
            ))}
        </div>
      </div>
    </div>
  );
}

function ReportBox({ report, position }: { report: Report; position: 'upper' | 'lower' | 'peer' | 'anonymous' }) {
  return (
    <div className={`report-box ${position}`}>
      <div className="report-type">{report.type}</div>
      <div className="report-summary">{report.summary}</div>
      <div className="report-meta">
        {report.reporter} → {report.target}（{report.timestamp}）
      </div>
      <span
        className={`report-status ${
          report.status === "対応中" ? "status-pending" : "status-done"
        }`}
      >
        {report.status}
      </span>
    </div>
  );
}