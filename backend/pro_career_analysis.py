"""
育成年代の所属チームとプロ到達率・キャリア年数の相関を集計・可視化するスクリプト
前提: VS Code 上で実行 / CSV を同ディレクトリに配置
入力:
  - players.csv: player_id, birth_date, position, dominant_foot
  - team_history.csv: player_id, team_id, team_category, start_date, end_date
  - pro_status.csv: player_id, pro_reached, pro_start_age, pro_end_age
出力:
  - agg_ageband_teamcategory.csv
  - heatmap_pro_rate.png
  - heatmap_career_years.png
"""

import pandas as pd
import numpy as np
import seaborn as sns
import matplotlib.pyplot as plt


def load_data(
    players_path: str = "players.csv",
    teams_path: str = "team_history.csv",
    pro_path: str = "pro_status.csv",
):
    players = pd.read_csv(players_path)
    teams = pd.read_csv(teams_path)
    pro = pd.read_csv(pro_path)

    teams["start_date"] = pd.to_datetime(teams["start_date"])
    teams["end_date"] = pd.to_datetime(teams["end_date"])
    players["birth_date"] = pd.to_datetime(players["birth_date"])
    return players, teams, pro


def calc_age(row, col):
    return (row[col] - row["birth_date"]).days / 365.25


def add_team_features(players: pd.DataFrame, teams: pd.DataFrame) -> pd.DataFrame:
    teams = teams.merge(players[["player_id", "birth_date"]], on="player_id", how="left")
    teams["start_age"] = teams.apply(lambda r: calc_age(r, "start_date"), axis=1)
    teams["end_age"] = teams.apply(lambda r: calc_age(r, "end_date"), axis=1)
    teams["tenure_years"] = teams["end_age"] - teams["start_age"]

    def age_band(age):
        if age < 12:
            return "U12"
        if age < 15:
            return "U15"
        if age < 18:
            return "U18"
        if age < 23:
            return "U23"
        return "Senior"

    teams["age_band"] = teams["start_age"].apply(age_band)
    return teams


def add_pro_features(pro: pd.DataFrame) -> pd.DataFrame:
    pro = pro.copy()
    pro["career_years"] = pro["pro_end_age"] - pro["pro_start_age"]
    return pro


def aggregate(df: pd.DataFrame) -> pd.DataFrame:
    group_cols = ["age_band", "team_category"]
    agg = (
        df.groupby(group_cols)
        .apply(
            lambda g: pd.Series(
                {
                    "players": g["player_id"].nunique(),
                    "pro_reached_rate": g["pro_reached"].fillna(0).mean(),
                    "avg_career_years": g.loc[g["pro_reached"] == 1, "career_years"].mean(),
                }
            )
        )
        .reset_index()
    )
    return agg


def visualize(agg: pd.DataFrame):
    pivot_rate = agg.pivot(index="age_band", columns="team_category", values="pro_reached_rate")
    pivot_career = agg.pivot(index="age_band", columns="team_category", values="avg_career_years")

    plt.figure(figsize=(8, 5))
    sns.heatmap(pivot_rate, annot=True, fmt=".2f", cmap="Blues")
    plt.title("年齢帯 × チームカテゴリのプロ到達率")
    plt.tight_layout()
    plt.savefig("heatmap_pro_rate.png")

    plt.figure(figsize=(8, 5))
    sns.heatmap(pivot_career, annot=True, fmt=".2f", cmap="Oranges")
    plt.title("年齢帯 × チームカテゴリの平均キャリア年数")
    plt.tight_layout()
    plt.savefig("heatmap_career_years.png")


def summarize(agg: pd.DataFrame):
    summary = []
    for _, row in agg.sort_values("pro_reached_rate", ascending=False).iterrows():
        summary.append(
            f"{row['age_band']}×{row['team_category']}: 到達率={row['pro_reached_rate']:.2f}, "
            f"平均キャリア={row['avg_career_years']:.2f}"
        )
    print("特徴サマリ:")
    for s in summary:
        print(" -", s)
    print("\n注意: 相関は因果ではありません。年齢帯・在籍期間・カテゴリを考慮して解釈してください。")


def main():
    players, teams, pro = load_data()
    teams = add_team_features(players, teams)
    pro = add_pro_features(pro)
    df = teams.merge(pro, on="player_id", how="left")

    agg = aggregate(df)
    agg.to_csv("agg_ageband_teamcategory.csv", index=False)

    visualize(agg)
    summarize(agg)


if __name__ == "__main__":
    main()
