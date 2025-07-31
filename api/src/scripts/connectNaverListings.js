#!/usr/bin/env node

/**
 * 네이버 매물호가 데이터를 통합 DB에 연결
 * 
 * 데이터 흐름:
 * 1. 네이버 크롤링 DB에서 매물 데이터 추출
 * 2. 통합 DB의 단지와 매칭
 * 3. 매물호가 정보를 통합 DB의 current_listings에 삽입
 * 4. 매물 통계 업데이트
 */

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

class NaverListingsConnector {
  constructor() {
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_crawled_data.db'
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
    
    this.stats = {
      total_naver_listings: 0,
      matched_complexes: 0,
      connected_listings: 0,
      skipped_invalid: 0,
      price_ranges: {
        sale: { min: null, max: null, avg: 0, count: 0 },
        jeonse: { min: null, max: null, avg: 0, count: 0 },
        monthly: { min: null, max: null, avg: 0, count: 0 }
      },
      errors: []
    }
  }

  async run() {
    console.log('🔗 네이버 매물호가 데이터 통합 DB 연결 시작')
    console.log('=' .repeat(60))
    
    try {
      // 1. 데이터베이스 연결
      await this.connectDatabases()
      
      // 2. 네이버 매물 데이터 조회
      const naverListings = await this.fetchNaverListings()
      
      // 3. 통합 DB 단지와 매칭
      const matchedListings = await this.matchWithIntegratedComplexes(naverListings)
      
      // 4. 매물 데이터 연결
      await this.connectListingsToIntegratedDb(matchedListings)
      
      // 5. 매물 통계 업데이트
      await this.updateListingStatistics()
      
      // 6. 결과 출력
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
      // 네이버 DB 연결
      this.naverDb = new sqlite3.Database(this.naverDbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
          reject(new Error(`네이버 DB 연결 실패: ${err.message}`))
          return
        }
        
        // 통합 DB 연결
        this.integratedDb = new sqlite3.Database(this.integratedDbPath, (err) => {
          if (err) {
            reject(new Error(`통합 DB 연결 실패: ${err.message}`))
            return
          }
          
          console.log('✅ 데이터베이스 연결 완료')
          resolve()
        })
      })
    })
  }

  async fetchNaverListings() {
    console.log('📥 네이버 매물 데이터 조회 중...')
    
    const query = `
      SELECT 
        cl.*,
        ac.complex_name,
        ac.address
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      WHERE cl.price_text IS NOT NULL 
        AND cl.price_text != ''
        AND cl.price_text != '정보없음'
        AND ac.complex_name != '정보없음'
        AND ac.complex_name NOT LIKE '%거래방식%'
    `
    
    return new Promise((resolve, reject) => {
      this.naverDb.all(query, [], (err, rows) => {
        if (err) {
          reject(new Error(`네이버 매물 조회 실패: ${err.message}`))
          return
        }
        
        this.stats.total_naver_listings = rows.length
        console.log(`📊 조회된 네이버 매물: ${rows.length}개`)
        resolve(rows)
      })
    })
  }

  async matchWithIntegratedComplexes(naverListings) {
    console.log('🔍 통합 DB 단지와 매칭 중...')
    
    // 통합 DB의 모든 단지 조회
    const integratedComplexes = await new Promise((resolve, reject) => {
      this.integratedDb.all(`
        SELECT id, apartment_name, sigungu, eup_myeon_dong 
        FROM apartment_complexes
      `, [], (err, rows) => {
        if (err) {
          reject(new Error(`통합 단지 조회 실패: ${err.message}`))
          return
        }
        resolve(rows)
      })
    })
    
    console.log(`🏢 통합 DB 단지: ${integratedComplexes.length}개`)
    
    const matchedListings = []
    let matchCount = 0
    
    for (const listing of naverListings) {
      // 정확한 이름 매칭
      let matchedComplex = integratedComplexes.find(ic => 
        ic.apartment_name === listing.complex_name
      )
      
      // 유사한 이름 매칭
      if (!matchedComplex) {
        matchedComplex = integratedComplexes.find(ic => 
          ic.apartment_name.includes(listing.complex_name) ||
          listing.complex_name.includes(ic.apartment_name)
        )
      }
      
      if (matchedComplex) {
        matchedListings.push({
          ...listing,
          integrated_complex_id: matchedComplex.id
        })
        matchCount++
      }
    }
    
    this.stats.matched_complexes = matchCount
    console.log(`✅ 매칭 완료: ${matchCount}개 매물 (총 ${naverListings.length}개 중)`)
    
    return matchedListings
  }

  async connectListingsToIntegratedDb(matchedListings) {
    console.log('💾 매물 데이터를 통합 DB에 삽입 중...')
    
    const stmt = this.integratedDb.prepare(`
      INSERT INTO current_listings (
        complex_id, listing_price, monthly_rent, deposit,
        area_pyeong, area_sqm, floor_info, listing_type,
        description, source_type, crawled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'naver', CURRENT_TIMESTAMP)
    `)
    
    let insertCount = 0
    
    return new Promise((resolve, reject) => {
      this.integratedDb.serialize(() => {
        this.integratedDb.run('BEGIN TRANSACTION')
        
        for (const listing of matchedListings) {
        try {
          const parsedPrice = this.parseListingPrice(listing)
          
          if (!parsedPrice) {
            this.stats.skipped_invalid++
            continue
          }
          
          // 면적 정보 파싱
          const areaInfo = this.parseAreaInfo(listing.area_info)
          
          stmt.run([
            listing.integrated_complex_id,
            parsedPrice.sale_price,
            parsedPrice.monthly_rent,
            parsedPrice.deposit,
            areaInfo.pyeong,
            areaInfo.sqm,
            listing.floor_info,
            parsedPrice.type,
            listing.description || listing.original_text,
          ])
          
          insertCount++
          this.updatePriceStatistics(parsedPrice)
          
        } catch (err) {
          console.warn(`⚠️  매물 삽입 실패: ${listing.complex_name} - ${err.message}`)
          this.stats.skipped_invalid++
        }
      }
      
        this.integratedDb.run('COMMIT', (err) => {
          stmt.finalize()
          
          if (err) {
            reject(new Error(`매물 데이터 커밋 실패: ${err.message}`))
            return
          }
          
          this.stats.connected_listings = insertCount
          console.log(`✅ 매물 데이터 ${insertCount}개 삽입 완료`)
          resolve()
        })
      })
    })
  }

  parseListingPrice(listing) {
    const priceText = listing.price_text
    const dealType = listing.deal_type
    
    if (!priceText || priceText === '정보없음') {
      return null
    }
    
    let result = {
      type: 'sale',
      sale_price: null,
      monthly_rent: null,
      deposit: null
    }
    
    // 가격 파싱 함수 (억, 만원 단위 처리)
    const parsePrice = (text) => {
      if (!text) return null
      
      let totalWon = 0
      
      // 억 단위 처리
      const eokMatch = text.match(/([\d,]+)억/)
      if (eokMatch) {
        totalWon += parseInt(eokMatch[1].replace(/,/g, '')) * 10000
      }
      
      // 만원 단위 처리 (억 다음에 오는 숫자)
      const manMatch = text.match(/억\s*([\d,]+)/)
      if (manMatch) {
        totalWon += parseInt(manMatch[1].replace(/,/g, ''))
      } else {
        // 억 단위가 없는 경우 전체를 만원으로 처리
        const onlyNumberMatch = text.match(/^([\d,]+)$/)
        if (onlyNumberMatch && !eokMatch) {
          totalWon = parseInt(onlyNumberMatch[1].replace(/,/g, ''))
        }
      }
      
      return totalWon > 0 ? totalWon : null
    }
    
    // 거래 유형별 가격 파싱
    if (dealType === '매매' || priceText.includes('매매')) {
      result.type = 'sale'
      result.sale_price = parsePrice(priceText)
    } else if (dealType === '전세' || priceText.includes('전세')) {
      result.type = 'jeonse'
      result.deposit = parsePrice(priceText)
    } else if (dealType === '월세' || priceText.includes('월세')) {
      result.type = 'monthly'
      
      // 월세는 "보증금/월세" 형태일 수 있음
      const parts = priceText.split(/[\/\s]+/)
      if (parts.length >= 2) {
        result.deposit = parsePrice(parts[0])
        result.monthly_rent = parsePrice(parts[1])
      } else {
        result.monthly_rent = parsePrice(priceText)
      }
    } else {
      // 기본적으로 매매로 처리
      result.type = 'sale'
      result.sale_price = parsePrice(priceText)
    }
    
    return result
  }

  parseAreaInfo(areaText) {
    let pyeong = null
    let sqm = null
    
    if (areaText) {
      // 평수 추출 (예: "33평", "25.7평")
      const pyeongMatch = areaText.match(/([\d.]+)평/)
      if (pyeongMatch) {
        pyeong = parseFloat(pyeongMatch[1])
        sqm = pyeong * 3.3058 // 평을 제곱미터로 변환
      }
      
      // 제곱미터 추출 (예: "84㎡", "59.5m²")
      const sqmMatch = areaText.match(/([\d.]+)[㎡m²]/)
      if (sqmMatch && !sqm) {
        sqm = parseFloat(sqmMatch[1])
        pyeong = sqm / 3.3058 // 제곱미터를 평으로 변환
      }
    }
    
    return { pyeong, sqm }
  }

  updatePriceStatistics(priceData) {
    const { type, sale_price, monthly_rent, deposit } = priceData
    
    if (type === 'sale' && sale_price) {
      this.updateRangeStats(this.stats.price_ranges.sale, sale_price)
    } else if (type === 'jeonse' && deposit) {
      this.updateRangeStats(this.stats.price_ranges.jeonse, deposit)
    } else if (type === 'monthly' && monthly_rent) {
      this.updateRangeStats(this.stats.price_ranges.monthly, monthly_rent)
    }
  }

  updateRangeStats(range, price) {
    range.count++
    range.avg = ((range.avg * (range.count - 1)) + price) / range.count
    
    if (range.min === null || price < range.min) {
      range.min = price
    }
    if (range.max === null || price > range.max) {
      range.max = price
    }
  }

  async updateListingStatistics() {
    console.log('📊 매물 통계 업데이트 중...')
    
    const updateQuery = `
      UPDATE apartment_complexes 
      SET 
        has_naver_data = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT DISTINCT complex_id 
        FROM current_listings 
        WHERE source_type = 'naver'
      )
    `
    
    return new Promise((resolve, reject) => {
      this.integratedDb.run(updateQuery, [], function(err) {
        if (err) {
          reject(new Error(`통계 업데이트 실패: ${err.message}`))
          return
        }
        
        console.log(`✅ ${this.changes}개 단지의 네이버 데이터 플래그 업데이트`)
        resolve()
      })
    })
  }

  async closeDatabases() {
    return new Promise((resolve) => {
      let closed = 0
      const total = 2
      
      const checkComplete = () => {
        closed++
        if (closed === total) resolve()
      }
      
      if (this.naverDb) {
        this.naverDb.close(checkComplete)
      } else {
        checkComplete()
      }
      
      if (this.integratedDb) {
        this.integratedDb.close(checkComplete)
      } else {
        checkComplete()
      }
    })
  }

  printResults() {
    console.log('\n🎉 네이버 매물호가 데이터 연결 완료!')
    console.log('=' .repeat(60))
    console.log(`📊 연결 결과:`)
    console.log(`   • 조회된 네이버 매물: ${this.stats.total_naver_listings.toLocaleString()}개`)
    console.log(`   • 매칭된 단지: ${this.stats.matched_complexes.toLocaleString()}개`)
    console.log(`   • 연결된 매물: ${this.stats.connected_listings.toLocaleString()}개`)
    console.log(`   • 건너뛴 무효 매물: ${this.stats.skipped_invalid.toLocaleString()}개`)
    
    console.log(`\n💰 가격 통계:`)
    
    if (this.stats.price_ranges.sale.count > 0) {
      const sale = this.stats.price_ranges.sale
      console.log(`   📈 매매가 (${sale.count}개):`)
      console.log(`      • 최저: ${sale.min?.toLocaleString()}만원`)
      console.log(`      • 최고: ${sale.max?.toLocaleString()}만원`)
      console.log(`      • 평균: ${Math.round(sale.avg).toLocaleString()}만원`)
    }
    
    if (this.stats.price_ranges.jeonse.count > 0) {
      const jeonse = this.stats.price_ranges.jeonse
      console.log(`   🏠 전세가 (${jeonse.count}개):`)
      console.log(`      • 최저: ${jeonse.min?.toLocaleString()}만원`)
      console.log(`      • 최고: ${jeonse.max?.toLocaleString()}만원`)
      console.log(`      • 평균: ${Math.round(jeonse.avg).toLocaleString()}만원`)
    }
    
    if (this.stats.price_ranges.monthly.count > 0) {
      const monthly = this.stats.price_ranges.monthly
      console.log(`   📅 월세 (${monthly.count}개):`)
      console.log(`      • 최저: ${monthly.min?.toLocaleString()}만원`)
      console.log(`      • 최고: ${monthly.max?.toLocaleString()}만원`)
      console.log(`      • 평균: ${Math.round(monthly.avg).toLocaleString()}만원`)
    }
    
    if (this.stats.errors.length > 0) {
      console.log(`\n⚠️  오류 ${this.stats.errors.length}개:`)
      this.stats.errors.forEach(error => console.log(`   • ${error}`))
    }
    
    console.log(`\n🎯 다음 단계: 매물 없는 단지들을 위한 네이버 크롤링 계획 수립`)
  }
}

// 실행
if (require.main === module) {
  const connector = new NaverListingsConnector()
  connector.run().catch(console.error)
}

module.exports = NaverListingsConnector