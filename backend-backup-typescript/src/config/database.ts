import sqlite3 from 'sqlite3';
import path from 'path';

const DATABASE_PATH = process.env.DATABASE_PATH || '../../real_estate_crawling.db';

export class Database {
  private static instance: Database;
  private db: sqlite3.Database;

  private constructor() {
    const dbPath = path.resolve(__dirname, DATABASE_PATH);
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('SQLite 데이터베이스 연결 오류:', err.message);
        process.exit(1);
      }
      console.log('✅ SQLite 데이터베이스 연결 성공');
    });
  }

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public getDB(): sqlite3.Database {
    return this.db;
  }

  public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  public async run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  public close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('데이터베이스 연결 종료 오류:', err.message);
      } else {
        console.log('✅ 데이터베이스 연결 종료');
      }
    });
  }
}