/**
 * 부동산 데이터 통합 서비스
 * 단지정보, 매물호가, 실거래가 데이터를 통합하여 정규화된 스키마로 저장
 */

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs').promises
const path = require('path')

class DataIntegrationService {
  constructor(dbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/master_integrated_real_estate.db') {
    this.dbPath = dbPath
    this.db = null
    this.COORDINATE_THRESHOLD = 0.0001 // 약 11m
    this.ADDRESS_SIMILARITY_THRESHOLD = 0.85
    this.NAME_SIMILARITY_THRESHOLD = 0.8
  }

  /**
   * 데이터베이스 초기화
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          reject(err)
          return
        }

        try {
          await this.createTables()
          console.log('✅ 통합 데이터베이스 초기화 완료')
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  /**
   * 스키마 생성
   */
  async createTables() {
    const schemaPath = path.join(__dirname, '../database/unified_schema.sql')
    console.log('스키마 파일 경로:', schemaPath)
    
    // 파일 존재 확인
    try {
      await fs.access(schemaPath)
      console.log('✅ 스키마 파일 존재 확인')
    } catch (error) {
      console.error('❌ 스키마 파일이 없습니다:', schemaPath)
      throw error
    }
    
    const schema = await fs.readFile(schemaPath, 'utf8')
    
    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  /**
   * 메인 통합 프로세스
   */
  async integrateAllData(complexes, listings, transactions) {
    console.log('🚀 데이터 통합 프로세스 시작')
    
    const integrationStats = {
      complexes: { processed: 0, matched: 0, created: 0 },
      listings: { processed: 0, matched: 0, created: 0 },
      transactions: { processed: 0, matched: 0, created: 0 },
      errors: []
    }

    try {
      // 1단계: 단지 데이터 정규화 및 통합
      console.log('📊 1단계: 단지 데이터 통합 중...')
      await this.integrateComplexes(complexes, integrationStats)

      // 2단계: 매물 데이터 연결
      console.log('🏠 2단계: 매물 데이터 연결 중...')
      await this.integrateListings(listings, integrationStats)

      // 3단계: 실거래가 데이터 연결
      console.log('💰 3단계: 실거래가 데이터 연결 중...')
      await this.integrateTransactions(transactions, integrationStats)

      // 4단계: 데이터 품질 검증
      console.log('🔍 4단계: 데이터 품질 검증 중...')
      await this.validateDataQuality()

      console.log('✅ 데이터 통합 완료:', integrationStats)
      return integrationStats

    } catch (error) {
      console.error('❌ 데이터 통합 실패:', error)
      integrationStats.errors.push(error.message)
      throw error
    }
  }

  /**
   * 단지 데이터 통합
   */
  async integrateComplexes(complexes, stats) {
    for (const complex of complexes) {
      try {
        stats.complexes.processed++

        // 데이터 정제
        const cleanedComplex = this.cleanComplexData(complex)
        
        // 기존 단지 검색
        const existingComplex = await this.findExistingComplex(cleanedComplex)
        
        if (existingComplex) {
          // 기존 단지 업데이트
          await this.updateComplex(existingComplex.id, cleanedComplex, complex)
          stats.complexes.matched++
        } else {
          // 새 단지 생성
          const complexId = await this.createComplex(cleanedComplex, complex)
          stats.complexes.created++
        }

      } catch (error) {
        console.error(`단지 처리 실패 (ID: ${complex.complex_id}):`, error)
        stats.errors.push(`Complex ${complex.complex_id}: ${error.message}`)
      }
    }
  }

  /**
   * 매물 데이터 통합
   */
  async integrateListings(listings, stats) {
    for (const listing of listings) {
      try {
        stats.listings.processed++

        // 연결할 단지 찾기
        const complexId = await this.findComplexForListing(listing)
        
        if (complexId) {
          const cleanedListing = this.cleanListingData(listing)
          await this.createListing(complexId, cleanedListing)
          stats.listings.matched++
        } else {
          console.warn(`매물 ${listing.id}: 연결할 단지를 찾을 수 없음`)
        }

      } catch (error) {
        console.error(`매물 처리 실패 (ID: ${listing.id}):`, error)
        stats.errors.push(`Listing ${listing.id}: ${error.message}`)
      }
    }
  }

  /**
   * 실거래가 데이터 통합
   */
  async integrateTransactions(transactions, stats) {
    for (const transaction of transactions) {
      try {
        stats.transactions.processed++

        // 연결할 단지 찾기
        const complexId = await this.findComplexForTransaction(transaction)
        
        if (complexId) {
          const cleanedTransaction = this.cleanTransactionData(transaction)
          await this.createTransaction(complexId, cleanedTransaction)
          stats.transactions.matched++
        } else {
          console.warn(`거래 ${transaction.id}: 연결할 단지를 찾을 수 없음`)
        }

      } catch (error) {
        console.error(`거래 처리 실패 (ID: ${transaction.id}):`, error)
        stats.errors.push(`Transaction ${transaction.id}: ${error.message}`)
      }
    }
  }

  /**
   * 기존 단지 검색 (다단계 매칭)
   */
  async findExistingComplex(complexData) {
    // 1순위: 좌표 매칭
    if (complexData.latitude && complexData.longitude) {
      const coordMatch = await this.findByCoordinates(
        complexData.latitude, 
        complexData.longitude
      )
      if (coordMatch) {
        await this.logMatching(coordMatch.id, 'coordinate', 1.0)
        return coordMatch
      }
    }

    // 2순위: 지번 주소 매칭
    if (complexData.address_jibun) {
      const jibunMatch = await this.findByAddress(complexData.address_jibun, 'jibun')
      if (jibunMatch) {
        await this.logMatching(jibunMatch.id, 'jibun_address', 0.9)
        return jibunMatch
      }
    }

    // 3순위: 도로명 주소 매칭
    if (complexData.address_road) {
      const roadMatch = await this.findByAddress(complexData.address_road, 'road')
      if (roadMatch) {
        await this.logMatching(roadMatch.id, 'road_address', 0.85)
        return roadMatch
      }
    }

    // 4순위: 단지명 유사도 매칭
    if (complexData.name) {
      const nameMatch = await this.findByNameSimilarity(complexData.name, complexData.sigungu)
      if (nameMatch) {
        await this.logMatching(nameMatch.id, 'name_similarity', nameMatch.similarity)
        return nameMatch
      }
    }

    return null
  }

  /**
   * 좌표 기반 검색
   */
  async findByCoordinates(lat, lng) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM apartment_complexes 
        WHERE ABS(latitude - ?) < ? AND ABS(longitude - ?) < ?
        ORDER BY 
          (ABS(latitude - ?) + ABS(longitude - ?)) ASC
        LIMIT 1
      `
      
      this.db.get(query, [
        lat, this.COORDINATE_THRESHOLD,
        lng, this.COORDINATE_THRESHOLD,
        lat, lng
      ], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  /**
   * 주소 기반 검색
   */
  async findByAddress(address, type) {
    const normalizedAddress = this.normalizeAddress(address)
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM apartment_complexes 
        WHERE address_normalized LIKE ?
        ORDER BY LENGTH(address_normalized) ASC
        LIMIT 1
      `
      
      this.db.get(query, [`%${normalizedAddress}%`], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  /**
   * 단지명 유사도 검색
   */
  async findByNameSimilarity(name, region) {
    return new Promise((resolve, reject) => {
      let query = `SELECT * FROM apartment_complexes WHERE 1=1`
      const params = []

      if (region) {
        query += ` AND sigungu = ?`
        params.push(region)
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err)
          return
        }

        let bestMatch = null
        let bestSimilarity = 0

        for (const row of rows) {
          const similarity = this.calculateStringSimilarity(name, row.name)
          if (similarity > bestSimilarity && similarity >= this.NAME_SIMILARITY_THRESHOLD) {
            bestSimilarity = similarity
            bestMatch = { ...row, similarity }
          }
        }

        resolve(bestMatch)
      })
    })
  }

  /**
   * 기존 단지 업데이트
   */
  async updateComplex(existingId, complexData, originalData) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE apartment_complexes SET
          name = COALESCE(?, name),
          name_variations = ?,
          address_jibun = COALESCE(?, address_jibun),
          address_road = COALESCE(?, address_road),
          address_normalized = COALESCE(?, address_normalized),
          completion_year = COALESCE(?, completion_year),
          total_households = COALESCE(?, total_households),
          total_buildings = COALESCE(?, total_buildings),
          area_range = COALESCE(?, area_range),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `

      const values = [
        complexData.name,
        JSON.stringify(complexData.name_variations || []),
        complexData.address_jibun,
        complexData.address_road,
        complexData.address_normalized,
        complexData.completion_year,
        complexData.total_households,
        complexData.total_buildings,
        complexData.area_range,
        existingId
      ]

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err)
        } else {
          resolve(existingId)
        }
      })
    })
  }

  /**
   * 새 단지 생성
   */
  async createComplex(complexData, originalData) {
    const complexCode = this.generateComplexCode(complexData)
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO apartment_complexes (
          complex_code, name, name_variations,
          latitude, longitude,
          address_jibun, address_road, address_normalized,
          sido, sigungu, eup_myeon_dong,
          completion_year, total_households, total_buildings, area_range,
          data_sources, confidence_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      const values = [
        complexCode,
        complexData.name,
        JSON.stringify(complexData.name_variations || []),
        complexData.latitude,
        complexData.longitude,
        complexData.address_jibun,
        complexData.address_road,
        complexData.address_normalized,
        complexData.sido,
        complexData.sigungu,
        complexData.eup_myeon_dong,
        complexData.completion_year,
        complexData.total_households,
        complexData.total_buildings,
        complexData.area_range,
        JSON.stringify([originalData.source || 'unknown']),
        1.0
      ]

      this.db.run(query, values, function(err) {
        if (err) {
          reject(err)
        } else {
          // 소스 매핑 생성
          resolve(this.lastID)
        }
      })
    })
  }

  /**
   * 매물 생성
   */
  async createListing(complexId, listingData) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO current_listings (
          apartment_complex_id, listing_id, listing_url,
          deal_type, price_sale, price_jeonse, price_monthly, deposit,
          area_exclusive, area_supply, floor_current, floor_total,
          direction, room_structure, description, raw_text,
          status, crawled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      const values = [
        complexId,
        listingData.listing_id,
        listingData.listing_url,
        listingData.deal_type,
        listingData.price_sale,
        listingData.price_jeonse,
        listingData.price_monthly,
        listingData.deposit,
        listingData.area_exclusive,
        listingData.area_supply,
        listingData.floor_current,
        listingData.floor_total,
        listingData.direction,
        listingData.room_structure,
        listingData.description,
        listingData.raw_text,
        'active',
        listingData.crawled_at
      ]

      this.db.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  /**
   * 실거래가 생성
   */
  async createTransaction(complexId, transactionData) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO transaction_records (
          apartment_complex_id, deal_type, deal_date, deal_amount,
          monthly_rent, area_exclusive, floor_current,
          building_name, unit_number, data_source, original_record_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `

      const values = [
        complexId,
        transactionData.deal_type,
        transactionData.deal_date,
        transactionData.deal_amount,
        transactionData.monthly_rent,
        transactionData.area_exclusive,
        transactionData.floor_current,
        transactionData.building_name,
        transactionData.unit_number,
        transactionData.data_source || 'molit',
        transactionData.original_record_id
      ]

      this.db.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  /**
   * 데이터 정제 메서드들
   */
  cleanComplexData(complex) {
    return {
      name: this.cleanString(complex.complex_name || complex.name),
      name_variations: this.extractNameVariations(complex),
      latitude: this.parseCoordinate(complex.latitude),
      longitude: this.parseCoordinate(complex.longitude),
      address_jibun: this.cleanString(complex.address || complex.jibun_address),
      address_road: this.cleanString(complex.road_address),
      address_normalized: this.normalizeAddress(complex.address || ''),
      sido: this.extractSido(complex.address),
      sigungu: this.extractSigungu(complex.address),
      eup_myeon_dong: this.extractEupMyeonDong(complex.address),
      completion_year: this.parseYear(complex.completion_year),
      total_households: this.parseInteger(complex.total_households),
      total_buildings: this.parseInteger(complex.total_buildings),
      area_range: this.cleanString(complex.area_range)
    }
  }

  cleanListingData(listing) {
    return {
      listing_id: String(listing.id || listing.listing_id),
      listing_url: listing.listing_url,
      deal_type: this.standardizeDealType(listing.deal_type),
      price_sale: this.parsePrice(listing.price_amount, listing.deal_type, 'sale'),
      price_jeonse: this.parsePrice(listing.deposit_amount, listing.deal_type, 'jeonse'),
      price_monthly: this.parsePrice(listing.monthly_rent, listing.deal_type, 'monthly'),
      deposit: this.parsePrice(listing.deposit_amount),
      area_exclusive: this.parseArea(listing.area_sqm),
      area_supply: this.parseArea(listing.area_supply),
      floor_current: this.parseFloor(listing.floor_info),
      floor_total: this.parseFloor(listing.floor_total),
      direction: this.cleanString(listing.direction),
      room_structure: this.cleanString(listing.room_structure),
      description: this.cleanString(listing.description),
      raw_text: listing.raw_text,
      crawled_at: listing.crawled_at || listing.extracted_at
    }
  }

  cleanTransactionData(transaction) {
    return {
      deal_type: this.standardizeDealType(transaction.deal_type),
      deal_date: this.parseDate(transaction.deal_year, transaction.deal_month, transaction.deal_day),
      deal_amount: this.parsePrice(transaction.deal_amount),
      monthly_rent: this.parsePrice(transaction.monthly_rent),
      area_exclusive: this.parseArea(transaction.area),
      floor_current: this.parseFloor(transaction.floor),
      building_name: this.cleanString(transaction.building_name),
      unit_number: this.cleanString(transaction.unit_number),
      data_source: transaction.data_source || 'molit',
      original_record_id: String(transaction.id)
    }
  }

  /**
   * 유틸리티 메서드들
   */
  cleanString(str) {
    if (!str) return null
    return String(str).trim().replace(/\s+/g, ' ') || null
  }

  parseCoordinate(coord) {
    if (!coord) return null
    const parsed = parseFloat(coord)
    return isNaN(parsed) ? null : parsed
  }

  parseInteger(val) {
    if (!val) return null
    const parsed = parseInt(val)
    return isNaN(parsed) ? null : parsed
  }

  parsePrice(price, dealType = null, priceType = null) {
    if (!price) return null
    
    // 문자열에서 숫자 추출
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
    
    // "3/15층", "3층" 등에서 현재층 추출
    const match = String(floor).match(/(\d+)/)
    return match ? parseInt(match[1]) : null
  }

  parseDate(year, month, day) {
    if (!year || !month || !day) return null
    
    try {
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
      return date.toISOString().split('T')[0] // YYYY-MM-DD 형식
    } catch (error) {
      return null
    }
  }

  normalizeAddress(address) {
    if (!address) return ''
    
    return address
      .replace(/[^\w\s가-힣]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  extractSido(address) {
    if (!address) return null
    const match = address.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/)
    return match ? match[1] : null
  }

  extractSigungu(address) {
    if (!address) return null
    const match = address.match(/(\w+[시군구])/)
    return match ? match[1] : null
  }

  extractEupMyeonDong(address) {
    if (!address) return null
    const match = address.match(/(\w+[읍면동])/)
    return match ? match[1] : null
  }

  parseYear(year) {
    if (!year) return null
    const parsed = parseInt(year)
    return isNaN(parsed) ? null : parsed
  }

  extractNameVariations(complex) {
    const variations = []
    const baseName = complex.complex_name || complex.name
    
    if (baseName) {
      variations.push(baseName)
      
      // 아파트, 단지 등의 접미사 제거한 버전
      const withoutSuffix = baseName.replace(/(아파트|단지|빌라|타운|마을|힐스|파크|빌딩)$/g, '').trim()
      if (withoutSuffix && withoutSuffix !== baseName) {
        variations.push(withoutSuffix)
      }
      
      // 괄호 내용 제거한 버전
      const withoutParens = baseName.replace(/\([^)]*\)/g, '').trim()
      if (withoutParens && withoutParens !== baseName) {
        variations.push(withoutParens)
      }
    }
    
    return [...new Set(variations)] // 중복 제거
  }

  standardizeDealType(dealType) {
    if (!dealType) return null
    
    const typeMap = {
      '매매': '매매',
      '전세': '전세', 
      '월세': '월세',
      '단기임대': '단기임대',
      'sale': '매매',
      'jeonse': '전세',
      'monthly': '월세'
    }
    
    return typeMap[dealType] || dealType
  }

  generateComplexCode(complexData) {
    // 지역코드 + 좌표해시 기반 고유코드 생성
    const region = (complexData.sigungu || 'UNKN').substring(0, 4)
    const coordHash = this.hashCoordinates(complexData.latitude, complexData.longitude)
    return `${region}_${coordHash}_${Date.now()}`
  }

  hashCoordinates(lat, lng) {
    if (!lat || !lng) return 'COORD000'
    
    const latStr = lat.toString().replace('.', '')
    const lngStr = lng.toString().replace('.', '')
    const combined = latStr + lngStr
    
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 32bit integer로 변환
    }
    
    return Math.abs(hash).toString(36).substring(0, 8).toUpperCase()
  }

  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    
    // Jaro-Winkler 알고리즘 간단 구현
    const s1 = str1.toLowerCase()
    const s2 = str2.toLowerCase()
    
    if (s1 === s2) return 1.0
    
    const len1 = s1.length
    const len2 = s2.length
    const maxDistance = Math.floor(Math.max(len1, len2) / 2) - 1
    
    let matches = 0
    const s1Matches = new Array(len1).fill(false)
    const s2Matches = new Array(len2).fill(false)
    
    // 매칭 문자 찾기
    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - maxDistance)
      const end = Math.min(i + maxDistance + 1, len2)
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue
        s1Matches[i] = true
        s2Matches[j] = true
        matches++
        break
      }
    }
    
    if (matches === 0) return 0
    
    // 전치 계산
    let transpositions = 0
    let k = 0
    for (let i = 0; i < len1; i++) {
      if (!s1Matches[i]) continue
      while (!s2Matches[k]) k++
      if (s1[i] !== s2[k]) transpositions++
      k++
    }
    
    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3
    
    // Winkler 보정 (공통 접두사)
    let prefix = 0
    for (let i = 0; i < Math.min(len1, len2, 4); i++) {
      if (s1[i] === s2[i]) prefix++
      else break
    }
    
    return jaro + (0.1 * prefix * (1 - jaro))
  }

  async findComplexForListing(listing) {
    // 매물의 complex_id를 통해 단지 찾기
    if (listing.complex_id) {
      return new Promise((resolve, reject) => {
        const query = `
          SELECT ac.id 
          FROM apartment_complexes ac
          JOIN source_complex_mapping scm ON ac.id = scm.apartment_complex_id
          WHERE scm.source_id = ? AND scm.source_type = 'naver'
        `
        
        this.db.get(query, [listing.complex_id], (err, row) => {
          if (err) reject(err)
          else resolve(row ? row.id : null)
        })
      })
    }
    
    return null
  }

  async findComplexForTransaction(transaction) {
    // 아파트명과 지역으로 단지 찾기
    if (transaction.apartment_name && transaction.region_name) {
      const nameMatch = await this.findByNameSimilarity(
        transaction.apartment_name, 
        transaction.region_name
      )
      return nameMatch ? nameMatch.id : null
    }
    
    return null
  }

  async logMatching(complexId, method, confidence) {
    // 매칭 로그 기록 (선택사항)
    console.log(`매칭 성공: Complex ${complexId}, Method: ${method}, Confidence: ${confidence}`)
  }

  async validateDataQuality() {
    // 데이터 품질 검증 로직
    const checks = [
      this.checkDuplicateComplexes(),
      this.checkOrphanedListings(),
      this.checkInvalidCoordinates(),
      this.checkPriceAnomalies()
    ]
    
    const results = await Promise.all(checks)
    console.log('데이터 품질 검증 완료:', results)
  }

  async checkDuplicateComplexes() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT latitude, longitude, COUNT(*) as count
        FROM apartment_complexes 
        GROUP BY ROUND(latitude, 4), ROUND(longitude, 4)
        HAVING COUNT(*) > 1
      `
      
      this.db.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve({ duplicateCoordinates: rows.length })
      })
    })
  }

  async checkOrphanedListings() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM current_listings cl
        LEFT JOIN apartment_complexes ac ON cl.apartment_complex_id = ac.id
        WHERE ac.id IS NULL
      `
      
      this.db.get(query, [], (err, row) => {
        if (err) reject(err)
        else resolve({ orphanedListings: row.count })
      })
    })
  }

  async checkInvalidCoordinates() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM apartment_complexes 
        WHERE latitude IS NULL OR longitude IS NULL 
           OR latitude < 33 OR latitude > 39
           OR longitude < 124 OR longitude > 132
      `
      
      this.db.get(query, [], (err, row) => {
        if (err) reject(err)
        else resolve({ invalidCoordinates: row.count })
      })
    })
  }

  async checkPriceAnomalies() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM current_listings 
        WHERE price_sale > 1000000 OR price_sale < 0  -- 100억 초과 또는 음수
           OR price_jeonse > 500000 OR price_jeonse < 0  -- 50억 초과 또는 음수  
           OR price_monthly > 10000 OR price_monthly < 0  -- 1000만원 초과 또는 음수
      `
      
      this.db.get(query, [], (err, row) => {
        if (err) reject(err)
        else resolve({ priceAnomalies: row.count })
      })
    })
  }

  /**
   * 통합 데이터 조회 API
   */
  async getComplexWithDetails(complexId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          ac.*,
          COUNT(DISTINCT cl.id) as active_listings,
          COUNT(DISTINCT tr.id) as transaction_count,
          AVG(tr.deal_amount) as avg_transaction_price,
          MIN(cl.price_sale) as min_listing_price,
          MAX(cl.price_sale) as max_listing_price
        FROM apartment_complexes ac
        LEFT JOIN current_listings cl ON ac.id = cl.apartment_complex_id AND cl.status = 'active'
        LEFT JOIN transaction_records tr ON ac.id = tr.apartment_complex_id
        WHERE ac.id = ?
        GROUP BY ac.id
      `
      
      this.db.get(query, [complexId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  async searchIntegratedComplexes(searchParams) {
    const {
      keyword,
      region,
      priceMin,
      priceMax,
      dealType = '매매',
      limit = 50,
      offset = 0
    } = searchParams

    // 📍 좌표 데이터 안정성을 위해 쿼리 개선
    let query = `
      SELECT DISTINCT
        ac.id,
        ac.complex_code,
        ac.name,
        ac.name_variations,
        ac.latitude,
        ac.longitude,
        ac.address_jibun,
        ac.address_road,
        ac.address_normalized,
        ac.sido,
        ac.sigungu,
        ac.eup_myeon_dong,
        ac.completion_year,
        ac.total_households,
        ac.total_buildings,
        ac.area_range,
        ac.data_sources,
        ac.confidence_score,
        ac.created_at,
        ac.updated_at,
        COUNT(DISTINCT cl.id) as listing_count,
        AVG(cl.price_sale) as avg_listing_price,
        AVG(tr.deal_amount) as avg_transaction_price
      FROM apartment_complexes ac
      LEFT JOIN current_listings cl ON ac.id = cl.apartment_complex_id 
        AND cl.status = 'active' AND cl.deal_type = ?
      LEFT JOIN transaction_records tr ON ac.id = tr.apartment_complex_id 
        AND tr.deal_type = ?
      WHERE ac.latitude IS NOT NULL 
        AND ac.longitude IS NOT NULL
        AND ac.latitude BETWEEN 33.0 AND 39.0
        AND ac.longitude BETWEEN 124.0 AND 132.0
    `
    
    const params = [dealType, dealType]

    if (keyword) {
      query += ` AND (ac.name LIKE ? OR ac.address_normalized LIKE ?)`
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    if (region) {
      query += ` AND ac.sigungu LIKE ?`
      params.push(`%${region}%`)
    }

    if (priceMin) {
      query += ` AND (cl.price_sale >= ? OR tr.deal_amount >= ?)`
      params.push(priceMin, priceMin)
    }

    if (priceMax) {
      query += ` AND (cl.price_sale <= ? OR tr.deal_amount <= ?)`
      params.push(priceMax, priceMax)
    }

    query += `
      GROUP BY ac.id
      ORDER BY ac.created_at DESC
      LIMIT ? OFFSET ?
    `
    params.push(limit, offset)

    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  /**
   * 리소스 정리
   */
  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) console.error('데이터베이스 종료 오류:', err)
          resolve()
        })
      })
    }
  }
}

module.exports = DataIntegrationService