#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

/**
 * 국토부 실거래가 데이터를 베이스로 하는 완전 통합 시스템
 * 17,394개 아파트 단지 기반
 */
class MolitBaseIntegrator {
  constructor() {
    // 데이터베이스 경로들
    this.molitDbPath = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_real_estate.db'
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/molit_integrated_real_estate.db'
    
    // 데이터베이스 연결 객체들
    this.molitDb = null
    this.naverDb = null
    this.integratedDb = null
    
    // 매칭 통계
    this.stats = {
      total_molit_complexes: 0,
      matched_naver_complexes: 0,
      unmatched_complexes: 0,
      total_transactions: 0,
      total_listings: 0,
      crawling_queue: []
    }
  }

  async initialize() {
    console.log('🚀 국토부 베이스 통합 시스템 초기화 중...')
    
    // 기존 통합 DB 삭제
    if (fs.existsSync(this.integratedDbPath)) {
      fs.unlinkSync(this.integratedDbPath)
      console.log('🗑️ 기존 통합 DB 삭제 완료')
    }
    
    // 데이터베이스 연결
    this.molitDb = new sqlite3.Database(this.molitDbPath)
    this.naverDb = new sqlite3.Database(this.naverDbPath)
    this.integratedDb = new sqlite3.Database(this.integratedDbPath)
    
    // 통합 스키마 생성
    await this.createIntegratedSchema()
    
    console.log('✅ 초기화 완료')
  }

