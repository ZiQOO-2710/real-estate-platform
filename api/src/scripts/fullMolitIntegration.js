#!/usr/bin/env node

/**
 * 전체 국토부 실거래가 데이터(20,777개 단지)를 기반으로 한 통합 DB 구축
 * 
 * 데이터 흐름:
 * 1. 국토부 전체 데이터 (977,388개 거래, 20,777개 단지) 추출
 * 2. 아파트 단지별 그룹핑 및 통계 생성
 * 3. 네이버 크롤링 데이터 매칭
 * 4. 통합 데이터베이스 구축
 */

const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

class FullMolitIntegration {
  constructor() {
    this.molitDbPath = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_crawled_data.db'
    this.outputDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
    
    this.stats = {
      total_transactions: 0,
      unique_complexes: 0,
      matched_naver_complexes: 0,
      created_complexes: 0,
      created_transactions: 0,
      errors: []
    }
  }

  async run() {
    console.log('🏗️  국토부 전체 데이터 기반 통합 DB 구축 시작')
    console.log('=' .repeat(60))
    
    try {
      // 1. 데이터베이스 연결
      await this.connectDatabases()
      
      // 2. 출력 DB 스키마 생성
      await this.createIntegratedSchema()
      
      // 3. 국토부 데이터에서 아파트 단지 추출
      await this.extractComplexesFromMolit()
      
      // 4. 국토부 거래 데이터 연결
      await this.linkMolitTransactions()
      
      // 5. 네이버 크롤링 데이터 매칭
      await this.matchNaverData()
      
      // 6. 크롤링 우선순위 큐 생성
      await this.createCrawlingQueue()
      
      // 7. 통계 및 인덱스 생성
      await this.createStatisticsAndIndexes()
      
      // 8. 결과 출력
      this.printResults()
      
    } catch (error) {
      console.error('❌ 오류 발생:', error)
      this.stats.errors.push(error.message)
    } finally {
      await this.closeDatabases()
    }
  }

