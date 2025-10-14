import React from "react";
import { formatDate } from "./format";

interface Props {
    localResult: any;
}

const ScoreDetail: React.FC<Props> = ({ localResult }) => {
    return (
        <div className="result-d-detail-left">
        <h3>スコア</h3>

        {/* ✅ マスト要件チェック */}
        <h4>マスト要件チェック:</h4>
        <ul>
            {localResult.must_check &&
            Object.entries(localResult.must_check).map(([key, val]: any) => (
                <li key={key} style={{ color: val.result ? "green" : "red" }}>
                {key}: {val.result ? "✅" : "❌"} - {val.reason}
                </li>
            ))}
        </ul>

        {/* ✅ 部門別スコア */}
        <h4>部門別スコア評価:</h4>
        {localResult.scores?.map((s: any) => {
            // 履歴が配列でない場合
            if (!Array.isArray(s.score_history))
            return (
                <div key={s.division} className="result-d-score-item">
                <p>
                    <strong>{s.division}</strong>: {s.score}点
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
                <strong>{s.division}</strong>:</p>

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
    );
};

export default ScoreDetail;