  async createIntegratedSchema() {
    console.log('📋 통합 스키마 생성 중...')
    
    const schema = `
      -- 아파트 단지 마스터 테이블 (국토부 베이스)
      CREATE TABLE apartment_complexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        
        -- 국토부 기본 정보
        molit_complex_name TEXT NOT NULL,
        molit_sigungu TEXT NOT NULL,
        molit_eup_myeon_dong TEXT NOT NULL,
        molit_road_name TEXT,
        molit_road_number TEXT,
        molit_land_number TEXT,
        
        -- 통합 정보 (네이버 매칭 후)
        name TEXT, -- 표준화된 단지명
        address_normalized TEXT,
        sido TEXT,
        sigungu TEXT,
        eup_myeon_dong TEXT,
        
        -- 좌표 정보 (네이버에서 보완)
        latitude REAL,
        longitude REAL,
        
        -- 단지 상세 정보 (네이버에서 보완)
        completion_year INTEGER,
        total_households INTEGER,
        total_buildings INTEGER,
        parking_spaces INTEGER,
        heating_type TEXT,
        
        -- 매칭 상태
        naver_matched BOOLEAN DEFAULT FALSE,
        naver_complex_id TEXT,
        naver_crawling_needed BOOLEAN DEFAULT TRUE,
        crawling_priority INTEGER DEFAULT 0, -- 0=최고, 숫자 클수록 낮음
        
        -- 메타데이터
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- 실거래 내역 (국토부 데이터)
      CREATE TABLE transaction_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_complex_id INTEGER NOT NULL,
        
        -- 거래 정보
        deal_year INTEGER NOT NULL,
        deal_month INTEGER NOT NULL,
        deal_day INTEGER NOT NULL,
        deal_date TEXT NOT NULL, -- YYYY-MM-DD 형식
        deal_amount INTEGER NOT NULL, -- 만원 단위
        
        -- 물건 정보
        area_exclusive REAL, -- 전용면적
        floor_current INTEGER,
        
        -- 위치 정보
        sigungu TEXT NOT NULL,
        eup_myeon_dong TEXT NOT NULL,
        apartment_name TEXT NOT NULL,
        
        -- 메타데이터
        data_source TEXT DEFAULT 'molit',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
      );

      -- 현재 매물 (네이버 데이터)
      CREATE TABLE current_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_complex_id INTEGER NOT NULL,
        
        -- 네이버 매물 정보
        naver_listing_id TEXT,
        listing_url TEXT,
        
        -- 거래 정보
        deal_type TEXT NOT NULL, -- 매매, 전세, 월세
        price_sale INTEGER,
        price_jeonse INTEGER,
        price_monthly INTEGER,
        deposit INTEGER,
        
        -- 물건 정보
        area_exclusive REAL,
        area_supply REAL,
        floor_current INTEGER,
        floor_total INTEGER,
        direction TEXT,
        room_structure TEXT,
        
        -- 상태
        status TEXT DEFAULT 'active', -- active, sold, expired
        
        -- 메타데이터
        crawled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
      );

      -- 네이버 단지 매칭 테이블
      CREATE TABLE naver_complex_mapping (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_complex_id INTEGER NOT NULL,
        naver_complex_id TEXT NOT NULL,
        
        -- 매칭 정보
        matching_method TEXT, -- name_exact, name_fuzzy, address, manual
        matching_confidence REAL, -- 0.0 ~ 1.0
        matching_details TEXT, -- JSON 형태의 상세 매칭 정보
        
        -- 상태
        verified BOOLEAN DEFAULT FALSE,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id),
        UNIQUE(apartment_complex_id, naver_complex_id)
      );

      -- 크롤링 큐 관리
      CREATE TABLE crawling_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        apartment_complex_id INTEGER NOT NULL,
        
        -- 크롤링 타입
        crawl_type TEXT NOT NULL, -- complex_info, listings, both
        priority INTEGER DEFAULT 0, -- 0=최고 우선순위
        
        -- 상태
        status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
        attempts INTEGER DEFAULT 0,
        last_attempt DATETIME,
        
        -- 결과
        success_count INTEGER DEFAULT 0,
        error_message TEXT,
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
      );

      -- 통계 및 분석 뷰
      CREATE VIEW complex_statistics AS
      SELECT 
        ac.id,
        ac.name,
        ac.molit_complex_name,
        ac.sigungu,
        ac.eup_myeon_dong,
        ac.naver_matched,
        
        -- 거래 통계
        COUNT(tr.id) as total_transactions,
        AVG(tr.deal_amount) as avg_transaction_price,
        MIN(tr.deal_amount) as min_transaction_price,
        MAX(tr.deal_amount) as max_transaction_price,
        MIN(tr.deal_date) as first_transaction_date,
        MAX(tr.deal_date) as last_transaction_date,
        
        -- 매물 통계
        COUNT(cl.id) as total_listings,
        AVG(cl.price_sale) as avg_listing_price,
        
        -- 우선순위 점수 (거래량 기반)
        COUNT(tr.id) * 10 + COUNT(cl.id) as priority_score
        
      FROM apartment_complexes ac
      LEFT JOIN transaction_records tr ON ac.id = tr.apartment_complex_id
      LEFT JOIN current_listings cl ON ac.id = cl.apartment_complex_id
      GROUP BY ac.id;

      -- 인덱스 생성
      CREATE INDEX idx_complexes_molit_name ON apartment_complexes(molit_complex_name);
      CREATE INDEX idx_complexes_location ON apartment_complexes(molit_sigungu, molit_eup_myeon_dong);
      CREATE INDEX idx_complexes_naver_matched ON apartment_complexes(naver_matched);
      CREATE INDEX idx_transactions_complex ON transaction_records(apartment_complex_id);
      CREATE INDEX idx_transactions_date ON transaction_records(deal_date);
      CREATE INDEX idx_listings_complex ON current_listings(apartment_complex_id);
      CREATE INDEX idx_listings_status ON current_listings(status);
    `

    await new Promise((resolve, reject) => {
      this.integratedDb.exec(schema, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    console.log('✅ 스키마 생성 완료')
  }

  async runFullIntegration() {
    console.log('🚀 국토부 베이스 완전 통합 시작')

    try {
      // 1단계: 국토부 단지 데이터 추출 및 생성
      await this.extractMolitComplexes()
      
      // 2단계: 국토부 실거래 데이터 연결
      await this.importMolitTransactions()
      
      // 3단계: 네이버 단지 정보 매칭
      await this.matchNaverComplexes()
      
      // 4단계: 네이버 매물 데이터 연결
      await this.importNaverListings()
      
      // 5단계: 크롤링 우선순위 계산
      await this.calculateCrawlingPriorities()
      
      // 6단계: 결과 리포트
      await this.generateReport()
      
    } catch (error) {
      console.error('❌ 통합 실패:', error)
      throw error
    }
  }

  async extractMolitComplexes() {
    console.log('📊 국토부 아파트 단지 추출 중...')
    
    // 국토부 데이터에서 고유한 아파트 단지 추출 (JSON에서 파싱)
    const complexes = await new Promise((resolve, reject) => {
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
          MIN(JSON_EXTRACT(api_data, '$.dealYear')) as first_year,
          MAX(JSON_EXTRACT(api_data, '$.dealYear')) as last_year
        FROM apartment_transactions
        WHERE JSON_EXTRACT(api_data, '$.aptNm') IS NOT NULL 
        AND JSON_EXTRACT(api_data, '$.aptNm') != ''
        GROUP BY region_name, JSON_EXTRACT(api_data, '$.umdNm'), JSON_EXTRACT(api_data, '$.aptNm')
        ORDER BY transaction_count DESC
      `
      
      this.molitDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    console.log(`📋 ${complexes.length}개의 고유 아파트 단지 발견`)
    this.stats.total_molit_complexes = complexes.length

    // 단지별로 통합 DB에 삽입 (최대 500개까지만 테스트)
    let insertedCount = 0
    const complexesToProcess = complexes.slice(0, 500) // 테스트용으로 500개만
    
    for (const complex of complexesToProcess) {
      try {
        await this.insertComplexFromMolit(complex)
        insertedCount++
        
        if (insertedCount % 100 === 0) {
          console.log(`📍 ${insertedCount}/${complexesToProcess.length} 단지 처리 완료`)
        }
      } catch (error) {
        console.error(`❌ 단지 삽입 실패 (${complex.apartment_name}):`, error.message)
      }
    }

    console.log(`✅ ${insertedCount}개 아파트 단지 생성 완료`)
  }

  async insertComplexFromMolit(molitData) {
    const query = `
      INSERT INTO apartment_complexes (
        molit_complex_name, molit_sigungu, molit_eup_myeon_dong,
        molit_road_name, molit_road_number, molit_land_number,
        name, address_normalized, sido, sigungu, eup_myeon_dong,
        crawling_priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    // 시도 추출 (시군구에서)
    const sido = this.extractSido(molitData.sigungu)
    
    // 표준화된 주소 생성
    const normalizedAddress = `${sido} ${molitData.sigungu} ${molitData.eup_myeon_dong}`
    
    // 우선순위 계산 (거래량 기반)
    const priority = Math.max(0, 1000 - molitData.transaction_count)

    const values = [
      molitData.apartment_name,
      molitData.sigungu,
      molitData.eup_myeon_dong,
      molitData.road_name,
      molitData.road_number,
      molitData.land_number,
      molitData.apartment_name, // 초기값은 원본 이름 사용
      normalizedAddress,
      sido,
      molitData.sigungu,
      molitData.eup_myeon_dong,
      priority
    ]

    return new Promise((resolve, reject) => {
      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  extractSido(sigungu) {
    // 시군구명에서 시도 추출
    const sidoMap = {
      '강남구': '서울특별시', '강동구': '서울특별시', '강북구': '서울특별시', '강서구': '서울특별시',
      '관악구': '서울특별시', '광진구': '서울특별시', '구로구': '서울특별시', '금천구': '서울특별시',
      '노원구': '서울특별시', '도봉구': '서울특별시', '동대문구': '서울특별시', '동작구': '서울특별시',
      '마포구': '서울특별시', '서대문구': '서울특별시', '서초구': '서울특별시', '성동구': '서울특별시',
      '성북구': '서울특별시', '송파구': '서울특별시', '양천구': '서울특별시', '영등포구': '서울특별시',
      '용산구': '서울특별시', '은평구': '서울특별시', '종로구': '서울특별시', '중구': '서울특별시',
      '중랑구': '서울특별시',
      '중구': '부산광역시', '서구': '부산광역시', '동구': '부산광역시', '영도구': '부산광역시',
      '부산진구': '부산광역시', '동래구': '부산광역시', '남구': '부산광역시', '북구': '부산광역시',
      '해운대구': '부산광역시', '사하구': '부산광역시', '금정구': '부산광역시', '강서구': '부산광역시',
      '연제구': '부산광역시', '수영구': '부산광역시', '사상구': '부산광역시', '기장군': '부산광역시'
    }

    return sidoMap[sigungu] || '기타'
  }

  async importMolitTransactions() {
    console.log('💰 국토부 실거래 데이터 연결 중...')
    
    // 모든 거래 데이터를 가져와서 단지별로 매칭 (제한된 수량)
    const transactions = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          region_name as sigungu,
          JSON_EXTRACT(api_data, '$.umdNm') as eup_myeon_dong,
          JSON_EXTRACT(api_data, '$.aptNm') as apartment_name,
          JSON_EXTRACT(api_data, '$.dealYear') as deal_year,
          JSON_EXTRACT(api_data, '$.dealMonth') as deal_month,
          JSON_EXTRACT(api_data, '$.dealDay') as deal_day,
          CAST(REPLACE(JSON_EXTRACT(api_data, '$.dealAmount'), ',', '') AS INTEGER) as deal_amount,
          CAST(JSON_EXTRACT(api_data, '$.excluUseAr') AS REAL) as area_exclusive,
          CAST(JSON_EXTRACT(api_data, '$.floor') AS INTEGER) as floor_current
        FROM apartment_transactions
        WHERE JSON_EXTRACT(api_data, '$.aptNm') IS NOT NULL 
        AND JSON_EXTRACT(api_data, '$.aptNm') != ''
        ORDER BY JSON_EXTRACT(api_data, '$.dealYear') DESC, 
                 JSON_EXTRACT(api_data, '$.dealMonth') DESC, 
                 JSON_EXTRACT(api_data, '$.dealDay') DESC
        LIMIT 10000
      `
      
      this.molitDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    console.log(`💵 ${transactions.length}건의 거래 데이터 처리 중...`)
    
    let importedCount = 0
    for (const transaction of transactions) {
      try {
        // 해당 단지 찾기
        const complexId = await this.findComplexByMolitInfo(
          transaction.sigungu,
          transaction.eup_myeon_dong,
          transaction.apartment_name
        )
        
        if (complexId) {
          await this.insertTransaction(complexId, transaction)
          importedCount++
        }
        
        if (importedCount % 500 === 0) {
          console.log(`💰 ${importedCount}/${transactions.length} 거래 연결 완료`)
        }
      } catch (error) {
        console.error(`❌ 거래 연결 실패:`, error.message)
      }
    }

    this.stats.total_transactions = importedCount
    console.log(`✅ ${importedCount}건 거래 데이터 연결 완료`)
  }

  async findComplexByMolitInfo(sigungu, eup_myeon_dong, apartment_name) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id FROM apartment_complexes 
        WHERE molit_sigungu = ? AND molit_eup_myeon_dong = ? AND molit_complex_name = ?
        LIMIT 1
      `
      
      this.integratedDb.get(query, [sigungu, eup_myeon_dong, apartment_name], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.id : null)
      })
    })
  }

  async insertTransaction(complexId, transactionData) {
    const dealDate = `${transactionData.deal_year}-${String(transactionData.deal_month).padStart(2, '0')}-${String(transactionData.deal_day).padStart(2, '0')}`
    
    const query = `
      INSERT INTO transaction_records (
        apartment_complex_id, deal_year, deal_month, deal_day, deal_date,
        deal_amount, area_exclusive, floor_current,
        sigungu, eup_myeon_dong, apartment_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    const values = [
      complexId,
      parseInt(transactionData.deal_year),
      parseInt(transactionData.deal_month),
      parseInt(transactionData.deal_day),
      dealDate,
      transactionData.deal_amount,
      transactionData.area_exclusive,
      transactionData.floor_current,
      transactionData.sigungu,
      transactionData.eup_myeon_dong,
      transactionData.apartment_name
    ]

    return new Promise((resolve, reject) => {
      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  async matchNaverComplexes() {
    console.log('🔗 네이버 단지 정보 매칭 중...')
    
    // 네이버 단지 데이터 가져오기
    const naverComplexes = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          complex_id, complex_name, address,
          total_households, total_buildings, completion_year
        FROM apartment_complexes
        WHERE complex_name IS NOT NULL AND complex_name != '정보없음'
      `
      
      this.naverDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    console.log(`🏢 ${naverComplexes.length}개의 네이버 단지 데이터로 매칭 시도`)

    let matchedCount = 0
    for (const naverComplex of naverComplexes) {
      try {
        const matchResult = await this.findBestMatch(naverComplex)
        if (matchResult) {
          await this.updateComplexWithNaverData(matchResult.complexId, naverComplex, matchResult.confidence)
          matchedCount++
        }
      } catch (error) {
        console.error(`❌ 매칭 실패 (${naverComplex.complex_name}):`, error.message)
      }
    }

    this.stats.matched_naver_complexes = matchedCount
    this.stats.unmatched_complexes = this.stats.total_molit_complexes - matchedCount
    
    console.log(`✅ ${matchedCount}개 단지 매칭 완료`)
  }

  async findBestMatch(naverComplex) {
    // 1. 정확한 이름 매칭
    let match = await this.findExactNameMatch(naverComplex.complex_name)
    if (match) return { complexId: match, confidence: 1.0, method: 'name_exact' }

    // 2. 유사 이름 매칭
    match = await this.findSimilarNameMatch(naverComplex.complex_name)
    if (match) return { complexId: match, confidence: 0.8, method: 'name_fuzzy' }

    // 3. 주소 기반 매칭
    if (naverComplex.address) {
      match = await this.findAddressMatch(naverComplex.address, naverComplex.complex_name)
      if (match) return { complexId: match, confidence: 0.6, method: 'address' }
    }

    return null
  }

  async findExactNameMatch(complexName) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id FROM apartment_complexes 
        WHERE molit_complex_name = ? AND naver_matched = FALSE
        LIMIT 1
      `
      
      this.integratedDb.get(query, [complexName], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.id : null)
      })
    })
  }

  async findSimilarNameMatch(complexName) {
    // 간단한 유사 매칭 (실제로는 더 정교한 알고리즘 필요)
    const cleanName = complexName.replace(/아파트|APT|단지/g, '').trim()
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT id FROM apartment_complexes 
        WHERE molit_complex_name LIKE ? AND naver_matched = FALSE
        LIMIT 1
      `
      
      this.integratedDb.get(query, [`%${cleanName}%`], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.id : null)
      })
    })
  }