  async connectDatabases() {
    console.log('📡 데이터베이스 연결 중...')
    
    return new Promise((resolve, reject) => {
      // 국토부 DB 연결
      this.molitDb = new sqlite3.Database(this.molitDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`국토부 DB 연결 실패: ${err.message}`))
          return
        }
        
        // 네이버 DB 연결
        this.naverDb = new sqlite3.Database(this.naverDbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) {
            console.warn(`⚠️  네이버 DB 연결 실패 (선택사항): ${err.message}`)
          }
          
          // 출력 DB 연결
          this.outputDb = new sqlite3.Database(this.outputDbPath, (err) => {
            if (err) {
              reject(new Error(`출력 DB 연결 실패: ${err.message}`))
              return
            }
            
            console.log('✅ 데이터베이스 연결 완료')
            resolve()
          })
        })
      })
    })
  }

  async createIntegratedSchema() {
    console.log('🏗️  통합 DB 스키마 생성 중...')
    
    const schema = `
      -- 아파트 단지 테이블
      CREATE TABLE IF NOT EXISTS apartment_complexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_key TEXT UNIQUE NOT NULL, -- region|dong|aptName 조합
        sigungu TEXT NOT NULL,
        eup_myeon_dong TEXT NOT NULL,
        apartment_name TEXT NOT NULL,
        road_name TEXT,
        road_number TEXT,
        land_number TEXT,
        
        -- 통계 정보
        total_transactions INTEGER DEFAULT 0,
        avg_price_per_pyeong INTEGER,
        latest_transaction_date TEXT,
        price_trend TEXT, -- 'rising', 'falling', 'stable'
        
        -- 네이버 매칭 정보
        naver_complex_id TEXT,
        naver_matched_at DATETIME,
        has_naver_data BOOLEAN DEFAULT 0,
        
        -- 크롤링 관련
        crawling_priority INTEGER DEFAULT 0, -- 거래량 기반 우선순위
        crawling_status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
        
        -- 메타데이터
        source_type TEXT DEFAULT 'molit',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 실거래가 기록 테이블
      CREATE TABLE IF NOT EXISTS transaction_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id INTEGER REFERENCES apartment_complexes(id),
        
        -- 거래 정보
        deal_amount INTEGER NOT NULL, -- 만원 단위
        deal_date TEXT NOT NULL, -- YYYY-MM
        area_for_exclusive_use REAL, -- 전용면적
        floor INTEGER,
        construction_year INTEGER,
        
        -- 위치 정보
        sigungu TEXT NOT NULL,
        eup_myeon_dong TEXT NOT NULL,
        apartment_name TEXT NOT NULL,
        
        -- 원본 데이터
        raw_data TEXT, -- JSON 형태로 저장
        
        -- 메타데이터
        source_type TEXT DEFAULT 'molit',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 현재 매물 테이블 (네이버에서 가져온 데이터)
      CREATE TABLE IF NOT EXISTS current_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id INTEGER REFERENCES apartment_complexes(id),
        
        -- 매물 정보
        listing_price INTEGER, -- 매매가 (만원)
        monthly_rent INTEGER, -- 월세 (만원)
        deposit INTEGER, -- 전세/보증금 (만원)
        area_pyeong REAL, -- 평수
        area_sqm REAL, -- 제곱미터
        floor_info TEXT, -- 층수 정보
        
        -- 매물 상세
        listing_type TEXT, -- 'sale', 'jeonse', 'monthly'
        description TEXT,
        listing_url TEXT,
        
        -- 메타데이터
        source_type TEXT DEFAULT 'naver',
        crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 크롤링 큐 테이블
      CREATE TABLE IF NOT EXISTS crawling_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id INTEGER REFERENCES apartment_complexes(id),
        priority INTEGER NOT NULL, -- 1(highest) to 10(lowest)
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
        
        -- 크롤링 정보
        target_type TEXT NOT NULL, -- 'complex_info', 'current_listings'
        retry_count INTEGER DEFAULT 0,
        last_attempt_at DATETIME,
        completed_at DATETIME,
        error_message TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 통계 테이블
      CREATE TABLE IF NOT EXISTS complex_statistics (
        complex_id INTEGER PRIMARY KEY REFERENCES apartment_complexes(id),
        
        -- 가격 통계
        min_price INTEGER,
        max_price INTEGER,
        avg_price INTEGER,
        median_price INTEGER,
        price_per_pyeong INTEGER,
        
        -- 거래량 통계
        total_transactions INTEGER,
        transactions_last_year INTEGER,
        transactions_last_month INTEGER,
        
        -- 면적 통계
        min_area REAL,
        max_area REAL,
        avg_area REAL,
        
        -- 기타 통계
        construction_year INTEGER,
        building_count INTEGER,
        household_count INTEGER,
        
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 네이버 매칭 매핑 테이블
      CREATE TABLE IF NOT EXISTS naver_complex_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id INTEGER REFERENCES apartment_complexes(id),
        naver_complex_id TEXT,
        
        -- 매칭 신뢰도
        match_confidence REAL, -- 0.0 to 1.0
        match_method TEXT, -- 'exact_name', 'fuzzy_name', 'address_based'
        
        -- 매칭 정보
        matched_name TEXT,
        matched_address TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `
    
    return new Promise((resolve, reject) => {
      this.outputDb.exec(schema, (err) => {
        if (err) {
          reject(new Error(`스키마 생성 실패: ${err.message}`))
          return
        }
        console.log('✅ 통합 DB 스키마 생성 완료')
        resolve()
      })
    })
  }

  async extractComplexesFromMolit() {
    console.log('🏢 국토부 데이터에서 아파트 단지 추출 중...')
    
    const query = `
      SELECT 
        region_name as sigungu,
        JSON_EXTRACT(api_data, '$.umdNm') as eup_myeon_dong,
        JSON_EXTRACT(api_data, '$.aptNm') as apartment_name,
        JSON_EXTRACT(api_data, '$.roadNm') as road_name,
        JSON_EXTRACT(api_data, '$.roadNmCd') as road_number,
        JSON_EXTRACT(api_data, '$.jibun') as land_number,
        COUNT(*) as transaction_count,
        AVG(CAST(REPLACE(JSON_EXTRACT(api_data, '$.dealAmount'), ',', '') AS INTEGER)) as avg_price,
        MAX(JSON_EXTRACT(api_data, '$.dealYear') || '-' || 
            CASE WHEN LENGTH(JSON_EXTRACT(api_data, '$.dealMonth')) = 1 
                 THEN '0' || JSON_EXTRACT(api_data, '$.dealMonth') 
                 ELSE JSON_EXTRACT(api_data, '$.dealMonth') END) as latest_date,
        MIN(CAST(REPLACE(JSON_EXTRACT(api_data, '$.excluUseAr'), ',', '') AS REAL)) as min_area,
        MAX(CAST(REPLACE(JSON_EXTRACT(api_data, '$.excluUseAr'), ',', '') AS REAL)) as max_area,
        AVG(CAST(REPLACE(JSON_EXTRACT(api_data, '$.excluUseAr'), ',', '') AS REAL)) as avg_area
      FROM apartment_transactions 
      WHERE JSON_EXTRACT(api_data, '$.aptNm') IS NOT NULL 
        AND JSON_EXTRACT(api_data, '$.aptNm') != ''
        AND JSON_EXTRACT(api_data, '$.dealAmount') IS NOT NULL
      GROUP BY region_name, JSON_EXTRACT(api_data, '$.umdNm'), JSON_EXTRACT(api_data, '$.aptNm')
      ORDER BY transaction_count DESC
    `
    
    return new Promise((resolve, reject) => {
      this.molitDb.all(query, [], (err, rows) => {
        if (err) {
          reject(new Error(`아파트 단지 추출 실패: ${err.message}`))
          return
        }
        
        console.log(`📊 추출된 고유 단지 수: ${rows.length}개`)
        this.stats.unique_complexes = rows.length
        
        // 배치로 단지 정보 삽입
        this.insertComplexesBatch(rows).then(resolve).catch(reject)
      })
    })
  }

  async insertComplexesBatch(complexes) {
    console.log('💾 아파트 단지 정보 DB 삽입 중...')
    
    const stmt = this.outputDb.prepare(`
      INSERT INTO apartment_complexes (
        complex_key, sigungu, eup_myeon_dong, apartment_name,
        road_name, road_number, land_number,
        total_transactions, avg_price_per_pyeong, latest_transaction_date,
        crawling_priority, source_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'molit')
    `)
    
    let insertCount = 0
    const batchSize = 1000
    
    return new Promise((resolve, reject) => {
      this.outputDb.run('BEGIN TRANSACTION')
      
      for (let i = 0; i < complexes.length; i += batchSize) {
        const batch = complexes.slice(i, i + batchSize)
        
        for (const complex of batch) {
          if (!complex.apartment_name || !complex.sigungu || !complex.eup_myeon_dong) {
            continue
          }
          
          const complexKey = `${complex.sigungu}|${complex.eup_myeon_dong}|${complex.apartment_name}`
          const avgPricePerPyeong = complex.avg_area > 0 ? 
            Math.round((complex.avg_price * 10000) / (complex.avg_area * 3.3058)) : null
          
          // 거래량 기반 크롤링 우선순위 (1-10, 1이 최고 우선순위)
          const priority = complex.transaction_count >= 100 ? 1 :
                          complex.transaction_count >= 50 ? 2 :
                          complex.transaction_count >= 20 ? 3 :
                          complex.transaction_count >= 10 ? 4 :
                          complex.transaction_count >= 5 ? 5 : 6
          
          try {
            stmt.run([
              complexKey,
              complex.sigungu,
              complex.eup_myeon_dong, 
              complex.apartment_name,
              complex.road_name,
              complex.road_number,
              complex.land_number,
              complex.transaction_count,
              avgPricePerPyeong,
              complex.latest_date,
              priority
            ])
            insertCount++
          } catch (err) {
            console.warn(`⚠️  단지 삽입 실패: ${complex.apartment_name} - ${err.message}`)
          }
        }
        
        // 진행률 표시
        if (i % (batchSize * 5) === 0) {
          console.log(`   진행률: ${Math.round((i / complexes.length) * 100)}% (${insertCount}개 삽입됨)`)
        }
      }
      
      this.outputDb.run('COMMIT', (err) => {
        stmt.finalize()
        
        if (err) {
          reject(new Error(`배치 삽입 커밋 실패: ${err.message}`))
          return
        }
        
        this.stats.created_complexes = insertCount
        console.log(`✅ 아파트 단지 ${insertCount}개 삽입 완료`)
        resolve()
      })
    })
  }

  async linkMolitTransactions() {
    console.log('🔗 국토부 거래 데이터 연결 중...')
    
    // 모든 거래 데이터를 복사 (너무 많으므로 샘플링 또는 제한)
    const query = `
      SELECT 
        region_name as sigungu,
        JSON_EXTRACT(api_data, '$.umdNm') as eup_myeon_dong,
        JSON_EXTRACT(api_data, '$.aptNm') as apartment_name,
        CAST(REPLACE(JSON_EXTRACT(api_data, '$.dealAmount'), ',', '') AS INTEGER) as deal_amount,
        JSON_EXTRACT(api_data, '$.dealYear') || '-' || 
        CASE WHEN LENGTH(JSON_EXTRACT(api_data, '$.dealMonth')) = 1 
             THEN '0' || JSON_EXTRACT(api_data, '$.dealMonth') 
             ELSE JSON_EXTRACT(api_data, '$.dealMonth') END as deal_date,
        CAST(REPLACE(JSON_EXTRACT(api_data, '$.excluUseAr'), ',', '') AS REAL) as area_for_exclusive_use,
        CAST(JSON_EXTRACT(api_data, '$.floor') AS INTEGER) as floor,
        CAST(JSON_EXTRACT(api_data, '$.buildYear') AS INTEGER) as construction_year,
        api_data as raw_data
      FROM apartment_transactions 
      WHERE JSON_EXTRACT(api_data, '$.aptNm') IS NOT NULL 
        AND JSON_EXTRACT(api_data, '$.dealAmount') IS NOT NULL
      LIMIT 50000
    `
    
    return new Promise((resolve, reject) => {
      this.molitDb.all(query, [], (err, rows) => {
        if (err) {
          reject(new Error(`거래 데이터 조회 실패: ${err.message}`))
          return
        }
        
        console.log(`📊 연결할 거래 데이터: ${rows.length}개`)
        this.insertTransactionsBatch(rows).then(resolve).catch(reject)
      })
    })
  }

  async insertTransactionsBatch(transactions) {
    console.log('💾 거래 데이터 삽입 중...')
    
    const stmt = this.outputDb.prepare(`
      INSERT INTO transaction_records (
        complex_id, deal_amount, deal_date, area_for_exclusive_use,
        floor, construction_year, sigungu, eup_myeon_dong, apartment_name,
        raw_data, source_type
      ) SELECT 
        ac.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'molit'
      FROM apartment_complexes ac 
      WHERE ac.complex_key = ?
    `)
    
    let insertCount = 0
    const batchSize = 1000
    
    return new Promise((resolve, reject) => {
      this.outputDb.run('BEGIN TRANSACTION')
      
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize)
        
        for (const tx of batch) {
          if (!tx.apartment_name || !tx.deal_amount) {
            continue
          }
          
          const complexKey = `${tx.sigungu}|${tx.eup_myeon_dong}|${tx.apartment_name}`
          
          try {
            stmt.run([
              tx.deal_amount,
              tx.deal_date,
              tx.area_for_exclusive_use,
              tx.floor,
              tx.construction_year,
              tx.sigungu,
              tx.eup_myeon_dong,
              tx.apartment_name,
              tx.raw_data,
              complexKey
            ])
            insertCount++
          } catch (err) {
            // 중복 또는 매칭 실패는 조용히 처리
          }
        }
        
        if (i % (batchSize * 5) === 0) {
          console.log(`   진행률: ${Math.round((i / transactions.length) * 100)}% (${insertCount}개 삽입됨)`)
        }
      }
      
      this.outputDb.run('COMMIT', (err) => {
        stmt.finalize()
        
        if (err) {
          reject(new Error(`거래 데이터 커밋 실패: ${err.message}`))
          return
        }
        
        this.stats.created_transactions = insertCount
        console.log(`✅ 거래 데이터 ${insertCount}개 삽입 완료`)
        resolve()
      })
    })
  }

  async matchNaverData() {
    console.log('🔄 네이버 크롤링 데이터 매칭 중...')
    
    if (!this.naverDb) {
      console.log('⚠️  네이버 DB가 없어 매칭 건너뜀')
      return
    }
    
    // 네이버 단지 데이터 조회
    const query = `SELECT complex_id, complex_name, address FROM apartment_complexes`
    
    return new Promise((resolve, reject) => {
      this.naverDb.all(query, [], (err, naverComplexes) => {
        if (err) {
          console.warn(`⚠️  네이버 데이터 조회 실패: ${err.message}`)
          resolve()
          return
        }
        
        console.log(`📊 네이버 단지 데이터: ${naverComplexes.length}개`)
        
        // 매칭 로직 실행
        this.performNaverMatching(naverComplexes).then(resolve).catch(reject)
      })
    })
  }

  async performNaverMatching(naverComplexes) {
    let matchCount = 0
    
    const updateStmt = this.outputDb.prepare(`
      UPDATE apartment_complexes 
      SET naver_complex_id = ?, has_naver_data = 1, naver_matched_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
    
    const insertMappingStmt = this.outputDb.prepare(`
      INSERT INTO naver_complex_mapping (complex_id, naver_complex_id, match_confidence, match_method, matched_name)
      VALUES (?, ?, ?, ?, ?)
    `)
    
    return new Promise((resolve, reject) => {
      // 통합 DB의 모든 단지 조회
      this.outputDb.all(`SELECT id, apartment_name, sigungu, eup_myeon_dong FROM apartment_complexes`, [], (err, molitComplexes) => {
        if (err) {
          reject(new Error(`통합 단지 조회 실패: ${err.message}`))
          return
        }
        
        console.log(`🔍 ${molitComplexes.length}개 단지에 대해 네이버 매칭 시도`)
        
        this.outputDb.serialize(() => {
          this.outputDb.run('BEGIN TRANSACTION')
          
          for (const molitComplex of molitComplexes) {
          // 정확한 이름 매칭
          const exactMatch = naverComplexes.find(nc => 
            nc.complex_name === molitComplex.apartment_name
          )
          
          if (exactMatch) {
            updateStmt.run([exactMatch.complex_id, molitComplex.id])
            insertMappingStmt.run([
              molitComplex.id, 
              exactMatch.complex_id, 
              1.0, 
              'exact_name', 
              exactMatch.complex_name
            ])
            matchCount++
            continue
          }
          
          // 유사한 이름 매칭 (간단한 포함 관계)
          const fuzzyMatch = naverComplexes.find(nc => 
            nc.complex_name.includes(molitComplex.apartment_name) ||
            molitComplex.apartment_name.includes(nc.complex_name)
          )
          
          if (fuzzyMatch) {
            updateStmt.run([fuzzyMatch.complex_id, molitComplex.id])
            insertMappingStmt.run([
              molitComplex.id, 
              fuzzyMatch.complex_id, 
              0.8, 
              'fuzzy_name', 
              fuzzyMatch.complex_name
            ])
            matchCount++
          }
        }
        
          this.outputDb.run('COMMIT', (err) => {
            updateStmt.finalize()
            insertMappingStmt.finalize()
            
            if (err) {
              reject(new Error(`네이버 매칭 커밋 실패: ${err.message}`))
              return
            }
            
            this.stats.matched_naver_complexes = matchCount
            console.log(`✅ 네이버 데이터 ${matchCount}개 단지 매칭 완료`)
            resolve()
          })
        })
      })
    })
  }

  async createCrawlingQueue() {
    console.log('📋 크롤링 우선순위 큐 생성 중...')
    
    const query = `
      INSERT INTO crawling_queue (complex_id, priority, target_type)
      SELECT 
        id,
        crawling_priority,
        'complex_info'
      FROM apartment_complexes 
      WHERE has_naver_data = 0
      ORDER BY crawling_priority ASC, total_transactions DESC
    `
    
    return new Promise((resolve, reject) => {
      this.outputDb.run(query, [], function(err) {
        if (err) {
          reject(new Error(`크롤링 큐 생성 실패: ${err.message}`))
          return
        }
        
        console.log(`✅ 크롤링 큐 ${this.changes}개 항목 생성 완료`)
        resolve()
      })
    })
  }

  async createStatisticsAndIndexes() {
    console.log('📊 통계 및 인덱스 생성 중...')
    
    const operations = [
      // 통계 테이블 업데이트
      `INSERT OR REPLACE INTO complex_statistics (
        complex_id, min_price, max_price, avg_price, total_transactions,
        min_area, max_area, avg_area, updated_at
      )
      SELECT 
        ac.id,
        MIN(tr.deal_amount) as min_price,
        MAX(tr.deal_amount) as max_price,
        AVG(tr.deal_amount) as avg_price,
        COUNT(tr.id) as total_transactions,
        MIN(tr.area_for_exclusive_use) as min_area,
        MAX(tr.area_for_exclusive_use) as max_area,
        AVG(tr.area_for_exclusive_use) as avg_area,
        CURRENT_TIMESTAMP
      FROM apartment_complexes ac
      LEFT JOIN transaction_records tr ON ac.id = tr.complex_id
      GROUP BY ac.id`,
      
      // 인덱스 생성
      `CREATE INDEX IF NOT EXISTS idx_complexes_key ON apartment_complexes(complex_key)`,
      `CREATE INDEX IF NOT EXISTS idx_complexes_location ON apartment_complexes(sigungu, eup_myeon_dong)`,
      `CREATE INDEX IF NOT EXISTS idx_complexes_priority ON apartment_complexes(crawling_priority)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_complex ON transaction_records(complex_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transaction_records(deal_date)`,
      `CREATE INDEX IF NOT EXISTS idx_listings_complex ON current_listings(complex_id)`,
      `CREATE INDEX IF NOT EXISTS idx_crawling_queue_priority ON crawling_queue(priority, status)`,
    ]
    
    for (const operation of operations) {
      await new Promise((resolve, reject) => {
        this.outputDb.run(operation, [], (err) => {
          if (err) {
            console.warn(`⚠️  작업 실패: ${err.message}`)
          }
          resolve()
        })
      })
    }
    
    console.log('✅ 통계 및 인덱스 생성 완료')
  }

  async closeDatabases() {
    return new Promise((resolve) => {
      let closed = 0
      const total = 3
      
      const checkComplete = () => {
        closed++
        if (closed === total) resolve()
      }
      
      if (this.molitDb) {
        this.molitDb.close(checkComplete)
      } else {
        checkComplete()
      }
      
      if (this.naverDb) {
        this.naverDb.close(checkComplete)
      } else {
        checkComplete()
      }
      
      if (this.outputDb) {
        this.outputDb.close(checkComplete)
      } else {
        checkComplete()
      }
    })
  }

  printResults() {
    console.log('\n🎉 통합 DB 구축 완료!')
    console.log('=' .repeat(60))
    console.log(`📊 처리 결과:`)
    console.log(`   • 추출된 고유 단지: ${this.stats.unique_complexes.toLocaleString()}개`)
    console.log(`   • 생성된 단지: ${this.stats.created_complexes.toLocaleString()}개`)
    console.log(`   • 생성된 거래 기록: ${this.stats.created_transactions.toLocaleString()}개`)
    console.log(`   • 네이버 매칭 단지: ${this.stats.matched_naver_complexes.toLocaleString()}개`)
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  오류 ${this.stats.errors.length}개:`)
      this.stats.errors.forEach(error => console.log(`   • ${error}`))
    }
    
    console.log(`\n💾 출력 DB: ${this.outputDbPath}`)
    console.log('🎯 다음 단계: 네이버 크롤링 실행으로 매물 정보 수집')
  }
}

// 실행
if (require.main === module) {
  const integration = new FullMolitIntegration()
  integration.run().catch(console.error)
}

module.exports = FullMolitIntegration