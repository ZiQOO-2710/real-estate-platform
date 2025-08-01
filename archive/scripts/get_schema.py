import sqlite3
db_path = r"c:\Users\ksj27\real-estate-platform\real_estate_crawling_complete_20250725_111816.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(crawling_progress)")
columns = cursor.fetchall()
print("Columns in crawling_progress:")
for col in columns:
    print(f"- {col[1]} ({col[2]})")
conn.close()