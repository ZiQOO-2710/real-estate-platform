#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const fs = require('fs')
const path = require('path')

class JsonDataExtractor {
  constructor() {
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/integrated_real_estate.db'
    this.jsonOutputPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/output'
    this.integratedDb = null
    
    this.stats = {
      json_files_processed: 0,
      complexes_extracted: 0,
      listings_extracted: 0,
      complexes_matched: 0,
      complexes_created: 0,
      listings_added: 0,
      errors: 0
    }
  }

  async initialize() {
    console.log('🔧 JSON 데이터 추출 시스템 초기화 중...')
    this.integratedDb = new sqlite3.Database(this.integratedDbPath)
    console.log('✅ 데이터베이스 연결 완료')
  }

  async processJsonFiles() {
    console.log('🚀 JSON 파일 처리 시작')

    // JSON 파일 목록 조회
    const jsonFiles = fs.readdirSync(this.jsonOutputPath)
      .filter(file => file.startsWith('enhanced_complex_') && file.endsWith('.json'))
      .slice(0, 50) // 처음 50개 파일만 처리

    console.log(`📊 ${jsonFiles.length}개 JSON 파일 처리 예정`)

    for (const fileName of jsonFiles) {
      try {
        await this.processJsonFile(fileName)
        this.stats.json_files_processed++
        
        if (this.stats.json_files_processed % 10 === 0) {
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

  async processJsonFile(fileName) {
    const filePath = path.join(this.jsonOutputPath, fileName)
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const data = JSON.parse(fileContent)

    // 단지 정보 추출
    const complexInfo = this.extractComplexInfo(data)
    if (!complexInfo) {
      return
    }

    this.stats.complexes_extracted++

    // 매물 정보 추출  
    const listings = this.extractListings(data)
    this.stats.listings_extracted += listings.length

    // 기존 단지 매칭 시도
    let complexId = await this.findMatchingComplex(complexInfo)
    
    if (complexId) {
      // 기존 단지에 네이버 데이터 연결
      await this.updateComplexWithNaverData(complexId, complexInfo)
      await this.createNaverMapping(complexId, complexInfo.complex_id)
      this.stats.complexes_matched++
    } else {
      // 새 단지 생성
      complexId = await this.createNewComplex(complexInfo)
      await this.createNaverMapping(complexId, complexInfo.complex_id)
      this.stats.complexes_created++
    }

    // 매물 정보 추가
    for (const listing of listings) {
      try {
        await this.addListing(complexId, listing)
        this.stats.listings_added++
      } catch (error) {
        console.error(`매물 추가 실패:`, error.message)
      }
    }
  }

  extractComplexInfo(data) {
    // JSON 데이터에서 단지 정보 추출
    const basicInfo = data.basic_info || {}
    const crawlerInfo = data.crawler_info || {}
    const listings = data.current_listings || []

    if (!basicInfo.complexId && !crawlerInfo.complex_id) {
      return null
    }

    // 매물에서 단지명 추출 (첫 번째 매물의 텍스트에서)
    let complexName = '정보없음'
    let address = ''
    
    if (listings.length > 0) {
      const firstListing = listings[0]
      if (firstListing.text) {
        // "정든한진6차 601동매매14억..." 에서 단지명 추출
        const complexNameMatch = firstListing.text.match(/^([^\s]+(?:\s*\d+차)?)\s+\d+동/)
        if (complexNameMatch) {
          complexName = complexNameMatch[1].trim()
        }
      }
    }

    // URL에서 지역 정보 추출 시도
    if (basicInfo.url) {
      const urlMatch = basicInfo.url.match(/ms=([0-9.]+),([0-9.]+)/)
      if (urlMatch) {
        address = `추정좌표: ${urlMatch[1]}, ${urlMatch[2]}`
      }
    }

    return {
      complex_id: basicInfo.complexId || crawlerInfo.complex_id,
      name: complexName,
      address: address,
      source_url: basicInfo.source_url || basicInfo.url,
      extracted_at: basicInfo.extracted_at || crawlerInfo.crawled_at,
      listing_count: listings.length
    }
  }

  extractListings(data) {
    const listings = data.current_listings || []
    
    return listings.map(listing => ({
      original_text: listing.text,
      deal_type: this.normalizeDealType(listing.deal_type),
      price: this.parsePrice(listing.price),
      floor_info: listing.floor,
      area_info: listing.area,
      extracted_at: listing.extracted_at
    })).filter(listing => listing.deal_type) // 거래유형이 있는 것만
  }

  normalizeDealType(dealType) {
    if (!dealType) return null
    
    const normalized = dealType.toLowerCase().trim()
    if (normalized.includes('매매') || normalized === 'sale') return '매매'
    if (normalized.includes('전세') || normalized === 'jeonse') return '전세'
    if (normalized.includes('월세') || normalized === 'monthly') return '월세'
    
    return null
  }

  parsePrice(priceStr) {
    if (!priceStr) return null
    
    // "14억 5,000", "8억", "22억" 등의 형식 파싱
    const cleanPrice = priceStr.replace(/[,\s]/g, '')
    
    // 억원 단위 추출
    const billionMatch = cleanPrice.match(/(\d+(?:\.\d+)?)억/)
    if (billionMatch) {
      let amount = parseFloat(billionMatch[1]) * 10000 // 만원 단위로 변환
      
      // 천만원 단위 추출
      const tenMillionMatch = cleanPrice.match(/(\d+)천/)
      if (tenMillionMatch) {
        amount += parseInt(tenMillionMatch[1]) * 1000
      }
      
      // 만원 단위 추출  
      const millionMatch = cleanPrice.match(/억.*?(\d+)(?!억)/)
      if (millionMatch) {
        amount += parseInt(millionMatch[1])
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

  async findMatchingComplex(complexInfo) {
    return new Promise((resolve, reject) => {
      // 1. 정확한 이름 매칭
      const query = `
        SELECT id FROM apartment_complexes 
        WHERE name LIKE ?
        LIMIT 1
      `
      
      this.integratedDb.get(query, [`%${complexInfo.name}%`], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.id : null)
      })
    })
  }

  async createNewComplex(complexInfo) {
    // 좌표 생성 (기본값: 서울 중심가)
    const coords = this.generateCoordinates(complexInfo.address)
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO apartment_complexes (
          complex_code, name, latitude, longitude,
          address_normalized, sido, sigungu, eup_myeon_dong,
          completion_year, total_households, total_buildings,
          data_sources, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      
      const values = [
        `NAVER_JSON_${complexInfo.complex_id}_${Date.now()}`,
        complexInfo.name,
        coords.lat,
        coords.lng,
        complexInfo.address,
        '서울특별시', // 기본값
        '미확인',
        '미확인',
        null, // completion_year
        null, // total_households  
        null, // total_buildings
        JSON.stringify(['naver'])
      ]

      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  async updateComplexWithNaverData(complexId, complexInfo) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE apartment_complexes 
        SET 
          data_sources = json_insert(
            COALESCE(data_sources, '[]'),
            '$[#]',
            'naver'
          ),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
      
      this.integratedDb.run(query, [complexId], (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async createNaverMapping(complexId, naverComplexId) {
    return new Promise((resolve, reject) => {
      // 중복 매핑 체크
      const checkQuery = `
        SELECT id FROM source_complex_mapping 
        WHERE apartment_complex_id = ? AND source_type = 'naver' AND source_id = ?
      `
      
      this.integratedDb.get(checkQuery, [complexId, naverComplexId], (err, row) => {
        if (err) {
          reject(err)
          return
        }
        
        if (row) {
          // 이미 매핑이 존재함
          resolve()
          return
        }
        
        // 새 매핑 생성
        const insertQuery = `
          INSERT INTO source_complex_mapping (
            apartment_complex_id, source_type, source_id, 
            matching_method, matching_confidence
          ) VALUES (?, ?, ?, ?, ?)
        `
        
        this.integratedDb.run(insertQuery, [
          complexId, 'naver', naverComplexId, 'manual', 0.9
        ], (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    })
  }

  async addListing(complexId, listing) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO current_listings (
          apartment_complex_id, listing_id, deal_type,
          price_sale, area_exclusive, floor_current, 
          description, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
      
      const values = [
        complexId,
        `json_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        listing.deal_type,
        listing.deal_type === '매매' ? listing.price : null,
        null, // area_exclusive (JSON에서 정확히 파싱하기 어려움)
        this.parseFloor(listing.floor_info),
        listing.original_text,
        'active'
      ]

      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  parseFloor(floorInfo) {
    if (!floorInfo) return null
    
    const match = floorInfo.match(/(\d+)층/)
    return match ? parseInt(match[1]) : null
  }

  generateCoordinates(address) {
    // 기본값: 서울 중심가
    let baseCoords = { lat: 37.5665, lng: 126.9780 }
    
    // 주소에서 좌표 정보가 있다면 사용
    if (address && address.includes('추정좌표:')) {
      const coordMatch = address.match(/추정좌표:\s*([0-9.]+),\s*([0-9.]+)/)
      if (coordMatch) {
        baseCoords = {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        }
      }
    }
    
    // 약간의 랜덤 오프셋 추가
    return {
      lat: baseCoords.lat + (Math.random() - 0.5) * 0.01,
      lng: baseCoords.lng + (Math.random() - 0.5) * 0.01
    }
  }

  printStats() {
    console.log(`   📊 처리 현황:`)
    console.log(`      - JSON 파일 처리: ${this.stats.json_files_processed}개`)
    console.log(`      - 단지 추출: ${this.stats.complexes_extracted}개`)
    console.log(`      - 매물 추출: ${this.stats.listings_extracted}개`)
    console.log(`      - 단지 매칭: ${this.stats.complexes_matched}개`)
    console.log(`      - 신규 단지: ${this.stats.complexes_created}개`)
    console.log(`      - 매물 추가: ${this.stats.listings_added}개`)
  }

  printFinalStats() {
    console.log('\n' + '='.repeat(60))
    console.log('🎉 JSON 데이터 추출 완료!')
    console.log('='.repeat(60))
    console.log(`📊 최종 처리 결과:`)
    console.log(`   • JSON 파일 처리: ${this.stats.json_files_processed}개`)
    console.log(`   • 단지 추출: ${this.stats.complexes_extracted}개`)
    console.log(`   • 매물 추출: ${this.stats.listings_extracted}개`)
    console.log(`   • 기존 단지 매칭: ${this.stats.complexes_matched}개`)
    console.log(`   • 신규 단지 생성: ${this.stats.complexes_created}개`)
    console.log(`   • 매물 데이터 추가: ${this.stats.listings_added}개`)
    console.log(`   • 오류 발생: ${this.stats.errors}개`)
    
    const totalComplexes = this.stats.complexes_matched + this.stats.complexes_created
    console.log(`   • 총 처리된 단지: ${totalComplexes}개`)
    console.log('='.repeat(60))
  }

  async run() {
    try {
      await this.initialize()
      await this.processJsonFiles()
      
      // 최종 결과 확인
      const finalCount = await new Promise((resolve, reject) => {
        this.integratedDb.get('SELECT COUNT(*) as count FROM apartment_complexes', [], (err, row) => {
          if (err) reject(err)
          else resolve(row.count)
        })
      })
      
      const listingCount = await new Promise((resolve, reject) => {
        this.integratedDb.get('SELECT COUNT(*) as count FROM current_listings', [], (err, row) => {
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
      console.log(`✅ 총 매물 수: ${listingCount}개`)
      console.log(`✅ 네이버 JSON 매핑: ${mappingCount}개`)
      
    } catch (error) {
      console.error('❌ JSON 데이터 추출 실패:', error)
    } finally {
      if (this.integratedDb) this.integratedDb.close()
    }
  }
}

// 실행
if (require.main === module) {
  const extractor = new JsonDataExtractor()
  extractor.run()
}

module.exports = JsonDataExtractor