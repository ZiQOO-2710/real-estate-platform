/**
 * 종합 데이터베이스 통합 스크립트
 * 전체통합DB + 현재통합DB + 원본네이버DB → 완전 통합 시스템
 */

const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs').promises

class ComprehensiveDataIntegrator {
  constructor() {
    // 데이터베이스 경로들
    this.paths = {
      fullIntegrated: path.join(__dirname, '../../data/full_integrated_real_estate.db'),
      currentIntegrated: path.join(__dirname, '../../data/integrated_real_estate.db'), 
      naverOriginal: path.join(__dirname, '../../../modules/naver-crawler/data/naver_real_estate.db'),
      finalOutput: path.join(__dirname, '../../data/master_integrated_real_estate.db')
    }
    
    this.databases = {}
    this.integrationStats = {
      complexes: { processed: 0, inserted: 0, skipped: 0, errors: 0 },
      listings: { processed: 0, inserted: 0, skipped: 0, errors: 0 },
      transactions: { processed: 0, inserted: 0, skipped: 0, errors: 0 },
      startTime: null,
      endTime: null,
      errors: []
    }
  }

  /**
   * 메인 통합 프로세스
   */
  async integrate() {
    try {
      console.log('🚀 종합 데이터베이스 통합 시작')
      this.integrationStats.startTime = new Date()

      // 1단계: 데이터베이스 연결
      await this.connectDatabases()
      
      // 2단계: 대상 DB 초기화 (전체통합DB를 베이스로 사용)
      await this.initializeTargetDatabase()
      
      // 3단계: 전체통합DB (MOLIT) 데이터 병합
      console.log('\n📊 전체통합DB (MOLIT) 데이터 병합 중...')
      await this.mergeFullIntegratedData()
      
      // 4단계: 원본네이버DB 데이터 병합  
      console.log('\n🏠 원본네이버DB 데이터 병합 중...')
      await this.mergeNaverOriginalData()
      
      // 5단계: 데이터 무결성 검증
      console.log('\n🔍 데이터 무결성 검증 중...')
      await this.validateDataIntegrity()
      
      // 6단계: 최종 통계 및 완료
      await this.generateFinalReport()
      
      console.log('\n✅ 종합 데이터베이스 통합 완료!')
      return this.integrationStats

    } catch (error) {
      console.error('❌ 데이터 통합 실패:', error)
      this.integrationStats.errors.push(error.message)
      throw error
    } finally {
      await this.closeDatabases()
      this.integrationStats.endTime = new Date()
    }
  }

  /**
   * 데이터베이스 연결
   */
  async connectDatabases() {
    console.log('🔗 데이터베이스 연결 중...')
    
    // 각 DB 파일 존재 확인
    for (const [key, dbPath] of Object.entries(this.paths)) {
      if (key !== 'finalOutput') {
        try {
          await fs.access(dbPath)
          console.log(`  ✅ ${key}: ${dbPath}`)
        } catch (error) {
          throw new Error(`데이터베이스 파일이 없습니다: ${dbPath}`)
        }
      }
    }

    // 데이터베이스 연결 생성
    this.databases.fullIntegrated = new sqlite3.Database(this.paths.fullIntegrated)
    this.databases.currentIntegrated = new sqlite3.Database(this.paths.currentIntegrated)
    this.databases.naverOriginal = new sqlite3.Database(this.paths.naverOriginal)
    this.databases.target = new sqlite3.Database(this.paths.finalOutput)
    
    console.log('✅ 모든 데이터베이스 연결 완료')
  }

  /**
   * 대상 데이터베이스 초기화 (현재통합DB를 베이스로 사용)
   */
  async initializeTargetDatabase() {
    console.log('🏗️ 대상 데이터베이스 초기화 중...')
    
    try {
      // 기존 파일이 있으면 삭제
      try {
        await fs.unlink(this.paths.finalOutput)
        console.log('  🗑️ 기존 대상 DB 파일 삭제')
      } catch (error) {
        // 파일이 없으면 무시
      }

      // 현재통합DB를 베이스로 복사 (올바른 스키마 보유)
      await fs.copyFile(this.paths.currentIntegrated, this.paths.finalOutput)
      console.log('  📋 현재통합DB를 베이스로 복사 완료 (좌표 데이터 포함)')
      
      // 대상 DB 재연결
      if (this.databases.target) {
        this.databases.target.close()
      }
      this.databases.target = new sqlite3.Database(this.paths.finalOutput)
      
      // 초기 통계
      const stats = await this.queryTarget(`
        SELECT 
          (SELECT COUNT(*) FROM apartment_complexes) as complexes,
          (SELECT COUNT(*) FROM current_listings) as listings,
          (SELECT COUNT(*) FROM transaction_records) as transactions
      `)
      
      console.log(`  📊 베이스 데이터: 단지 ${stats[0].complexes}개, 매물 ${stats[0].listings}개, 거래 ${stats[0].transactions}개`)
      
    } catch (error) {
      throw new Error(`대상 DB 초기화 실패: ${error.message}`)
    }
  }

