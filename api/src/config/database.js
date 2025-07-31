const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.naverDb = null;
    this.molitDb = null;
    this.init();
  }

  init() {
    // 네이버 데이터베이스 연결
    const naverDbPath = path.join(__dirname, '../../../modules/naver-crawler/data/naver_real_estate.db');
    this.naverDb = new sqlite3.Database(naverDbPath, async (err) => {
      if (err) {
        console.error('Error opening Naver database:', err.message);
      } else {
        console.log('✅ Connected to Naver SQLite database');
        // 성능 최적화 인덱스 생성
        await this.createOptimizationIndexes();
      }
    });

    // 국토부 데이터베이스 연결
    const molitDbPath = path.join(__dirname, '../../../molit_complete_data.db');
    this.molitDb = new sqlite3.Database(molitDbPath, (err) => {
      if (err) {
        console.error('Error opening MOLIT database:', err.message);
      } else {
        console.log('✅ Connected to MOLIT SQLite database');
      }
    });
  }

  // 네이버 데이터베이스 쿼리
  queryNaver(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.naverDb.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 국토부 데이터베이스 쿼리
  queryMolit(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.molitDb.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 단일 행 조회 (네이버)
  getNaverRow(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.naverDb.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 단일 행 조회 (국토부)
  getMolitRow(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.molitDb.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // 성능 개선용 인덱스 생성
  async createOptimizationIndexes() {
    try {
      // 한국어 텍스트 검색 성능 개선을 위한 인덱스들
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_listings_description ON current_listings(description)',
        'CREATE INDEX IF NOT EXISTS idx_listings_raw_text ON current_listings(raw_text)',
        'CREATE INDEX IF NOT EXISTS idx_complexes_address ON apartment_complexes(address)',
        // FTS (Full Text Search) 가상 테이블 생성 - 한국어 검색 최적화
        `CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
          description, raw_text, complex_id,
          content='current_listings', content_rowid='id'
        )`
      ];

      for (const indexSql of indexes) {
        await this.queryNaver(indexSql);
      }
      
      console.log('✅ Optimization indexes created successfully');
    } catch (error) {
      console.error('❌ Error creating optimization indexes:', error.message);
    }
  }

  // 연결 종료
  close() {
    return new Promise((resolve) => {
      this.naverDb.close((err) => {
        if (err) {
          console.error('Error closing Naver database:', err.message);
        } else {
          console.log('✅ Naver database connection closed');
        }
      });

      this.molitDb.close((err) => {
        if (err) {
          console.error('Error closing MOLIT database:', err.message);
        } else {
          console.log('✅ MOLIT database connection closed');
        }
        resolve();
      });
    });
  }
}

module.exports = new Database();