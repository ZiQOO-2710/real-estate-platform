#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

class JsonToDbConverter {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data')
    this.outputDir = path.join(this.dataDir, 'output')
    this.dbPath = path.join(this.dataDir, 'naver_crawled_data.db')
    
    this.stats = {
      json_files_processed: 0,
      complexes_created: 0,
      listings_created: 0,
      errors: 0
    }
  }

  async initializeDatabase() {
    console.log('🔧 네이버 크롤링 DB 초기화 중...')
    
    // 기존 DB 삭제 (새로 시작)
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath)
    }
    
    this.db = new sqlite3.Database(this.dbPath)
    
    // 아파트 단지 테이블
    await this.runQuery(`
      CREATE TABLE apartment_complexes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id TEXT UNIQUE NOT NULL,
        complex_name TEXT,
        address TEXT,
        latitude REAL,
        longitude REAL,
        completion_year INTEGER,
        total_households INTEGER,
        total_buildings INTEGER,
        area_range TEXT,
        source_url TEXT,
        crawled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // 매물 정보 테이블
    await this.runQuery(`
      CREATE TABLE current_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id TEXT NOT NULL,
        listing_index INTEGER,
        deal_type TEXT,
        price_text TEXT,
        price_amount INTEGER,
        area_info TEXT,
        floor_info TEXT,
        direction TEXT,
        description TEXT,
        original_text TEXT,
        extracted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
      )
    `)
    
    // 크롤링 메타데이터 테이블
    await this.runQuery(`
      CREATE TABLE crawling_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complex_id TEXT NOT NULL,
        json_filename TEXT,
        crawler_version TEXT,
        crawl_method TEXT,
        crawled_at TIMESTAMP,
        processing_status TEXT DEFAULT 'processed',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // 인덱스 생성
    await this.runQuery("CREATE INDEX idx_complex_id ON current_listings(complex_id)")
    await this.runQuery("CREATE INDEX idx_deal_type ON current_listings(deal_type)")
    await this.runQuery("CREATE INDEX idx_complex_name ON apartment_complexes(complex_name)")
    
    console.log('✅ DB 스키마 생성 완료')
  }

  async runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve(this)
      })
    })
  }

  async getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  async processJsonFiles(limit = 100) {
    console.log('🚀 JSON 파일 처리 시작')
    
    const jsonFiles = fs.readdirSync(this.outputDir)
      .filter(file => file.startsWith('enhanced_complex_') && file.endsWith('.json'))
      .slice(0, limit)
    
    console.log(`📊 ${jsonFiles.length}개 파일 처리 예정`)
    
    for (const fileName of jsonFiles) {
      try {
        await this.processSingleJson(fileName)
        this.stats.json_files_processed++
        
        if (this.stats.json_files_processed % 20 === 0) {
          console.log(`✅ ${this.stats.json_files_processed}개 파일 처리 완료`)
          this.printStats()
        }
      } catch (error) {
        console.error(`❌ 파일 처리 실패 (${fileName}):`, error.message)
        this.stats.errors++
      }
    }
    
    this.printFinalStats()
  }

  async processSingleJson(fileName) {
    const filePath = path.join(this.outputDir, fileName)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(fileContent)
    
    // 1. 단지 정보 추출
    const complexInfo = this.extractComplexInfo(data)
    if (!complexInfo) {
      return
    }
    
    // 2. 단지 정보 저장
    await this.saveComplexInfo(complexInfo)
    
    // 3. 매물 정보 추출 및 저장
    const listings = this.extractListings(data, complexInfo.complex_id)
    for (const listing of listings) {
      await this.saveListing(listing)
    }
    
    // 4. 메타데이터 저장
    await this.saveMetadata(data, fileName)
  }

  extractComplexInfo(data) {
    const basicInfo = data.basic_info || {}
    const crawlerInfo = data.crawler_info || {}
    const listings = data.current_listings || []
    
    const complexId = basicInfo.complexId || crawlerInfo.complex_id
    if (!complexId) {
      return null
    }
    
    // 매물에서 단지명 추출
    const complexName = this.extractComplexNameFromListings(listings)
    
    // 좌표 추출 (URL에서)
    const coords = this.extractCoordinates(basicInfo.url || '')
    
    return {
      complex_id: String(complexId),
      complex_name: complexName,
      address: this.extractAddressFromUrl(basicInfo.url || ''),
      latitude: coords.lat,
      longitude: coords.lng,
      source_url: basicInfo.source_url || basicInfo.url,
      crawled_at: crawlerInfo.crawled_at || basicInfo.extracted_at,
      listing_count: listings.length
    }
  }

  extractComplexNameFromListings(listings) {
    if (!listings || listings.length === 0) {
      return '정보없음'
    }
    
    for (const listing of listings.slice(0, 3)) {
      const text = listing.text || ''
      if (text) {
        // "정든한진6차 601동매매14억..." 패턴에서 단지명 추출
        const match = text.match(/^([^\s]+(?:\s*\d+차)?)/)
        if (match) {
          const name = match[1].trim()
          // 일반적이지 않은 이름 필터링
          if (name.length > 2 && !name.includes('동매매') && !name.includes('동전세')) {
            return name
          }
        }
      }
    }
    
    return '정보없음'
  }

  extractCoordinates(url) {
    if (!url) {
      return { lat: null, lng: null }
    }
    
    // ms=37.36286,127.115578,17 패턴에서 좌표 추출
    const match = url.match(/ms=([0-9.]+),([0-9.]+)/)
    if (match) {
      return {
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      }
    }
    
    return { lat: null, lng: null }
  }

  extractAddressFromUrl(url) {
    if (!url) {
      return ''
    }
    
    const coords = this.extractCoordinates(url)
    if (coords.lat && coords.lng) {
      return `추정좌표: ${coords.lat}, ${coords.lng}`
    }
    
    return ''
  }

  extractListings(data, complexId) {
    const listings = data.current_listings || []
    const result = []
    
    for (const listing of listings) {
      const dealType = this.normalizeDealType(listing.deal_type)
      if (!dealType) {
        continue
      }
      
      const priceAmount = this.parsePrice(listing.price)
      
      result.push({
        complex_id: complexId,
        listing_index: listing.index,
        deal_type: dealType,
        price_text: listing.price,
        price_amount: priceAmount,
        area_info: listing.area,
        floor_info: listing.floor,
        description: this.cleanText(listing.text || ''),
        original_text: listing.text,
        extracted_at: listing.extracted_at
      })
    }
    
    return result
  }

  normalizeDealType(dealType) {
    if (!dealType) {
      return null
    }
    
    const normalized = dealType.toLowerCase().trim()
    if (normalized.includes('매매') || normalized === 'sale') {
      return '매매'
    } else if (normalized.includes('전세') || normalized === 'jeonse') {
      return '전세'
    } else if (normalized.includes('월세') || normalized === 'monthly') {
      return '월세'
    }
    
    return null
  }

  parsePrice(priceStr) {
    if (!priceStr) {
      return null
    }
    
    // "14억 5,000", "8억", "22억" 등의 형식 파싱
    const cleanPrice = priceStr.replace(/[,\s]/g, '')
    
    // 억원 단위 추출
    const billionMatch = cleanPrice.match(/(\d+(?:\.\d+)?)억/)
    if (billionMatch) {
      let amount = parseFloat(billionMatch[1]) * 10000 // 만원 단위로 변환
      
      // 천만원 단위 추가
      const thousandMatch = cleanPrice.match(/(\d+)천/)
      if (thousandMatch) {
        amount += parseInt(thousandMatch[1]) * 1000
      }
      
      return Math.round(amount)
    }
    
    // 만원 단위만 있는 경우
    const millionMatch = cleanPrice.match(/(\d+)만/)
    if (millionMatch) {
      return parseInt(millionMatch[1])
    }
    
    return null
  }

  cleanText(text) {
    if (!text) {
      return ''
    }
    
    // 단지명 부분 제거하고 설명만 추출
    const parts = text.split(' ')
    if (parts.length >= 3) {
      return parts.slice(2).join(' ') // 단지명과 동호수 제거
    }
    
    return text
  }

  async saveComplexInfo(complexInfo) {
    try {
      await this.runQuery(`
        INSERT OR REPLACE INTO apartment_complexes 
        (complex_id, complex_name, address, latitude, longitude, 
         source_url, crawled_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        complexInfo.complex_id,
        complexInfo.complex_name,
        complexInfo.address,
        complexInfo.latitude,
        complexInfo.longitude,
        complexInfo.source_url,
        complexInfo.crawled_at
      ])
      
      this.stats.complexes_created++
      
    } catch (error) {
      // 중복 시 업데이트
      await this.runQuery(`
        UPDATE apartment_complexes 
        SET complex_name = ?, address = ?, latitude = ?, longitude = ?
        WHERE complex_id = ?
      `, [
        complexInfo.complex_name,
        complexInfo.address,
        complexInfo.latitude,
        complexInfo.longitude,
        complexInfo.complex_id
      ])
    }
  }

  async saveListing(listing) {
    await this.runQuery(`
      INSERT INTO current_listings 
      (complex_id, listing_index, deal_type, price_text, price_amount,
       area_info, floor_info, description, original_text, extracted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      listing.complex_id,
      listing.listing_index,
      listing.deal_type,
      listing.price_text,
      listing.price_amount,
      listing.area_info,
      listing.floor_info,
      listing.description,
      listing.original_text,
      listing.extracted_at
    ])
    
    this.stats.listings_created++
  }

  async saveMetadata(data, filename) {
    const basicInfo = data.basic_info || {}
    const crawlerInfo = data.crawler_info || {}
    
    const complexId = basicInfo.complexId || crawlerInfo.complex_id
    
    await this.runQuery(`
      INSERT INTO crawling_metadata 
      (complex_id, json_filename, crawler_version, crawl_method, crawled_at)
      VALUES (?, ?, ?, ?, ?)
    `, [
      String(complexId),
      filename,
      crawlerInfo.version,
      crawlerInfo.crawl_method,
      crawlerInfo.crawled_at
    ])
  }

  printStats() {
    console.log(`   📊 현재까지: 단지 ${this.stats.complexes_created}개, 매물 ${this.stats.listings_created}개`)
  }

  async printFinalStats() {
    console.log('\n' + '='.repeat(60))
    console.log('🎉 JSON → DB 변환 완료!')
    console.log('='.repeat(60))
    console.log(`📊 최종 변환 결과:`)
    console.log(`   • JSON 파일 처리: ${this.stats.json_files_processed}개`)
    console.log(`   • 아파트 단지 생성: ${this.stats.complexes_created}개`)
    console.log(`   • 매물 정보 생성: ${this.stats.listings_created}개`)
    console.log(`   • 오류 발생: ${this.stats.errors}개`)
    
    // DB 최종 확인
    const complexCount = await this.getQuery("SELECT COUNT(*) as count FROM apartment_complexes")
    const listingCount = await this.getQuery("SELECT COUNT(*) as count FROM current_listings")
    
    console.log(`\n✅ DB 최종 상태:`)
    console.log(`   • 총 단지 수: ${complexCount.count}개`)
    console.log(`   • 총 매물 수: ${listingCount.count}개`)
    console.log(`   • DB 파일: ${this.dbPath}`)
    
    // 샘플 데이터 확인
    console.log('\n📋 실제 단지명 샘플:')
    const samples = await new Promise((resolve, reject) => {
      this.db.all(`
        SELECT c.complex_name, COUNT(l.id) as listing_count 
        FROM apartment_complexes c 
        LEFT JOIN current_listings l ON c.complex_id = l.complex_id 
        WHERE c.complex_name != '정보없음'
        GROUP BY c.complex_id 
        ORDER BY listing_count DESC 
        LIMIT 5
      `, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
    
    samples.forEach(row => {
      console.log(`   • ${row.complex_name}: ${row.listing_count}개 매물`)
    })
    
    console.log('='.repeat(60))
  }

  async run(limit = 100) {
    try {
      await this.initializeDatabase()
      await this.processJsonFiles(limit)
      
    } catch (error) {
      console.error(`❌ 변환 실패:`, error)
    } finally {
      if (this.db) {
        this.db.close()
      }
    }
  }
}

// 실행
if (require.main === module) {
  const converter = new JsonToDbConverter()
  converter.run(100) // 처음 100개 파일만 처리
}

module.exports = JsonToDbConverter