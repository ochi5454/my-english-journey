import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "journey.db")


def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS study_records (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                date        DATE NOT NULL,
                category    TEXT NOT NULL CHECK(category IN ('基礎', '運用')),
                subcategory TEXT NOT NULL,
                minutes     INTEGER NOT NULL CHECK(minutes > 0),
                note        TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS study_goals (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                category     TEXT NOT NULL UNIQUE CHECK(category IN ('基礎', '運用')),
                target_hours INTEGER NOT NULL CHECK(target_hours > 0),
                updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS study_subcategory_goals (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                category      TEXT NOT NULL,
                subcategory   TEXT NOT NULL,
                target_hours  INTEGER NOT NULL CHECK(target_hours > 0),
                updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(category, subcategory)
            );

            CREATE TABLE IF NOT EXISTS study_definitions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                key        TEXT NOT NULL UNIQUE,
                content    TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 初期目標データ
            INSERT OR IGNORE INTO study_goals (category, target_hours) VALUES ('基礎', 500);
            INSERT OR IGNORE INTO study_goals (category, target_hours) VALUES ('運用', 800);

            -- サブカテゴリ目標の初期値
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('基礎', '発音', 50);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('基礎', '単語', 200);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('基礎', '文法', 250);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('運用', 'スピーキング', 400);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('運用', 'リスニング', 200);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('運用', 'リーディング', 100);
            INSERT OR IGNORE INTO study_subcategory_goals (category, subcategory, target_hours) VALUES ('運用', 'ライティング', 100);

            -- 定義の初期値
            INSERT OR IGNORE INTO study_definitions (key, content) VALUES ('qualitative', '自分の意見を正確に伝えることができ、かつ相手が話す内容を明確に理解できること。');
            INSERT OR IGNORE INTO study_definitions (key, content) VALUES ('quantitative', 'IELTS 7.0/9.0 以上
TOEFL iBT 90/120 以上');
        """)
