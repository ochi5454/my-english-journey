import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random


def generate_dummy_data(
    n_players=300,
    birth_year_range=(1995, 2008),
    positions=("GK", "DF", "MF", "FW"),
    dominant_feet=("右", "左"),
    team_categories=("街クラブ", "強豪クラブ", "アカデミー", "高校", "ユース"),
    min_teams_per_player=2,
    max_teams_per_player=4,
    min_start_age=6,
    max_start_age=18,
    min_tenure_years=0.5,
    max_tenure_years=4.0,
    career_years_range=(1, 15),
    seed=42,
):
    rng = np.random.default_rng(seed)
    random.seed(seed)

    # ① 選手マスタ
    player_ids = np.arange(1, n_players + 1)
    birth_years = rng.integers(birth_year_range[0], birth_year_range[1] + 1, size=n_players)
    birth_dates = []
    for y in birth_years:
        # ランダムな日付（1〜365日目）
        day_of_year = rng.integers(1, 366)
        birth_dates.append((datetime(y, 1, 1) + timedelta(days=int(day_of_year - 1))).date())

    positions_arr = rng.choice(positions, size=n_players)
    feet_arr = rng.choice(dominant_feet, size[n_players])

    players_df = pd.DataFrame(
        {
            "player_id": player_ids,
            "birth_date": birth_dates,
            "position": positions_arr,
            "dominant_foot": feet_arr,
        }
    )

    # ② 所属チーム履歴
    histories = []
    team_counter = 1

    # プロ到達確率をカテゴリ別に設定（例：アカデミー・ユース高め）
    pro_prob_map = {
        "街クラブ": 0.15,
        "強豪クラブ": 0.25,
        "アカデミー": 0.45,
        "高校": 0.20,
        "ユース": 0.40,
    }

    # ③ プロ到達・キャリア情報
    pro_records = []

    for pid, bdate in zip(player_ids, birth_dates):
        n_teams = rng.integers(min_teams_per_player, max_teams_per_player + 1)
        start_age = rng.uniform(min_start_age, max_start_age)
        current_date = datetime(bdate.year, bdate.month, bdate.day) + timedelta(days=int(start_age * 365.25))

        # 各チーム在籍
        categories_for_player = rng.choice(team_categories, size=n_teams)
        for cat in categories_for_player:
            tenure_years = rng.uniform(min_tenure_years, max_tenure_years)
            start_date = current_date.date()
            end_date = (current_date + timedelta(days=int(tenure_years * 365.25))).date()

            histories.append(
                {
                    "player_id": pid,
                    "team_id": team_counter,
                    "team_category": cat,
                    "start_date": start_date,
                    "end_date": end_date,
                }
            )
            team_counter += 1
            current_date += timedelta(days=int(tenure_years * 365.25))

        # プロ到達判定（所属カテゴリの平均で確率を決定）
        probs = [pro_prob_map.get(c, 0.2) for c in categories_for_player]
        reach_prob = np.mean(probs) if probs else 0.2
        pro_reached = rng.random() < reach_prob

        if pro_reached:
            career_len = rng.integers(career_years_range[0], career_years_range[1] + 1)
            # プロ開始年齢は最後の在籍終了後付近からランダム
            pro_start_age = max(start_age, rng.uniform(16, 23))
            pro_end_age = pro_start_age + career_len
        else:
            pro_start_age = np.nan
            pro_end_age = np.nan

        pro_records.append(
            {
                "player_id": pid,
                "pro_reached": int(pro_reached),
                "pro_start_age": pro_start_age,
                "pro_end_age": pro_end_age,
            }
        )

    histories_df = pd.DataFrame(histories)
    pro_df = pd.DataFrame(pro_records)

    return players_df, histories_df, pro_df


def main():
    players_df, histories_df, pro_df = generate_dummy_data()

    # CSV出力
    players_df.to_csv("players.csv", index=False)
    histories_df.to_csv("team_histories.csv", index=False)
    pro_df.to_csv("pro_info.csv", index=False)

    print(players_df.head())
    print(histories_df.head())
    print(pro_df.head())


if __name__ == "__main__":
    main()
