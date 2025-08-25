import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./WorkerDashboard.css";

type Worker = {
  name: string;
  avatar: string;
  role: string;
  team: string;
  score: number;
  tags: string[];
};

type Report = {
  type: string;
  reporter: string;
  target: string;
  summary: string;
  status: string;
  timestamp: string;
};

export default function WorkerDashboard() {
  const [people, setPeople] = useState<Worker[]>([]);
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    fetch("/api/workers")
      .then((res) => {
        if (!res.ok) throw new Error("API取得エラー");
        return res.json();
      })
      .then((data) => {
        const parsed: Worker[] = data.map((p: any) => ({
          ...p,
          tags: p.tags,
        }));
        setPeople(parsed);
      })
      .catch((err) => {
        console.error("データ取得に失敗:", err);
      });

    fetch("/api/reports")
      .then((res) => {
        if (!res.ok) throw new Error("通報API取得エラー");
        return res.json();
      })
      .then((data) => {
        setReports(data);
      })
      .catch((err) => {
        console.error("通報データ取得失敗:", err);
      });

  }, []);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1 className="dashboard-title">モニタリング</h1>
        <p className="dashboard-subtitle">AIで最適なチーム編成を支援する統合プラットフォーム</p>
      </header>

      <div className="dashboard-grid">
        {/* 個人一覧 */}
        <section id="section-persons" className="dashboard-card">
          <h2 className="card-title">個人一覧</h2>
          
          <div className="card-content">
            <table className="person-table adjusted-person-table">
              <thead>
                <tr>
                  <th className="col-avatar">写真</th>
                  <th className="col-name">名前</th>
                  <th className="col-role">役職</th>
                  <th className="col-team">店舗</th>
                  <th className="col-score">スコア</th>
                  <th className="col-tags">タグ</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person, idx) => (
                  <tr key={idx}>
                    <td><img src={person.avatar} alt={person.name} className="avatar-small" /></td>
                    <td>
                      <Link to={`/person/${person.name}`} className="name-link">
                        {person.name}
                      </Link>
                    </td>
                    <td>{person.role}</td>
                    <td>{person.team}</td>
                    <td>{person.score}</td>
                    <td>
                      {person.tags.map((tag, i) => (
                        <span key={i} className="tag-chip">{tag}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 通報・評価モニター */}
        <section id="section-reports" className="dashboard-card">
          <h2 className="card-title">通報・評価モニター</h2>

          <div className="card-content space-y-4">
            {reports.map((report, idx) => (
              <div key={idx} className="report-box">
                <div className="report-header">
                  <span>{report.type}（{report.reporter} → {report.target}）</span>
                  <span>{report.timestamp}</span>
                </div>
                <p className="report-summary">{report.summary}</p>
                <span className={`report-status ${
                  report.status === '対応中' ? 'status-pending' : 'status-done'
                }`}>
                  {report.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* チーム構成提案 */}
        <section id="section-team" className="dashboard-card highlight-section">
          <h2 className="card-title">チーム構成提案</h2>
          

          <div className="card-content space-y-4">
            <div className="team-suggestion-box">
              <h3 className="team-role-title">秋のセールキャンペーン チーム構成案</h3>
              <ul className="team-role-list">
                <li><strong>店舗統括リーダー候補:</strong> 山田 花子（経験: 3年 / 店長評価: A）</li>
                <li><strong>販促担当:</strong> 鈴木 太郎（接客スコア: 88 / 顧客満足度高）</li>
                <li><strong>在庫・ロジ担当:</strong> （未推薦）※倉庫経験者が不足</li>
              </ul>
              <p className="ai-reasoning">
                ✅ <strong>推薦理由:</strong> 花子は前年のセール業務で全体を仕切り成功実績あり。<br />
                ✏️ <strong>OJT視点:</strong> 鈴木は接客力が高く、新人育成との兼任も期待。<br />
                📊 <strong>類似事例:</strong> 2023年夏フェア時の売上向上に貢献した構成と類似。
              </p>
            </div>
          </div>
        </section>

        {/* スキルギャップ一覧 */}
        <section id="section-skills" className="dashboard-card highlight-section">
          <h2 className="card-title">スキルギャップ一覧</h2>
          

          <div className="card-content grid gap-4">
            <div className="skill-gap-box">
              <h3 className="skill-person">山田 花子（店舗マネージャー）</h3>
              <ul className="skill-gap-list">
                <li><strong>ギャップ:</strong> データ分析スキル（要: 基礎レベル）</li>
                <li><strong>推奨研修:</strong> 社内研修「売上データと在庫分析入門」</li>
                <li><strong>外部学習:</strong> YouTube講座「Excelでできる販売分析」</li>
              </ul>
              <p className="ai-career-suggestion">
                📈 <strong>キャリア提案:</strong> 売上予測や発注計画を任せることで、将来的に複数店舗の統括へと成長可能。
              </p>
            </div>

            <div className="skill-gap-box">
              <h3 className="skill-person">鈴木 太郎（販売スタッフ）</h3>
              <ul className="skill-gap-list">
                <li><strong>ギャップ:</strong> 商品管理システムの運用経験</li>
                <li><strong>推奨研修:</strong> 社内システム研修「棚卸と発注の基礎」</li>
                <li><strong>外部学習:</strong> 無料eラーニング「流通業のIT活用講座」</li>
              </ul>
              <p className="ai-career-suggestion">
                📦 <strong>キャリア提案:</strong> バックヤード管理の強化により、将来的な副店長・在庫管理責任者候補に適任。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
