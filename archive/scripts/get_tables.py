import sqlite3
db_path = r"c:\Users\ksj27\real-estate-platform\real_estate_crawling_complete_20250725_111816.db"
try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    if tables:
        print("Tables found:")
        for table in tables:
            print(f"{table[0]}")
    else:
        print("No tables found in the database.")
    conn.close()
except sqlite3.Error as e:
    print(f"Database error: {e}")
