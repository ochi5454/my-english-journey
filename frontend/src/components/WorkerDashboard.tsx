import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./WorkerDashboard.css";

type Worker = {
  name: string;
  avatar: string;
  role: string;
  team: string;
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type TrainingRecommendation = {
  training_id: number;
  training_title: string;
  recommended_users: {
    name: string;
    reason: string;
  }[];
};

export default function WorkerDashboard() {
  const [people, setPeople] = useState<Worker[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [trainings, setTrainings] = useState<TrainingRecommendation[]>([]);  

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

    fetch("/api/trainingsRecommend?gap=1.2&rel=0.7")
      .then((res) => {
        if (!res.ok) throw new Error("トレーニング推薦API取得エラー");
        return res.json();
      })
      .then((data: { [workerId: string]: TrainingRecommendation[] }) => {
        const trainingMap: { [id: number]: TrainingRecommendation } = {};

        Object.values(data).flat().forEach((rec) => {
          const existing = trainingMap[rec.training_id];
          if (existing) {
            // すでに存在する場合は recommended_users を追加でマージ
            existing.recommended_users.push(...rec.recommended_users);
          } else {
            trainingMap[rec.training_id] = { ...rec, recommended_users: [...rec.recommended_users] };
          }
        });

        const mergedTrainings = Object.values(trainingMap);
        console.log("マージ後のトレーニング一覧:", mergedTrainings);
        setTrainings(mergedTrainings);
      })
      .catch((err) => {
        console.error("トレーニング推薦データ取得失敗:", err);
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
          <h2 className="card-title">研修と推奨対象者</h2>
          <div className="card-content">

            {trainings.length === 0 ? (
              <p className="no-recommendation">推奨される研修はまだありません</p>
            ) : (
              <table className="skill-gap-table">
                <thead>
                  <tr>
                    <th className="col-training">研修タイトル</th>
                    <th className="col-users">推奨対象者</th>
                  </tr>
                </thead>
                <tbody>
                  {trainings.map((training, idx) => (
                    <tr key={idx}>
                      <td>📘 {training.training_title}</td>
                      <td>
                        {Array.isArray(training.recommended_users) && training.recommended_users.length > 0 ? (
                          training.recommended_users.map((user, i) => (
                            <span key={i} className="recommended-name">{user.name}</span>
                          ))
                        ) : (
                          <span className="no-recommendation">対象者なし</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
