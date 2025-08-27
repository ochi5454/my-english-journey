// WorkerDetail.tsx
import { useEffect, useState } from "react";
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
  score_self_motivation_fit?: number;
  score_workstyle_relationships?: number;
  score_communication?: number;
  score_leadership?: number;
  score_logical_thinking?: number;
  score_execution?: number;
  score_expertise?: number;
  score_biz_org_dev?: number;
};

type Worker = {
  id: number;
  name: string;
  avatar: string;
  role: string;
  team: string;
  tags: string[];
  level: number;
  score_self_motivation_fit?: number;
  score_workstyle_relationships?: number;
  score_communication?: number;
  score_leadership?: number;
  score_logical_thinking?: number;
  score_execution?: number;
  score_expertise?: number;
  score_biz_org_dev?: number;
};

export default function WorkerDetail() {
  const { name } = useParams();
  const [reports, setReports] = useState<Report[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // 他者評価の平均
  function average(values: number[]) {
    if (values.length === 0) return 0;
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  }

  // 他者評価の中央値
  function median(values: number[]) {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2)
      : sorted[mid].toFixed(2);
  }

  // 他者評価のギャップ
  const calcGap = (selfVal: number, others: number[]): string => {
    if (!others.length) return "-";
    const avg = others.reduce((a, b) => a + b, 0) / others.length;
    const gap = (selfVal - avg).toFixed(2);
    return Math.abs(Number(gap)) >= 1 ? `⚠️ ${gap}` : gap;
  };

  // 評価値によって色分けクラスを返す
  function scoreClass(value: number | undefined): string {
    if (value == null) return "";
    if (value >= 4.5) return "score-high"; // 高評価 → 青
    if (value <= 2.5) return "score-low";  // 低評価 → 赤
    return "";
  }

  return (
    <div className="detail-layout">

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
            <>
              <img
                src={targetWorker.avatar}
                alt={targetWorker.name}
                className="avatar-large"
              />
              <div className="worker-chip">
                {targetWorker.name}（{targetWorker.role}）
              </div>
            </>
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
      <div className="score-summary-table">
        <h3>定量評価サマリ（5段階評価）</h3>
        <table>
          <thead>
            <tr>
              <th>観点</th>
              <th>本人</th>
              <th>上司</th>
              <th>部下</th>
              <th>同僚</th>
              <th>ギャップ</th>
            </tr>
          </thead>
          <tbody>
            {[
              { key: "score_self_motivation_fit", label: "自己管理・モチベ・文化適合性" },
              { key: "score_workstyle_relationships", label: "ワークスタイル・関係性" },
              { key: "score_communication", label: "コミュニケーション" },
              { key: "score_leadership", label: "リーダーシップ" },
              { key: "score_logical_thinking", label: "論理的思考力" },
              { key: "score_execution", label: "作業・PJ管理" },
              { key: "score_expertise", label: "専門性" },
              { key: "score_biz_org_dev", label: "ビジネス＆組織開発" }
            ].map(({ key, label }) => {
              const upperVals = upper.map(r => r[key as keyof Report]).filter(v => v != null) as number[];
              const lowerVals = lower.map(r => r[key as keyof Report]).filter(v => v != null) as number[];
              const peerVals = peers.map(r => r[key as keyof Report]).filter(v => v != null) as number[];
              const rawSelfVal = targetWorker?.[key as keyof Worker];
              const selfVal = typeof rawSelfVal === "number" ? rawSelfVal : undefined;
              const gap = selfVal !== undefined
                ? calcGap(selfVal, [...upperVals, ...lowerVals, ...peerVals])
                : "-";

              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td className={scoreClass(selfVal)}>{selfVal ?? "-"}</td>
                  <td className={scoreClass(Number(average(upperVals)))}>{upperVals.length ? `${average(upperVals)}（中央値: ${median(upperVals)}）` : "-"}</td>
                  <td className={scoreClass(Number(average(lowerVals)))}>{lowerVals.length ? `${average(lowerVals)}（中央値: ${median(lowerVals)}）` : "-"}</td>
                  <td className={scoreClass(Number(average(peerVals)))}>{peerVals.length ? `${average(peerVals)}（中央値: ${median(peerVals)}）` : "-"}</td>
                  <td>{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
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