  async findAddressMatch(address, complexName) {
    // 주소에서 시군구, 읍면동 추출 후 매칭
    const addressParts = address.split(' ')
    if (addressParts.length >= 3) {
      const sigungu = addressParts[1]
      const eup_myeon_dong = addressParts[2]
      
      return new Promise((resolve, reject) => {
        const query = `
          SELECT id FROM apartment_complexes 
          WHERE molit_sigungu LIKE ? AND molit_eup_myeon_dong LIKE ? 
          AND naver_matched = FALSE
          ORDER BY 
            CASE WHEN molit_complex_name LIKE ? THEN 1 ELSE 2 END
          LIMIT 1
        `
        
        this.integratedDb.get(query, [`%${sigungu}%`, `%${eup_myeon_dong}%`, `%${complexName}%`], (err, row) => {
          if (err) reject(err)
          else resolve(row ? row.id : null)
        })
      })
    }
    
    return null
  }

  async updateComplexWithNaverData(complexId, naverData, confidence) {
    const query = `
      UPDATE apartment_complexes SET
        name = ?,
        total_households = ?,
        total_buildings = ?,
        completion_year = ?,
        naver_matched = TRUE,
        naver_complex_id = ?,
        naver_crawling_needed = FALSE,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `

    const values = [
      naverData.complex_name,
      naverData.total_households,
      naverData.total_buildings,
      naverData.completion_year,
      naverData.complex_id,
      complexId
    ]

    await new Promise((resolve, reject) => {
      this.integratedDb.run(query, values, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // 매칭 기록 저장
    await this.recordMatching(complexId, naverData.complex_id, confidence)
  }

  async recordMatching(complexId, naverComplexId, confidence) {
    const query = `
      INSERT INTO naver_complex_mapping (
        apartment_complex_id, naver_complex_id, 
        matching_confidence, verified
      ) VALUES (?, ?, ?, ?)
    `

    return new Promise((resolve, reject) => {
      this.integratedDb.run(query, [complexId, naverComplexId, confidence, confidence >= 0.8], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async importNaverListings() {
    console.log('🏠 네이버 매물 데이터 연결 중...')
    
    // 매칭된 단지들의 매물 데이터 가져오기
    const listings = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          cl.id, cl.complex_id, cl.deal_type, cl.price_amount,
          cl.area_sqm, cl.floor_info
        FROM current_listings cl
        INNER JOIN (
          SELECT DISTINCT naver_complex_id 
          FROM naver_complex_mapping
        ) ncm ON cl.complex_id = ncm.naver_complex_id
        LIMIT 10000
      `
      
      this.naverDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    console.log(`🏡 ${listings.length}개의 매물 데이터 연결 중...`)

    let importedCount = 0
    for (const listing of listings) {
      try {
        const complexId = await this.findIntegratedComplexByNaverId(listing.complex_id)
        if (complexId) {
          await this.insertListing(complexId, listing)
          importedCount++
        }
      } catch (error) {
        console.error(`❌ 매물 연결 실패:`, error.message)
      }
    }

    this.stats.total_listings = importedCount
    console.log(`✅ ${importedCount}개 매물 연결 완료`)
  }

  async findIntegratedComplexByNaverId(naverComplexId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT apartment_complex_id FROM naver_complex_mapping 
        WHERE naver_complex_id = ?
        LIMIT 1
      `
      
      this.integratedDb.get(query, [naverComplexId], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.apartment_complex_id : null)
      })
    })
  }

  async insertListing(complexId, listingData) {
    const query = `
      INSERT INTO current_listings (
        apartment_complex_id, naver_listing_id, deal_type,
        price_sale, area_exclusive, floor_current
      ) VALUES (?, ?, ?, ?, ?, ?)
    `

    const values = [
      complexId,
      listingData.id,
      this.normalizeDealType(listingData.deal_type),
      this.parsePrice(listingData.price_amount),
      this.parseArea(listingData.area_sqm),
      this.parseFloor(listingData.floor_info)
    ]

    return new Promise((resolve, reject) => {
      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  normalizeDealType(dealType) {
    const typeMap = { '매매': '매매', '전세': '전세', '월세': '월세' }
    return typeMap[dealType] || '매매'
  }

  parsePrice(price) {
    if (!price) return null
    const cleaned = String(price).replace(/[^\d]/g, '')
    const parsed = parseInt(cleaned)
    return isNaN(parsed) ? null : parsed
  }

  parseArea(area) {
    if (!area) return null
    const parsed = parseFloat(area)
    return isNaN(parsed) ? null : parsed
  }

  parseFloor(floor) {
    if (!floor) return null
    const match = String(floor).match(/(\d+)/)
    return match ? parseInt(match[1]) : null
  }

  async calculateCrawlingPriorities() {
    console.log('📊 크롤링 우선순위 계산 중...')
    
    // 매칭되지 않은 단지들 중 거래량이 많은 순으로 우선순위 설정
    await new Promise((resolve, reject) => {
      const query = `
        UPDATE apartment_complexes 
        SET crawling_priority = (
          SELECT COUNT(tr.id) * 10 
          FROM transaction_records tr 
          WHERE tr.apartment_complex_id = apartment_complexes.id
        )
        WHERE naver_matched = FALSE
      `
      
      this.integratedDb.run(query, [], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // 크롤링 큐에 추가
    await this.populateCrawlingQueue()

    console.log('✅ 크롤링 우선순위 계산 완료')
  }

  async populateCrawlingQueue() {
    // 상위 우선순위 단지들을 크롤링 큐에 추가
    const highPriorityComplexes = await new Promise((resolve, reject) => {
      const query = `
        SELECT id, crawling_priority
        FROM apartment_complexes 
        WHERE naver_matched = FALSE
        ORDER BY crawling_priority DESC
        LIMIT 1000
      `
      
      this.integratedDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    for (const complex of highPriorityComplexes) {
      await this.addToCrawlingQueue(complex.id, 'both', complex.crawling_priority)
    }

    this.stats.crawling_queue = highPriorityComplexes.map(c => c.id)
  }

  async addToCrawlingQueue(complexId, crawlType, priority) {
    const query = `
      INSERT INTO crawling_queue (
        apartment_complex_id, crawl_type, priority
      ) VALUES (?, ?, ?)
    `

    return new Promise((resolve, reject) => {
      this.integratedDb.run(query, [complexId, crawlType, priority], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async generateReport() {
    console.log('📋 통합 결과 리포트 생성 중...')

    // 최종 통계 수집
    const finalStats = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          COUNT(*) as total_complexes,
          SUM(CASE WHEN naver_matched = 1 THEN 1 ELSE 0 END) as matched_complexes,
          SUM(CASE WHEN naver_matched = 0 THEN 1 ELSE 0 END) as unmatched_complexes,
          (SELECT COUNT(*) FROM transaction_records) as total_transactions,
          (SELECT COUNT(*) FROM current_listings) as total_listings,
          (SELECT COUNT(*) FROM crawling_queue) as crawling_queue_size
        FROM apartment_complexes
      `
      
      this.integratedDb.get(query, [], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    console.log('\n🎉 ===== 국토부 베이스 통합 완료 =====')
    console.log(`📊 총 아파트 단지: ${finalStats.total_complexes.toLocaleString()}개`)
    console.log(`✅ 네이버 매칭 완료: ${finalStats.matched_complexes.toLocaleString()}개`)
    console.log(`❌ 매칭 미완료: ${finalStats.unmatched_complexes.toLocaleString()}개`)
    console.log(`💰 총 실거래 내역: ${finalStats.total_transactions.toLocaleString()}건`)
    console.log(`🏠 총 매물 정보: ${finalStats.total_listings.toLocaleString()}개`)
    console.log(`⏳ 크롤링 대기: ${finalStats.crawling_queue_size.toLocaleString()}개`)
    console.log('======================================\n')

    // 지역별 통계
    await this.showRegionalStats()
  }

  async showRegionalStats() {
    const regionalStats = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          sido,
          sigungu,
          COUNT(*) as complex_count,
          SUM(CASE WHEN naver_matched = 1 THEN 1 ELSE 0 END) as matched_count
        FROM apartment_complexes
        GROUP BY sido, sigungu
        ORDER BY complex_count DESC
        LIMIT 20
      `
      
      this.integratedDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    console.log('🗺️ 지역별 통계 (상위 20개)')
    console.log('지역\t\t단지수\t매칭수')
    console.log('----------------------------')
    regionalStats.forEach(stat => {
      const region = `${stat.sido} ${stat.sigungu}`.padEnd(20)
      console.log(`${region}\t${stat.complex_count}\t${stat.matched_count}`)
    })
  }

  async run() {
    try {
      await this.initialize()
      await this.runFullIntegration()
      
      console.log('🎉 국토부 베이스 통합 시스템 구축 완료!')
      
    } catch (error) {
      console.error('❌ 통합 시스템 구축 실패:', error)
    } finally {
      if (this.molitDb) this.molitDb.close()
      if (this.naverDb) this.naverDb.close()
      if (this.integratedDb) this.integratedDb.close()
    }
  }
}

// 실행
const integrator = new MolitBaseIntegrator()
integrator.run()