  /**
   * 전체통합DB (MOLIT) 데이터 병합
   */
  async mergeFullIntegratedData() {
    console.log('📊 전체통합DB (MOLIT) → 마스터DB 병합 시작')
    
    try {
      // 단지 데이터 병합 (MOLIT 스키마를 통합 스키마로 변환)
      await this.mergeComplexesFromFull()
      
      // 거래 데이터 병합
      await this.mergeTransactionsFromFull()
      
      console.log('✅ 전체통합DB (MOLIT) 병합 완료')
      
    } catch (error) {
      throw new Error(`전체통합DB 병합 실패: ${error.message}`)
    }
  }

  /**
   * 전체통합DB의 단지 데이터 병합 (MOLIT 스키마 변환)
   */
  async mergeComplexesFromFull() {
    const complexes = await this.queryFullIntegrated('SELECT * FROM apartment_complexes')
    console.log(`  🏢 전체통합DB (MOLIT) 단지 ${complexes.length}개 처리 중...`)
    
    let fullComplexStats = { inserted: 0, skipped: 0, errors: 0 }
    
    for (const complex of complexes) {
      try {
        // MOLIT 데이터를 통합 스키마로 변환
        const transformedComplex = this.transformMolitComplex(complex)
        
        if (!transformedComplex.name || !transformedComplex.sigungu) {
          fullComplexStats.skipped++
          continue
        }
        
        // 중복 검사 (이름 + 지역 기반)
        const existing = await this.queryTarget(`
          SELECT id FROM apartment_complexes 
          WHERE name = ? AND sigungu = ?
        `, [transformedComplex.name, transformedComplex.sigungu])
        
        if (existing.length > 0) {
          fullComplexStats.skipped++
          continue
        }
        
        // 새 단지 삽입
        await this.runTarget(`
          INSERT INTO apartment_complexes (
            complex_code, name, name_variations, latitude, longitude,
            address_jibun, address_road, address_normalized,
            sido, sigungu, eup_myeon_dong, completion_year,
            total_households, total_buildings, area_range,
            data_sources, confidence_score, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          transformedComplex.complex_code,
          transformedComplex.name,
          transformedComplex.name_variations,
          transformedComplex.latitude,
          transformedComplex.longitude,
          transformedComplex.address_jibun,
          transformedComplex.address_road,
          transformedComplex.address_normalized,
          transformedComplex.sido,
          transformedComplex.sigungu,
          transformedComplex.eup_myeon_dong,
          null, // completion_year
          null, // total_households
          null, // total_buildings
          null, // area_range
          JSON.stringify(['molit']),
          0.9, // confidence score
          new Date().toISOString(),
          new Date().toISOString()
        ])
        
        fullComplexStats.inserted++
        
      } catch (error) {
        console.error(`    ❌ MOLIT 단지 ${complex.id} 처리 실패:`, error.message)
        fullComplexStats.errors++
      }
    }
    
    console.log(`    ✅ MOLIT 단지 병합: ${fullComplexStats.inserted}개 추가, ${fullComplexStats.skipped}개 스킵`)
  }

  /**
   * 전체통합DB의 거래 데이터 병합
   */
  async mergeTransactionsFromFull() {
    const transactions = await this.queryFullIntegrated('SELECT * FROM transaction_records')
    console.log(`  💰 전체통합DB (MOLIT) 거래 ${transactions.length}개 처리 중...`)
    
    let fullTransactionStats = { inserted: 0, skipped: 0, errors: 0 }
    
    for (const transaction of transactions) {
      try {
        // 연결할 단지 찾기 (MOLIT complex_key 기반)
        const complexMapping = await this.findComplexByMolitKey(transaction.apartment_complex_id)
        
        if (!complexMapping) {
          fullTransactionStats.skipped++
          continue
        }
        
        // 중복 검사 (날짜 + 가격 + 면적 기반)
        const existing = await this.queryTarget(`
          SELECT id FROM transaction_records 
          WHERE apartment_complex_id = ? AND deal_date = ? 
            AND deal_amount = ? AND ABS(area_exclusive - ?) < 1.0
        `, [complexMapping.id, transaction.deal_date, transaction.deal_amount, transaction.area_exclusive])
        
        if (existing.length > 0) {
          fullTransactionStats.skipped++
          continue
        }
        
        // 새 거래 삽입
        await this.runTarget(`
          INSERT INTO transaction_records (
            apartment_complex_id, deal_type, deal_date, deal_amount,
            monthly_rent, area_exclusive, floor_current,
            building_name, unit_number, data_source, original_record_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          complexMapping.id,
          transaction.deal_type || '매매',
          transaction.deal_date,
          transaction.deal_amount,
          transaction.monthly_rent,
          transaction.area_exclusive,
          transaction.floor_current,
          null, // building_name
          null, // unit_number  
          'molit',
          transaction.id,
          new Date().toISOString()
        ])
        
        fullTransactionStats.inserted++
        
      } catch (error) {
        console.error(`    ❌ MOLIT 거래 ${transaction.id} 처리 실패:`, error.message)
        fullTransactionStats.errors++
      }
    }
    
    console.log(`    ✅ MOLIT 거래 병합: ${fullTransactionStats.inserted}개 추가, ${fullTransactionStats.skipped}개 스킵`)
  }


