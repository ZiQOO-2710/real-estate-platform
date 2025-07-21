#!/usr/bin/env node

/**
 * 부동산 데이터 통합 실행 스크립트
 * 기존 분산된 데이터를 통합 스키마로 통합
 */

const path = require('path')
const sqlite3 = require('sqlite3').verbose()
const DataIntegrationService = require('../services/DataIntegrationService')
const DataValidationService = require('../services/DataValidationService')

class RealEstateDataIntegrator {
  constructor() {
    this.integrationService = new DataIntegrationService()
    this.validationService = new DataValidationService()
    
    // 기존 데이터베이스 경로 (실제 파일 위치로 수정)
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_real_estate.db'
    this.molitDbPath = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    
    this.naverDb = null
    this.molitDb = null
  }

  async initialize() {
    console.log('🔧 데이터 통합 시스템 초기화 중...')
    
    // 통합 서비스 초기화
    await this.integrationService.initialize()
    
    // 기존 데이터베이스 연결
    await this.connectSourceDatabases()
    
    console.log('✅ 초기화 완료')
  }

  async connectSourceDatabases() {
    return new Promise((resolve, reject) => {
      let connected = 0
      const totalConnections = 2

      // 네이버 데이터베이스 연결
      this.naverDb = new sqlite3.Database(this.naverDbPath, (err) => {
        if (err) {
          console.error('❌ 네이버 DB 연결 실패:', err)
          reject(err)
          return
        }
        console.log('✅ 네이버 데이터베이스 연결 완료')
        connected++
        if (connected === totalConnections) resolve()
      })

      // 국토부 데이터베이스 연결
      this.molitDb = new sqlite3.Database(this.molitDbPath, (err) => {
        if (err) {
          console.error('❌ 국토부 DB 연결 실패:', err)
          reject(err)
          return
        }
        console.log('✅ 국토부 데이터베이스 연결 완료')
        connected++
        if (connected === totalConnections) resolve()
      })
    })
  }

  async extractSourceData() {
    console.log('📊 원본 데이터 추출 중...')

    const [complexes, listings, transactions] = await Promise.all([
      this.extractComplexes(),
      this.extractListings(),
      this.extractTransactions()
    ])

    console.log(`✅ 데이터 추출 완료:`)
    console.log(`   - 단지: ${complexes.length}개`)
    console.log(`   - 매물: ${listings.length}개`)
    console.log(`   - 실거래: ${transactions.length}개`)

    return { complexes, listings, transactions }
  }

  async extractComplexes() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          complex_id,
          complex_name,
          address,
          completion_year,
          total_households,
          total_buildings,
          area_range,
          source_url,
          created_at,
          updated_at,
          (SELECT COUNT(*) FROM current_listings cl WHERE cl.complex_id = ac.complex_id) as listing_count
        FROM apartment_complexes ac
        ORDER BY complex_id
      `

      this.naverDb.all(query, [], (err, rows) => {
        if (err) {
          console.error('단지 데이터 추출 실패:', err)
          reject(err)
        } else {
          // 가상 좌표 생성 (실제 환경에서는 지오코딩 API 사용)
          const complexesWithCoords = rows.map(complex => ({
            ...complex,
            latitude: this.generateSeoulLatitude(),
            longitude: this.generateSeoulLongitude()
          }))
          resolve(complexesWithCoords)
        }
      })
    })
  }

  async extractListings() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          id,
          complex_id,
          listing_index,
          deal_type,
          price_text,
          price_amount,
          monthly_rent,
          deposit_amount,
          area_sqm,
          area_pyeong,
          floor_info,
          direction,
          room_structure,
          description,
          raw_text,
          extracted_at,
          crawled_at
        FROM current_listings
        WHERE complex_id IS NOT NULL
        ORDER BY complex_id, id
        LIMIT 50000
      `

