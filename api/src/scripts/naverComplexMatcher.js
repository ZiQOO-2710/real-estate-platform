#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')

class NaverComplexMatcher {
  constructor() {
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/integrated_real_estate.db'
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_real_estate.db'
    this.integratedDb = null
    this.naverDb = null
    
    this.matchingStats = {
      exact_name_matches: 0,
      fuzzy_name_matches: 0,
      region_matches: 0,
      new_complexes_added: 0,
      failed_matches: 0,
      total_processed: 0
    }
  }

  async initialize() {
    console.log('🔧 네이버-국토부 단지 매칭 시스템 초기화 중...')
    
    this.integratedDb = new sqlite3.Database(this.integratedDbPath)
    this.naverDb = new sqlite3.Database(this.naverDbPath)
    
    console.log('✅ 데이터베이스 연결 완료')
  }

  async matchNaverComplexes() {
    console.log('🚀 네이버 단지 매칭 프로세스 시작')

    // 1. 네이버 단지 데이터 조회
    const naverComplexes = await this.getNaverComplexes()
    console.log(`📊 네이버 단지 ${naverComplexes.length}개 처리 시작`)

    // 2. 기존 통합 단지 조회 (이름 기준 매칭용)
    const existingComplexes = await this.getExistingComplexes()
    console.log(`📋 기존 통합 단지 ${existingComplexes.length}개 확인`)

    // 3. 매칭 처리
    let processedCount = 0
    const batchSize = 50

    for (let i = 0; i < naverComplexes.length; i += batchSize) {
      const batch = naverComplexes.slice(i, i + batchSize)
      console.log(`\n🔄 배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(naverComplexes.length/batchSize)} 처리 중 (${batch.length}개 단지)`)

      for (const naverComplex of batch) {
        try {
          await this.processNaverComplex(naverComplex, existingComplexes)
          processedCount++
          
          if (processedCount % 25 === 0) {
            console.log(`   ✅ ${processedCount}개 단지 처리 완료`)
          }
        } catch (error) {
          console.error(`   ❌ 단지 매칭 실패 (${naverComplex.complex_id}):`, error.message)
          this.matchingStats.failed_matches++
        }
      }

      // 배치마다 중간 통계 출력
      this.printIntermediateStats()
    }

    this.matchingStats.total_processed = processedCount
    this.printFinalStats()
  }

  async getNaverComplexes() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          complex_id,
          complex_name,
          address,
          completion_year,
          total_households,
          total_buildings
        FROM apartment_complexes
        WHERE complex_name IS NOT NULL 
          AND complex_name != '' 
          AND complex_name != '정보없음'
        ORDER BY complex_id
        LIMIT 200
      `
      
      this.naverDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }

  async getExistingComplexes() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          id, complex_code, name, sido, sigungu, eup_myeon_dong,
          completion_year, total_households
        FROM apartment_complexes
      `
      