  /**
   * 원본네이버DB 데이터 병합
   */
  async mergeNaverOriginalData() {
    console.log('🏠 원본네이버DB → 마스터DB 병합 시작')
    
    try {
      // 네이버DB의 단지를 먼저 병합
      await this.mergeNaverComplexes()
      
      // 그 다음 매물 병합
      await this.mergeNaverListings()
      
      console.log('✅ 원본네이버DB 병합 완료')
      
    } catch (error) {
      throw new Error(`원본네이버DB 병합 실패: ${error.message}`)
    }
  }

  /**
   * 네이버 원본의 단지 데이터 병합
   */
  async mergeNaverComplexes() {
    const complexes = await this.queryNaverOriginal('SELECT * FROM apartment_complexes')
    console.log(`  🏢 네이버원본 단지 ${complexes.length}개 처리 중...`)
    
    let naverComplexStats = { inserted: 0, skipped: 0, errors: 0 }
    
    for (const complex of complexes) {
      try {
        // 중복 검사 (이름 + 지역 기반)
        const existing = await this.queryTarget(`
          SELECT id FROM apartment_complexes 
          WHERE name = ? AND (sigungu = ? OR address_normalized LIKE ?)
        `, [complex.name, complex.sigungu, `%${complex.sigungu || ''}%`])
        
        if (existing.length > 0) {
          naverComplexStats.skipped++
          continue
        }
        
        // 좌표가 있는 경우 좌표 기반으로도 중복 체크
        if (complex.latitude && complex.longitude) {
          const coordExisting = await this.queryTarget(`
            SELECT id FROM apartment_complexes 
            WHERE ABS(latitude - ?) < 0.001 AND ABS(longitude - ?) < 0.001
          `, [complex.latitude, complex.longitude])
          
          if (coordExisting.length > 0) {
            naverComplexStats.skipped++
            continue
          }
        }
        
        // 새 단지 삽입 (네이버 데이터를 통합 스키마로 변환)
        const complexCode = this.generateComplexCode(complex)
        
        await this.runTarget(`
          INSERT INTO apartment_complexes (
            complex_code, name, name_variations, latitude, longitude,
            address_jibun, address_road, address_normalized,
            sido, sigungu, eup_myeon_dong, completion_year,
            total_households, total_buildings, area_range,
            data_sources, confidence_score, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          complexCode,
          complex.name,
          JSON.stringify([complex.name]),
          complex.latitude,
          complex.longitude,
          complex.address,
          null, // road address
          this.normalizeAddress(complex.address),
          this.extractSido(complex.address),
          this.extractSigungu(complex.address),
          this.extractDong(complex.address),
          complex.completion_year,
          complex.total_households,
          complex.total_buildings,
          null, // area range
          JSON.stringify(['naver']),
          0.8, // confidence score
          new Date().toISOString(),
          new Date().toISOString()
        ])
        
        naverComplexStats.inserted++
        
      } catch (error) {
        console.error(`    ❌ 네이버 단지 ${complex.id} 처리 실패:`, error.message)
        naverComplexStats.errors++
      }
    }
    
    console.log(`    ✅ 네이버 단지 병합: ${naverComplexStats.inserted}개 추가, ${naverComplexStats.skipped}개 스킵`)
  }

  /**
   * 네이버 원본의 매물 데이터 병합
   */
  async mergeNaverListings() {
    // 배치 처리로 성능 개선 (1000개씩)
    const batchSize = 1000
    let offset = 0
    let naverListingStats = { inserted: 0, skipped: 0, errors: 0 }
    
    while (true) {
      const listings = await this.queryNaverOriginal(
        `SELECT * FROM current_listings LIMIT ${batchSize} OFFSET ${offset}`
      )
      
      if (listings.length === 0) break
      
      console.log(`    🏠 네이버 매물 배치 처리 (${offset + 1}-${offset + listings.length})`)
      
      for (const listing of listings) {
        try {
          // 단지 찾기 (네이버 complex_id로)
          const naverComplex = await this.queryNaverOriginal(
            'SELECT * FROM apartment_complexes WHERE id = ?', 
            [listing.apartment_complex_id]
          )
          
          if (naverComplex.length === 0) {
            naverListingStats.skipped++
            continue
          }
          
          // 마스터DB에서 해당 단지 찾기
          const masterComplex = await this.queryTarget(`
            SELECT id FROM apartment_complexes 
            WHERE name = ? AND (sigungu = ? OR address_normalized LIKE ?)
          `, [
            naverComplex[0].name, 
            this.extractSigungu(naverComplex[0].address),
            `%${this.extractSigungu(naverComplex[0].address) || ''}%`
          ])
          
          if (masterComplex.length === 0) {
            naverListingStats.skipped++
            continue
          }
          
          // 중복 검사
          const existing = await this.queryTarget(`
            SELECT id FROM current_listings 
            WHERE apartment_complex_id = ? AND (
              listing_id = ? OR 
              (description = ? AND price_sale = ? AND area_exclusive = ?)
            )
          `, [
            masterComplex[0].id, 
            listing.id,
            listing.description,
            listing.price_amount,
            listing.area_sqm
          ])
          
          if (existing.length > 0) {
            naverListingStats.skipped++
            continue
          }
          
          // 새 매물 삽입 (네이버 스키마를 통합 스키마로 변환)
          await this.runTarget(`
            INSERT INTO current_listings (
              apartment_complex_id, listing_id, listing_url, deal_type,
              price_sale, price_jeonse, price_monthly, deposit,
              area_exclusive, area_supply, floor_current, floor_total,
              direction, room_structure, description, raw_text,
              status, crawled_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            masterComplex[0].id,
            listing.id,
            listing.listing_url,
            listing.deal_type || '매매',
            listing.price_amount,
            listing.deal_type === '전세' ? listing.price_amount : null,
            listing.deal_type === '월세' ? listing.monthly_rent : null,
            listing.deposit_amount,
            listing.area_sqm,
            listing.area_supply,
            this.parseFloor(listing.floor_info),
            this.parseFloor(listing.floor_total),
            listing.direction,
            listing.room_structure,
            listing.description,
            listing.raw_text,
            'active',
            listing.extracted_at,
            listing.created_at,
            new Date().toISOString()
          ])
          
          naverListingStats.inserted++
          
        } catch (error) {
          console.error(`    ❌ 네이버 매물 ${listing.id} 처리 실패:`, error.message)
          naverListingStats.errors++
        }
      }
      
      offset += batchSize
      
      // 진행 상황 출력
      if (offset % 5000 === 0) {
        console.log(`    📊 네이버 매물 ${offset}개 처리 완료 (추가: ${naverListingStats.inserted}, 스킵: ${naverListingStats.skipped})`)
      }
    }
    
