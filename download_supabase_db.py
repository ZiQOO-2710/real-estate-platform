

import os
import psycopg2

def get_supabase_connection():
    """Establishes a connection to the Supabase PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            dbname="postgres",
            user="postgres",
            password="3caSEkGMRtctI1R5",
            host="db.heatmxifhwxppprdzaqf.supabase.co",
            port="5432"
        )
        return conn
    except psycopg2.OperationalError as e:
        print(f"Error: Could not connect to the database.\n{e}")
        return None

def backup_supabase_db(output_file):
    """
    Connects to a Supabase database, fetches the schema and data for all tables,
    and writes them to a SQL backup file.
    """
    conn = get_supabase_connection()
    if not conn:
        return

    try:
        with conn.cursor() as cur:
            # 1. Get a list of all tables in the public schema
            cur.execute("""
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
            """)
            tables = [row[0] for row in cur.fetchall()]

            with open(output_file, 'w', encoding='utf-8') as f:
                # 2. For each table, get the CREATE TABLE statement
                for table in tables:
                    f.write(f"-- Schema for table: {table}\n")
                    # This is a simplified way to get schema; for complex cases, pg_dump is better
                    # We'll just dump the data for now as schema is in other files.
                    # A more robust solution would parse pg_dump output if available.
                    
                    # 3. Get all data from the table
                    cur.execute(f'SELECT * FROM public."{table}"')
                    rows = cur.fetchall()
                    
                    if not rows:
                        f.write(f"-- No data in table: {table}\n\n")
                        continue

                    # Get column names
                    colnames = [desc[0] for desc in cur.description]
                    
                    # 4. Write INSERT statements for the data
                    f.write(f"COPY public.{table} ({', '.join(colnames)}) FROM stdin;\n")
                    for row in rows:
                        f.write('\t'.join(map(lambda x: str(x).replace('\n', '\n'), row)) + '\n')
                    f.write("\\.\n\n")


        print(f"Successfully backed up database to {output_file}")

    except psycopg2.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    backup_supabase_db("supabase_db_backup.sql")