      this.integratedDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }

  async processNaverComplex(naverComplex, existingComplexes) {
    // 1. 기존 매핑 확인
    const existingMapping = await this.findExistingMapping(naverComplex.complex_id)
    if (existingMapping) {
      return // 이미 매핑됨
    }

    // 2. 정확한 이름 매칭 시도
    const exactMatch = this.findExactNameMatch(naverComplex, existingComplexes)
    if (exactMatch) {
      await this.createMapping(exactMatch.id, naverComplex.complex_id, 'exact_name', 0.95)
      await this.updateComplexWithNaverData(exactMatch.id, naverComplex)
      this.matchingStats.exact_name_matches++
      return
    }

    // 3. 유사 이름 매칭 시도
    const fuzzyMatch = this.findFuzzyNameMatch(naverComplex, existingComplexes)
    if (fuzzyMatch.score > 0.8) {
      await this.createMapping(fuzzyMatch.complex.id, naverComplex.complex_id, 'fuzzy_name', fuzzyMatch.score)
      await this.updateComplexWithNaverData(fuzzyMatch.complex.id, naverComplex)
      this.matchingStats.fuzzy_name_matches++
      return
    }

    // 4. 지역 기반 매칭 시도
    const regionMatch = this.findRegionMatch(naverComplex, existingComplexes)
    if (regionMatch.score > 0.7) {
      await this.createMapping(regionMatch.complex.id, naverComplex.complex_id, 'region_based', regionMatch.score)
      await this.updateComplexWithNaverData(regionMatch.complex.id, naverComplex)
      this.matchingStats.region_matches++
      return
    }

    // 5. 매칭 실패 시 새 단지로 추가
    await this.addNewComplexFromNaver(naverComplex)
    this.matchingStats.new_complexes_added++
  }

  async findExistingMapping(naverComplexId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT apartment_complex_id 
        FROM source_complex_mapping 
        WHERE source_type = 'naver' AND source_id = ?
      `
      
      this.integratedDb.get(query, [naverComplexId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  }

  findExactNameMatch(naverComplex, existingComplexes) {
    const naverName = this.normalizeComplexName(naverComplex.complex_name)
    
    return existingComplexes.find(existing => {
      const existingName = this.normalizeComplexName(existing.name)
      return existingName === naverName
    })
  }

  findFuzzyNameMatch(naverComplex, existingComplexes) {
    const naverName = this.normalizeComplexName(naverComplex.complex_name)
    let bestMatch = { complex: null, score: 0 }

    for (const existing of existingComplexes) {
      const existingName = this.normalizeComplexName(existing.name)
      const score = this.calculateNameSimilarity(naverName, existingName)
      
      if (score > bestMatch.score) {
        bestMatch = { complex: existing, score }
      }
    }

    return bestMatch
  }

  findRegionMatch(naverComplex, existingComplexes) {
    let bestMatch = { complex: null, score: 0 }

    // 네이버 단지의 지역 정보 추출
    const naverRegion = this.extractRegionFromAddress(naverComplex.address)
    
    for (const existing of existingComplexes) {
      let regionScore = 0

      // 시도 매칭
      if (naverRegion.sido && existing.sido) {
        if (naverRegion.sido === existing.sido) regionScore += 0.3
      }

      // 시군구 매칭
      if (naverRegion.sigungu && existing.sigungu) {
        if (naverRegion.sigungu === existing.sigungu) regionScore += 0.4
      }

      // 읍면동 매칭
      if (naverRegion.dong && existing.eup_myeon_dong) {
        if (naverRegion.dong === existing.eup_myeon_dong) regionScore += 0.3
      }

      // 준공년도 유사성 (보조 지표)
      if (naverComplex.completion_year && existing.completion_year) {
        const yearDiff = Math.abs(naverComplex.completion_year - existing.completion_year)
        if (yearDiff <= 2) regionScore += 0.1
      }

      if (regionScore > bestMatch.score) {
        bestMatch = { complex: existing, score: regionScore }
      }
    }

    return bestMatch
  }

  normalizeComplexName(name) {
    if (!name) return ''
    
    return name
      .replace(/아파트|APT|apt/gi, '')
      .replace(/\s+/g, '')
      .replace(/[0-9]+단지|[0-9]+차/g, '')
      .toLowerCase()
      .trim()
  }

  calculateNameSimilarity(str1, str2) {
    if (!str1 || !str2) return 0
    
    // 레벤슈타인 거리 기반 유사도 계산
    const maxLen = Math.max(str1.length, str2.length)
    if (maxLen === 0) return 1
    
    const distance = this.levenshteinDistance(str1, str2)
    return 1 - (distance / maxLen)
  }

  levenshteinDistance(str1, str2) {
    const matrix = []

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[str2.length][str1.length]
  }

  extractRegionFromAddress(address) {
    if (!address) return {}

    const region = { sido: null, sigungu: null, dong: null }
    
    // 시도 추출
    const sidoMatch = address.match(/(.*?)(특별시|광역시|도|특별자치시|특별자치도)/)
    if (sidoMatch) {
      region.sido = sidoMatch[1] + sidoMatch[2]
    }

    // 시군구 추출
    const sigunguMatch = address.match(/(.*?)(시|군|구)(?=\s)/)
    if (sigunguMatch) {
      region.sigungu = sigunguMatch[1] + sigunguMatch[2]
    }

    // 동 추출
    const dongMatch = address.match(/(.*?)(동|읍|면)(?=\s|$)/)
    if (dongMatch) {
      region.dong = dongMatch[1] + dongMatch[2]
    }

    return region
  }

  async createMapping(complexId, naverComplexId, method, confidence) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO source_complex_mapping (
          apartment_complex_id, source_type, source_id, 
          matching_method, matching_confidence
        ) VALUES (?, ?, ?, ?, ?)
      `
      
      this.integratedDb.run(query, [
        complexId, 'naver', naverComplexId, method, confidence
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async updateComplexWithNaverData(complexId, naverComplex) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE apartment_complexes 
        SET 
          address_normalized = COALESCE(address_normalized, ?),
          completion_year = COALESCE(completion_year, ?),
          total_households = COALESCE(total_households, ?),
          total_buildings = COALESCE(total_buildings, ?),
          data_sources = json_insert(
            COALESCE(data_sources, '[]'),
            '$[#]',
            'naver'
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      
      this.integratedDb.run(query, [
        naverComplex.address,
        naverComplex.completion_year,
        naverComplex.total_households,
        naverComplex.total_buildings,
        complexId
      ], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async addNewComplexFromNaver(naverComplex) {
    // 네이버 단지의 지역 정보 추출
    const region = this.extractRegionFromAddress(naverComplex.address)
    
    // 좌표 생성 (실제로는 지역별 좌표 범위 사용)
    const coords = this.generateRegionCoords(region)
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO apartment_complexes (
          complex_code, name, latitude, longitude,
          address_normalized, sido, sigungu, eup_myeon_dong,
          completion_year, total_households, total_buildings,
          data_sources
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      
      const values = [
        `NAVER_${naverComplex.complex_id}`,
        naverComplex.complex_name,
        coords.lat,
        coords.lng,
        naverComplex.address,
        region.sido || '정보없음',
        region.sigungu || '정보없음',
        region.dong || '정보없음',
        naverComplex.completion_year,
        naverComplex.total_households,
        naverComplex.total_buildings,
        JSON.stringify(['naver'])
      ]

      const self = this
      this.integratedDb.run(query, values, function(err) {
        if (err) {
          reject(err)
          return
        }
        
        const complexId = this.lastID
        
        // 매핑 정보 생성
        const mappingQuery = `
          INSERT INTO source_complex_mapping (
            apartment_complex_id, source_type, source_id, 
            matching_method, matching_confidence
          ) VALUES (?, ?, ?, ?, ?)
        `
        
        self.integratedDb.run(mappingQuery, [
          complexId, 'naver', naverComplex.complex_id, 'new_complex', 1.0
        ], (mappingErr) => {
          if (mappingErr) reject(mappingErr)
          else resolve(complexId)
        })
      })
    })
  }

  generateRegionCoords(region) {
    // 지역별 대표 좌표 (실제로는 더 정교한 매핑 필요)
    const regionCoords = {
      '서울특별시': { lat: 37.5665, lng: 126.9780 },
      '부산광역시': { lat: 35.1796, lng: 129.0756 },
      '대구광역시': { lat: 35.8714, lng: 128.6014 },
      '인천광역시': { lat: 37.4563, lng: 126.7052 },
      '광주광역시': { lat: 35.1595, lng: 126.8526 },
      '대전광역시': { lat: 36.3504, lng: 127.3845 },
      '울산광역시': { lat: 35.5384, lng: 129.3114 },
      '경기도': { lat: 37.4138, lng: 127.5183 }
    }

    const baseCoords = regionCoords[region.sido] || { lat: 37.5665, lng: 126.9780 }
    
    // 약간의 랜덤 오프셋 추가
    return {
      lat: baseCoords.lat + (Math.random() - 0.5) * 0.1,
      lng: baseCoords.lng + (Math.random() - 0.5) * 0.1
    }
  }

  printIntermediateStats() {
    console.log(`   📊 현재까지 매칭 결과:`)
    console.log(`      - 정확한 이름 매칭: ${this.matchingStats.exact_name_matches}개`)
    console.log(`      - 유사 이름 매칭: ${this.matchingStats.fuzzy_name_matches}개`)
    console.log(`      - 지역 기반 매칭: ${this.matchingStats.region_matches}개`) 
    console.log(`      - 신규 단지 추가: ${this.matchingStats.new_complexes_added}개`)
    console.log(`      - 실패: ${this.matchingStats.failed_matches}개`)
  }

  printFinalStats() {
    console.log('\n' + '='.repeat(60))
    console.log('🎉 네이버 단지 매칭 완료!')
    console.log('='.repeat(60))
    console.log(`📊 최종 매칭 결과:`)
    console.log(`   • 총 처리된 단지: ${this.matchingStats.total_processed}개`)
    console.log(`   • 정확한 이름 매칭: ${this.matchingStats.exact_name_matches}개`)
    console.log(`   • 유사 이름 매칭: ${this.matchingStats.fuzzy_name_matches}개`)
    console.log(`   • 지역 기반 매칭: ${this.matchingStats.region_matches}개`)
    console.log(`   • 신규 단지 추가: ${this.matchingStats.new_complexes_added}개`)
    console.log(`   • 매칭 실패: ${this.matchingStats.failed_matches}개`)
    
    const totalMatched = this.matchingStats.exact_name_matches + 
                        this.matchingStats.fuzzy_name_matches + 
                        this.matchingStats.region_matches + 
                        this.matchingStats.new_complexes_added
    
    const successRate = ((totalMatched / this.matchingStats.total_processed) * 100).toFixed(1)
    console.log(`   • 전체 성공률: ${successRate}%`)
    console.log('='.repeat(60))
  }

  async run() {
    try {
      await this.initialize()
      await this.matchNaverComplexes()
      
      // 결과 확인
      const finalCount = await new Promise((resolve, reject) => {
        this.integratedDb.get('SELECT COUNT(*) as count FROM apartment_complexes', [], (err, row) => {
          if (err) reject(err)
          else resolve(row.count)
        })
      })
      
      const mappingCount = await new Promise((resolve, reject) => {
        this.integratedDb.get('SELECT COUNT(*) as count FROM source_complex_mapping WHERE source_type = "naver"', [], (err, row) => {
          if (err) reject(err)
          else resolve(row.count)
        })
      })
      
      console.log(`\n✅ 최종 통합 단지 수: ${finalCount}개`)
      console.log(`✅ 네이버 매핑 수: ${mappingCount}개`)
      
    } catch (error) {
      console.error('❌ 매칭 실패:', error)
    } finally {
      if (this.integratedDb) this.integratedDb.close()
      if (this.naverDb) this.naverDb.close()
    }
  }
}

// 전역 변수로 설정 (매핑 생성에서 사용)
let integrator

// 실행
if (require.main === module) {
  integrator = new NaverComplexMatcher()
  integrator.run()
}

module.exports = NaverComplexMatcher