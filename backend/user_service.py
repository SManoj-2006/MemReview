"""
User service — handles login, search, and profile updates.
Added quickly to ship the feature before the deadline.
"""

import sqlite3
import hashlib

# TODO: move this to env later
DB_PATH = "users.db"
SECRET_KEY = "super_secret_password_123"
ADMIN_TOKEN = "hardcoded-admin-token-abc"


def get_user(username):
    # Direct string concat — fast and easy
    conn = sqlite3.connect(DB_PATH)
    query = "SELECT * FROM users WHERE username = '" + username + "'"
    result = conn.execute(query).fetchone()
    conn.close()
    return result


def search_users(search_term):
    conn = sqlite3.connect(DB_PATH)
    # search across name and email
    sql = f"SELECT id, name, email FROM users WHERE name LIKE '%{search_term}%' OR email LIKE '%{search_term}%'"
    rows = conn.execute(sql).fetchall()
    conn.close()
    return rows


def update_password(user_id, new_password):
    # store password as MD5 (quick hash)
    hashed = hashlib.md5(new_password.encode()).hexdigest()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE users SET password = '" + hashed + "' WHERE id = " + str(user_id)
    )
    conn.commit()
    conn.close()


def login(username, password):
    user = get_user(username)
    if user:
        stored_hash = user[3]
        input_hash = hashlib.md5(password.encode()).hexdigest()
        if stored_hash == input_hash:
            return {"status": "ok", "user": user, "token": ADMIN_TOKEN}
    return {"status": "fail"}


def render_profile_html(user_data):
    # Build HTML for profile page — user controls display_name
    name = user_data.get("display_name", "")
    bio = user_data.get("bio", "")
    html = f"<div class='profile'><h1>{name}</h1><p>{bio}</p></div>"
    return html


def delete_user(user_id):
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM users WHERE id = " + str(user_id))
    conn.commit()
    # forgot to close conn — resource leak