      this.naverDb.all(query, [], (err, rows) => {
        if (err) {
          console.error('매물 데이터 추출 실패:', err)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  async extractTransactions() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          id,
          region_name,
          apartment_name,
          deal_type,
          deal_year,
          deal_month,
          deal_day,
          deal_amount,
          area,
          floor,
          construction_year,
          road_name,
          legal_dong,
          monthly_rent,
          deposit,
          crawled_at
        FROM apartment_transactions
        WHERE apartment_name IS NOT NULL
        ORDER BY region_name, apartment_name
        LIMIT 100000
      `

      this.molitDb.all(query, [], (err, rows) => {
        if (err) {
          console.error('실거래 데이터 추출 실패:', err)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  async runIntegration() {
    try {
      console.log('🚀 부동산 데이터 통합 프로세스 시작')
      
      // 1. 초기화
      await this.initialize()

      // 2. 원본 데이터 추출
      const sourceData = await this.extractSourceData()

      // 3. 데이터 검증
      console.log('🔍 데이터 품질 검증 중...')
      const validationResults = this.validationService.validateIntegratedData(
        sourceData.complexes,
        sourceData.listings,
        sourceData.transactions
      )

      const qualityScore = this.validationService.calculateQualityScore(validationResults)
      console.log('📊 데이터 품질 점수:', qualityScore)

      // 4. 데이터 통합
      console.log('🔄 데이터 통합 시작...')
      const integrationStats = await this.integrationService.integrateAllData(
        sourceData.complexes,
        sourceData.listings,
        sourceData.transactions
      )

      // 5. 결과 보고서
      await this.generateReport(integrationStats, validationResults, qualityScore)

      console.log('🎉 데이터 통합 프로세스 완료!')

    } catch (error) {
      console.error('❌ 데이터 통합 실패:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async generateReport(integrationStats, validationResults, qualityScore) {
    console.log('\n' + '='.repeat(60))
    console.log('📋 부동산 데이터 통합 완료 보고서')
    console.log('='.repeat(60))

    // 통합 통계
    console.log('\n📊 통합 통계:')
    console.log(`  단지: ${integrationStats.complexes.processed}개 처리 (생성: ${integrationStats.complexes.created}, 매칭: ${integrationStats.complexes.matched})`)
    console.log(`  매물: ${integrationStats.listings.processed}개 처리 (연결: ${integrationStats.listings.matched})`)
    console.log(`  실거래: ${integrationStats.transactions.processed}개 처리 (연결: ${integrationStats.transactions.matched})`)

    // 품질 점수
    console.log('\n🎯 데이터 품질 점수:')
    console.log(`  전체: ${qualityScore.overall.toFixed(1)}점`)
    console.log(`  유효성: ${qualityScore.validity.toFixed(1)}점`)
    console.log(`  이슈: ${qualityScore.issueCount}개`)

    // 검증 결과
    console.log('\n🔍 검증 결과:')
    Object.entries(validationResults).forEach(([type, result]) => {
      if (result.valid !== undefined) {
        console.log(`  ${type}: 유효 ${result.valid}개, 무효 ${result.invalid}개`)
      }
    })

    // 오류 목록
    if (integrationStats.errors.length > 0) {
      console.log('\n⚠️  오류 목록:')
      integrationStats.errors.slice(0, 10).forEach(error => {
        console.log(`  - ${error}`)
      })
      if (integrationStats.errors.length > 10) {
        console.log(`  ... 및 ${integrationStats.errors.length - 10}개 추가 오류`)
      }
    }

    // 성능 정보
    console.log('\n⚡ 성능 정보:')
    console.log(`  매칭 성공률: ${this.calculateMatchingRate(integrationStats)}%`)
    console.log(`  데이터 연결률: ${this.calculateLinkageRate(integrationStats)}%`)

    console.log('\n' + '='.repeat(60))
  }

  calculateMatchingRate(stats) {
    const totalProcessed = stats.complexes.processed + stats.listings.processed + stats.transactions.processed
    const totalMatched = stats.complexes.matched + stats.complexes.created + stats.listings.matched + stats.transactions.matched
    
    return totalProcessed > 0 ? ((totalMatched / totalProcessed) * 100).toFixed(1) : 0
  }

  calculateLinkageRate(stats) {
    const totalListingsAndTransactions = stats.listings.processed + stats.transactions.processed
    const totalLinked = stats.listings.matched + stats.transactions.matched
    
    return totalListingsAndTransactions > 0 ? ((totalLinked / totalListingsAndTransactions) * 100).toFixed(1) : 0
  }

  // 서울 지역 가상 좌표 생성 (실제로는 지오코딩 API 사용)
  generateSeoulLatitude() {
    return 37.5665 + (Math.random() - 0.5) * 0.2 // 서울 중심 ±0.1도
  }

  generateSeoulLongitude() {
    return 126.9780 + (Math.random() - 0.5) * 0.2 // 서울 중심 ±0.1도
  }

  async cleanup() {
    console.log('🧹 리소스 정리 중...')
    
    if (this.naverDb) {
      this.naverDb.close()
    }
    
    if (this.molitDb) {
      this.molitDb.close()
    }
    
    await this.integrationService.close()
    
    console.log('✅ 정리 완료')
  }
}

// CLI 실행 부분
async function main() {
  const integrator = new RealEstateDataIntegrator()
  
  try {
    await integrator.runIntegration()
    process.exit(0)
  } catch (error) {
    console.error('통합 프로세스 실패:', error)
    process.exit(1)
  }
}

// 스크립트가 직접 실행된 경우에만 실행
if (require.main === module) {
  main()
}

module.exports = RealEstateDataIntegrator