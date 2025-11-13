import React from "react";
import { formatDate } from "../Utils/format";

interface Props {
    localResult: any;
    prefixToName: Record<string, string>;
}

const ScoreDetailV2: React.FC<Props> = ({ localResult, prefixToName }) => {
    console.log("🟡 ScoreDetailV2 localResult:", localResult);
    return (
        <div className="result-d-detail-left">

            <h3>候補者情報</h3>

            {/* ✅ 志望動機サマリ */}
            <div className="detail-section-box">
                <h4>🧭 志望動機サマリ</h4>
                <p className="summary-text">
                    {localResult.notes
                        ? localResult.notes
                        : "（志望動機サマリは登録されていません）"}
                </p>
            </div>

            {/* ✅ 職務経歴サマリ */}
            <div className="detail-section-box">
                <h4>💼 職務経歴サマリ</h4>
                <p className="summary-text">
                    {localResult.work_summary
                        ? localResult.work_summary
                        : "（職務経歴サマリは登録されていません）"}
                </p>
            </div>

            {/* ✅ 必須要件チェック */}
            <div className="detail-section-box">
                <h4>☑️ 必須要件</h4>
                <ul className="must-check-list">
                    {localResult.must_check &&
                        Object.entries(localResult.must_check).map(([key, val]: any) => (
                        <li key={key} className={val.result ? "green" : "red"}>
                            {val.result ? "✅" : "❌"} <strong>{key}</strong>: {val.reason}
                        </li>
                    ))}
                </ul>
            </div>

            {/* ✅ 部門別スコア */}
            <div className="detail-section-box">
                <h4>🎯 部門別スコア</h4>
                    {localResult.scores?.map((s: any) => {
                        console.log("🟡 ScoreDetailV2 localResult:", localResult);
                        const divisionName = prefixToName[s.division] || s.division;

                        // 履歴が配列でない場合
                        if (!Array.isArray(s.score_history))
                        return (
                            <div key={s.division} className="result-d-score-item">
                            <p>
                                <strong>{divisionName}</strong>: {s.score}点
                            </p>
                            <p style={{ fontSize: "0.9em", color: "#666" }}>{s.reason}</p>
                            </div>
                        );

                        // 最新スコアに対応する履歴を特定
                        const latestEntry = [...s.score_history].reverse().find(
                        (entry) =>
                            entry.score === s.score && entry.reason === s.reason
                        );

                        return (
                        <div key={s.division} className="result-d-score-item">
                            <p>
                            <strong>{divisionName}</strong>:</p>

                            {/* 最新スコア */}
                            <div style={{ marginBottom: "10px" }}>
                            <span>最新スコア: {s.score}点</span><br />
                            <span style={{ fontSize: "0.9em", color: "#666" }}>
                                理由: {s.reason}
                            </span>
                            <br />
                            {latestEntry && (
                                <span style={{ fontSize: "0.8em", color: "#999" }}>
                                by {latestEntry.reviewer || latestEntry.updated_by} at{" "}
                                {formatDate(latestEntry.reviewed_at || latestEntry.updated_at)}
                                </span>
                            )}
                            </div>

                            {/* スコア履歴 */}
                            <div>
                            <h5 style={{ marginBottom: "4px" }}>📜 スコア履歴:</h5>
                            {[...s.score_history]
                                .reverse()
                                .filter(
                                (entry) =>
                                    !(
                                    entry.score === latestEntry?.score &&
                                    entry.reason === latestEntry?.reason &&
                                    (entry.reviewed_at === latestEntry?.reviewed_at ||
                                        entry.updated_at === latestEntry?.updated_at)
                                    )
                                )
                                .map((entry: any, idx: number) => (
                                <div
                                    key={idx}
                                    style={{
                                    paddingLeft: "10px",
                                    borderLeft: "2px solid #ccc",
                                    marginBottom: "5px",
                                    }}
                                >
                                    <p style={{ margin: 0 }}>
                                    <span
                                        style={{
                                        textDecoration: "line-through",
                                        color: "gray",
                                        }}
                                    >
                                        {entry.score}点
                                    </span>
                                    <br />
                                    <span style={{ fontSize: "0.9em" }}>
                                        理由: {entry.reason}
                                    </span>
                                    <br />
                                    <span style={{ fontSize: "0.8em", color: "#999" }}>
                                        by {entry.reviewer || entry.updated_by} at{" "}
                                        {formatDate(entry.reviewed_at || entry.updated_at)}
                                    </span>
                                    </p>
                                </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ScoreDetailV2;