    console.log(`    ✅ 네이버 매물 병합 완료: ${naverListingStats.inserted}개 추가, ${naverListingStats.skipped}개 스킵`)
  }

  /**
   * 데이터 무결성 검증
   */
  async validateDataIntegrity() {
    const checks = []
    
    // 1. 기본 데이터 개수 확인
    const stats = await this.queryTarget(`
      SELECT 
        (SELECT COUNT(*) FROM apartment_complexes) as complexes,
        (SELECT COUNT(*) FROM current_listings) as listings,
        (SELECT COUNT(*) FROM transaction_records) as transactions
    `)
    checks.push(`데이터 개수: 단지 ${stats[0].complexes}개, 매물 ${stats[0].listings}개, 거래 ${stats[0].transactions}개`)
    
    // 2. 좌표 유효성 검사
    const invalidCoords = await this.queryTarget(`
      SELECT COUNT(*) as count FROM apartment_complexes 
      WHERE latitude IS NULL OR longitude IS NULL 
         OR latitude < 33 OR latitude > 39 
         OR longitude < 124 OR longitude > 132
    `)
    checks.push(`유효하지 않은 좌표: ${invalidCoords[0].count}개`)
    
    // 3. 매물-단지 연결 검증
    const orphanedListings = await this.queryTarget(`
      SELECT COUNT(*) as count FROM current_listings cl
      LEFT JOIN apartment_complexes ac ON cl.apartment_complex_id = ac.id
      WHERE ac.id IS NULL
    `)
    checks.push(`연결되지 않은 매물: ${orphanedListings[0].count}개`)
    
    // 4. 중복 단지 검사
    const duplicateComplexes = await this.queryTarget(`
      SELECT COUNT(*) as count FROM (
        SELECT latitude, longitude, COUNT(*) as cnt
        FROM apartment_complexes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY ROUND(latitude, 4), ROUND(longitude, 4)
        HAVING COUNT(*) > 1
      )
    `)
    checks.push(`중복 가능 단지: ${duplicateComplexes[0].count}개`)
    
    console.log('  📋 무결성 검증 결과:')
    checks.forEach(check => console.log(`    ✓ ${check}`))
  }

  /**
   * 최종 리포트 생성
   */
  async generateFinalReport() {
    const duration = (this.integrationStats.endTime - this.integrationStats.startTime) / 1000
    const finalStats = await this.queryTarget(`
      SELECT 
        (SELECT COUNT(*) FROM apartment_complexes) as total_complexes,
        (SELECT COUNT(*) FROM current_listings) as total_listings,
        (SELECT COUNT(*) FROM transaction_records) as total_transactions
    `)
    
    console.log('\n🎉 === 통합 완료 리포트 ===')
    console.log(`⏰ 소요 시간: ${Math.round(duration)}초`)
    console.log(`📊 최종 결과:`)
    console.log(`  🏢 단지: ${finalStats[0].total_complexes}개`)
    console.log(`  🏠 매물: ${finalStats[0].total_listings}개`) 
    console.log(`  💰 거래: ${finalStats[0].total_transactions}개`)
    console.log(`\n📈 처리 통계:`)
    console.log(`  단지 - 처리: ${this.integrationStats.complexes.processed}, 추가: ${this.integrationStats.complexes.inserted}, 스킵: ${this.integrationStats.complexes.skipped}`)
    console.log(`  매물 - 처리: ${this.integrationStats.listings.processed}, 추가: ${this.integrationStats.listings.inserted}, 스킵: ${this.integrationStats.listings.skipped}`)
    console.log(`  거래 - 처리: ${this.integrationStats.transactions.processed}, 추가: ${this.integrationStats.transactions.inserted}, 스킵: ${this.integrationStats.transactions.skipped}`)
    
    if (this.integrationStats.errors.length > 0) {
      console.log(`\n⚠️ 오류 ${this.integrationStats.errors.length}개 발생:`)
      this.integrationStats.errors.forEach(error => console.log(`  - ${error}`))
    }
    
    console.log(`\n💾 통합 데이터베이스 위치: ${this.paths.finalOutput}`)
  }

  /**
   * 헬퍼 메서드들
   */
  
  queryCurrentIntegrated(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.databases.currentIntegrated.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }
  
  queryFullIntegrated(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.databases.fullIntegrated.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }
  
  queryNaverOriginal(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.databases.naverOriginal.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }
  
  queryTarget(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.databases.target.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }
  
  runTarget(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.databases.target.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve(this)
      })
    })
  }

  async findComplexByOriginalId(originalId) {
    // 실제 구현에서는 소스 매핑 테이블을 사용해야 하지만,
    // 간단한 ID 기반 매핑 사용
    const result = await this.queryTarget(
      'SELECT id FROM apartment_complexes WHERE id = ?',
      [originalId]
    )
    return result.length > 0 ? result[0] : null
  }

  /**
   * MOLIT 단지를 현재 통합 스키마로 변환
   */
  transformMolitComplex(molitComplex) {
    // MOLIT 주소에서 지역 정보 추출
    const fullAddress = `${molitComplex.sigungu} ${molitComplex.eup_myeon_dong}`
    const sido = this.extractSido(fullAddress)
    
    return {
      complex_code: this.generateComplexCode({
        sigungu: molitComplex.sigungu,
        name: molitComplex.apartment_name
      }),
      name: molitComplex.apartment_name,
      name_variations: JSON.stringify([molitComplex.apartment_name]),
      latitude: null, // MOLIT 데이터에는 좌표가 없음
      longitude: null,
      address_jibun: this.constructAddress(molitComplex, 'jibun'),
      address_road: this.constructAddress(molitComplex, 'road'),
      address_normalized: this.normalizeAddress(fullAddress + ' ' + molitComplex.apartment_name),
      sido: sido,
      sigungu: molitComplex.sigungu,
      eup_myeon_dong: molitComplex.eup_myeon_dong
    }
  }

  /**
   * MOLIT 복합키로 단지 찾기
   */
  async findComplexByMolitKey(molitComplexId) {
    // MOLIT의 complex_key나 apartment_name 기반으로 매핑된 단지 찾기
    const molitComplex = await this.queryFullIntegrated(
      'SELECT * FROM apartment_complexes WHERE id = ?',
      [molitComplexId]
    )
    
    if (molitComplex.length === 0) return null
    
    const molit = molitComplex[0]
    
    // 통합DB에서 같은 이름과 지역의 단지 찾기
    const result = await this.queryTarget(`
      SELECT id FROM apartment_complexes 
      WHERE name = ? AND sigungu = ?
    `, [molit.apartment_name, molit.sigungu])
    
    return result.length > 0 ? result[0] : null
  }

  /**
   * MOLIT 데이터로부터 주소 생성
   */
  constructAddress(molitComplex, type = 'jibun') {
    const parts = []
    
    if (molitComplex.sigungu) parts.push(molitComplex.sigungu)
    if (molitComplex.eup_myeon_dong) parts.push(molitComplex.eup_myeon_dong)
    
    if (type === 'road' && molitComplex.road_name) {
      if (molitComplex.road_name) parts.push(molitComplex.road_name)
      if (molitComplex.road_number) parts.push(molitComplex.road_number)
    } else if (type === 'jibun' && molitComplex.land_number) {
      if (molitComplex.land_number) parts.push(molitComplex.land_number)
    }
    
    return parts.length > 0 ? parts.join(' ') : null
  }

  generateComplexCode(complex) {
    const region = (this.extractSigungu(complex.address) || 'UNK').substring(0, 4)
    const timestamp = Date.now().toString(36)
    return `${region}_NAV_${timestamp}`
  }

  normalizeAddress(address) {
    if (!address) return ''
    return address.replace(/[^\w\s가-힣]/g, ' ').replace(/\s+/g, ' ').trim()
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

  extractDong(address) {
    if (!address) return null
    const match = address.match(/(\w+[읍면동])/)
    return match ? match[1] : null
  }

  parseFloor(floorInfo) {
    if (!floorInfo) return null
    const match = String(floorInfo).match(/(\d+)/)
    return match ? parseInt(match[1]) : null
  }

  async closeDatabases() {
    console.log('🔒 데이터베이스 연결 종료 중...')
    
    const closePromises = Object.values(this.databases).map(db => {
      return new Promise(resolve => {
        if (db) {
          db.close(err => {
            if (err) console.error('DB 종료 오류:', err)
            resolve()
          })
        } else {
          resolve()
        }
      })
    })
    
    await Promise.all(closePromises)
    console.log('✅ 모든 데이터베이스 연결 종료 완료')
  }
}

// 메인 실행 함수
async function runIntegration() {
  const integrator = new ComprehensiveDataIntegrator()
  
  try {
    const result = await integrator.integrate()
    console.log('\n🎊 데이터베이스 통합이 성공적으로 완료되었습니다!')
    return result
  } catch (error) {
    console.error('💥 데이터베이스 통합에 실패했습니다:', error)
    process.exit(1)
  }
}

// 스크립트로 직접 실행할 때
if (require.main === module) {
  runIntegration()
}

module.exports = ComprehensiveDataIntegrator