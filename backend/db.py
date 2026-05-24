"""
SQLite 数据库 — 用户偏好 / 行程历史 / 倒数日
Python 自带 sqlite3，无需安装
"""
import sqlite3
import json
import os
from datetime import datetime, date

DB_PATH = os.path.join(os.path.dirname(__file__), "travel.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """建表，只跑一次"""
    conn = get_db()
    conn.executescript("""
        -- 用户偏好：记住你俩的喜好
        CREATE TABLE IF NOT EXISTS user_prefs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,      -- 字段名，如 'pace', 'budget'
            value TEXT NOT NULL,           -- 值，如 '综合', '2500'
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- 行程历史：每次生成的完整记录
        CREATE TABLE IF NOT EXISTS trip_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            origin TEXT,
            destination TEXT NOT NULL,
            start_date TEXT,
            days INTEGER,
            budget INTEGER,
            pace TEXT,
            preferences TEXT,
            plan TEXT NOT NULL,             -- 完整行程内容
            image_url TEXT,                 -- AI 生成的风景图
            created_at TEXT DEFAULT (datetime('now'))
        );

        -- 倒数日：关注即将出发的旅行
        CREATE TABLE IF NOT EXISTS countdowns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            destination TEXT NOT NULL,
            departure_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()

# ============================================================
# 偏好操作
# ============================================================
def save_prefs(prefs: dict):
    """保存偏好，key-value 逐个写入"""
    conn = get_db()
    for k, v in prefs.items():
        conn.execute(
            "INSERT OR REPLACE INTO user_prefs (key, value, updated_at) VALUES (?, ?, datetime('now'))",
            (k, str(v))
        )
    conn.commit()
    conn.close()

def load_prefs() -> dict:
    """读取所有偏好"""
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM user_prefs").fetchall()
    conn.close()
    return {r["key"]: r["value"] for r in rows}

# ============================================================
# 行程历史操作
# ============================================================
def save_trip(origin, destination, start_date, days, budget, pace, preferences, plan, image_url=None):
    """保存一次行程"""
    conn = get_db()
    conn.execute(
        """INSERT INTO trip_history (origin, destination, start_date, days, budget, pace, preferences, plan, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (origin, destination, start_date, days, budget, pace, preferences, plan, image_url)
    )
    conn.commit()
    conn.close()

def list_trips(limit=20):
    """列出最近的行程"""
    conn = get_db()
    rows = conn.execute(
        "SELECT id, destination, start_date, days, budget, pace, created_at FROM trip_history ORDER BY id DESC LIMIT ?",
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_trip(trip_id):
    """获取单次行程详情"""
    conn = get_db()
    row = conn.execute("SELECT * FROM trip_history WHERE id=?", (trip_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_history(trip_id):
    """删除一条行程记录"""
    conn = get_db()
    conn.execute("DELETE FROM trip_history WHERE id=?", (trip_id,))
    conn.commit()
    conn.close()

# ============================================================
# 倒数日操作
# ============================================================
def add_countdown(destination, departure_date, notes=""):
    """添加一个倒数日"""
    conn = get_db()
    conn.execute(
        "INSERT INTO countdowns (destination, departure_date, notes) VALUES (?, ?, ?)",
        (destination, departure_date, notes)
    )
    conn.commit()
    conn.close()

def get_countdowns():
    """获取所有倒数日，并计算剩余天数"""
    conn = get_db()
    rows = conn.execute("SELECT * FROM countdowns ORDER BY departure_date").fetchall()
    conn.close()
    today = date.today()
    result = []
    for r in rows:
        d = dict(r)
        dep = datetime.strptime(d["departure_date"], "%Y-%m-%d").date()
        d["days_left"] = (dep - today).days
        d["status"] = "已出发" if d["days_left"] < 0 else ("今天出发！" if d["days_left"] == 0 else f"还有 {d['days_left']} 天")
        result.append(d)
    return result

def delete_countdown(cd_id):
    conn = get_db()
    conn.execute("DELETE FROM countdowns WHERE id=?", (cd_id,))
    conn.commit()
    conn.close()

def delete_countdown_by_dest(destination, departure_date):
    """根据目的地和日期删除倒数日（删行程时联动）"""
    conn = get_db()
    conn.execute("DELETE FROM countdowns WHERE destination=? AND departure_date=?", 
                 (destination, departure_date))
    conn.commit()
    conn.close()

# ============================================================
# 启动初始化
# ============================================================
if __name__ == "__main__":
    init_db()
    print("✅ 数据库已初始化:", DB_PATH)
