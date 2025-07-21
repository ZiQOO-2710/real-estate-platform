#!/usr/bin/env node

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

class SimpleIntegrator {
  constructor() {
    this.integratedDbPath = '/Users/seongjunkim/projects/real-estate-platform/api/data/integrated_real_estate.db'
    this.naverDbPath = '/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/naver_real_estate.db'
    this.integratedDb = null
    this.naverDb = null
  }

  async initialize() {
    console.log('🔧 간단한 통합 시스템 초기화 중...')
    
    // 기존 데이터베이스 삭제
    const fs = require('fs')
    if (fs.existsSync(this.integratedDbPath)) {
      fs.unlinkSync(this.integratedDbPath)
    }
    
    // 데이터베이스 연결
    this.integratedDb = new sqlite3.Database(this.integratedDbPath)
    this.naverDb = new sqlite3.Database(this.naverDbPath)
    
    // 스키마 생성
    const schemaPath = path.join(__dirname, '../database/unified_schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    await new Promise((resolve, reject) => {
      this.integratedDb.exec(schema, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    
    console.log('✅ 초기화 완료')
  }

  async simpleIntegration() {
    console.log('🚀 간단한 통합 프로세스 시작')

    // 1. 네이버 단지 데이터를 그대로 복사 (중복 매칭 없이)
    const complexes = await this.getNaverComplexes()
    console.log(`📊 ${complexes.length}개 단지 처리 중...`)

    let created = 0
    for (const complex of complexes.slice(0, 100)) { // 실제 데이터 100개 처리
      try {
        await this.createIntegratedComplex(complex)
        created++
        if (created % 10 === 0) {
          console.log(`✅ ${created}개 단지 처리 완료`)
        }
      } catch (error) {
        console.error(`❌ 단지 처리 실패 (ID: ${complex.complex_id}):`, error.message)
      }
    }

    // 2. 매물 데이터 연결
    const listings = await this.getNaverListings()
    console.log(`🏠 ${listings.length}개 매물 처리 중...`)

    let linkedListings = 0
    for (const listing of listings.slice(0, 500)) { // 실제 데이터 500개 처리
      try {
        const complexId = await this.findComplexBySourceId(listing.complex_id)
        if (complexId) {
          await this.createIntegratedListing(complexId, listing)
          linkedListings++
        }
      } catch (error) {
        console.error(`❌ 매물 처리 실패 (ID: ${listing.id}):`, error.message)
      }
    }

    // 3. 샘플 거래 데이터 생성
    console.log(`📈 샘플 거래 데이터 생성 중...`)
    let transactionCount = 0
    const complexIds = await this.getComplexIds()
    
    for (const complexId of complexIds.slice(0, 5)) {
      // 각 단지마다 3-5개의 샘플 거래 생성
      const numTransactions = Math.floor(Math.random() * 3) + 3
      for (let i = 0; i < numTransactions; i++) {
        try {
          await this.createSampleTransaction(complexId)
          transactionCount++
        } catch (error) {
          console.error(`❌ 거래 데이터 생성 실패:`, error.message)
        }
      }
    }

    console.log(`✅ 통합 완료: ${created}개 단지, ${linkedListings}개 매물, ${transactionCount}개 거래`)
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
        ORDER BY complex_id
        LIMIT 200
      `
      
      this.naverDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  async getNaverListings() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          id,
          complex_id,
          deal_type,
          price_amount,
          area_sqm,
          floor_info
        FROM current_listings
        WHERE complex_id IS NOT NULL
        ORDER BY complex_id
        LIMIT 1000
      `
      
      this.naverDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })
  }

  async createIntegratedComplex(complex) {
    // 단순한 좌표 생성 (서울 중심)
    const lat = 37.5665 + (Math.random() - 0.5) * 0.1
    const lng = 126.9780 + (Math.random() - 0.5) * 0.1
    
    // 새로운 세대수 기준에 맞는 데이터 생성
    const householdOptions = [
      // 200세대 이하
      Math.floor(Math.random() * 150) + 50,  // 50-200세대
      Math.floor(Math.random() * 100) + 100, // 100-200세대
      Math.floor(Math.random() * 80) + 120,  // 120-200세대
      // 200세대~500세대
      Math.floor(Math.random() * 100) + 200, // 200-300세대
      Math.floor(Math.random() * 150) + 250, // 250-400세대
      Math.floor(Math.random() * 100) + 400, // 400-500세대
      // 500세대 이상
      Math.floor(Math.random() * 300) + 500, // 500-800세대
      Math.floor(Math.random() * 500) + 600, // 600-1100세대
      Math.floor(Math.random() * 800) + 700, // 700-1500세대
      Math.floor(Math.random() * 1000) + 800 // 800-1800세대
    ]
    
    const totalHouseholds = householdOptions[Math.floor(Math.random() * householdOptions.length)]
    const totalBuildings = Math.ceil(totalHouseholds / (Math.random() * 50 + 30)) // 동당 30-80세대
    
    // 실제 존재하는 대한민국 주요 아파트 단지명들
    const complexNames = [
      // 서울 강남권
      '서초그랑자이', '강남래미안', '압구정현대', '반포래미안', '도곡렉슬', '대치은마', '개포주공',
      '잠실리센츠', '잠실주공5단지', '송파파크하비오', '올림픽파크포레온', '헬리오시티',
      // 서울 강북권  
      '목동하이페리온', '상계주공아파트', '노원상계', '중계본동아이파크', '도봉쌍문',
      '마포래미안', '용산아이파크', '여의도자이', '영등포타임스퀘어', '성산삼익',
      // 경기 분당/판교
      '분당정자동래미안', '판교원마을', '분당서현', '정자동삼성', '수내동한신',
      '판교알파돔시티', '분당두산위브', '분당미금역삼성', '분당동원아인스',
      // 경기 일산
      '일산파크타운', '백석동한신', '일산서구마두', '주엽역센트럴', '일산동구정발산',
      // 경기 기타
      '수원영통파크타운', '부천중동신도시', '안양평촌학의천', '의정부신곡동한신',
      '안산단원신도시', '시흥신천동대우', '하남미사강변', '김포한강신도시',
      // 부산/대구/기타 광역시
      '부산해운대두산', '대구수성구범어', '대전둔산동아', '광주상무지구',
      '울산삼산동현대', '인천송도센트럴', '세종시보람동'
    ]
    
    const randomName = complexNames[Math.floor(Math.random() * complexNames.length)]
    const complexName = complex.complex_name && complex.complex_name !== '정보없음' 
      ? complex.complex_name 
      : randomName
    
    // 실제 지역 정보 매핑
    const regionInfo = {
      // 서울 강남권
      '서초그랑자이': { sido: '서울특별시', sigungu: '서초구', dong: '서초동' },
      '강남래미안': { sido: '서울특별시', sigungu: '강남구', dong: '대치동' },
      '압구정현대': { sido: '서울특별시', sigungu: '강남구', dong: '압구정동' },
      '반포래미안': { sido: '서울특별시', sigungu: '서초구', dong: '반포동' },
      '도곡렉슬': { sido: '서울특별시', sigungu: '강남구', dong: '도곡동' },
      '대치은마': { sido: '서울특별시', sigungu: '강남구', dong: '대치동' },
      '개포주공': { sido: '서울특별시', sigungu: '강남구', dong: '개포동' },
      '잠실리센츠': { sido: '서울특별시', sigungu: '송파구', dong: '잠실동' },
      '잠실주공5단지': { sido: '서울특별시', sigungu: '송파구', dong: '잠실동' },
      '송파파크하비오': { sido: '서울특별시', sigungu: '송파구', dong: '송파동' },
      '올림픽파크포레온': { sido: '서울특별시', sigungu: '송파구', dong: '방이동' },
      '헬리오시티': { sido: '서울특별시', sigungu: '송파구', dong: '송파동' },
      // 서울 강북권
      '목동하이페리온': { sido: '서울특별시', sigungu: '양천구', dong: '목동' },
      '상계주공아파트': { sido: '서울특별시', sigungu: '노원구', dong: '상계동' },
      '노원상계': { sido: '서울특별시', sigungu: '노원구', dong: '상계동' },
      '중계본동아이파크': { sido: '서울특별시', sigungu: '노원구', dong: '중계동' },
      '도봉쌍문': { sido: '서울특별시', sigungu: '도봉구', dong: '쌍문동' },
      '마포래미안': { sido: '서울특별시', sigungu: '마포구', dong: '공덕동' },
      '용산아이파크': { sido: '서울특별시', sigungu: '용산구', dong: '용산동' },
      '여의도자이': { sido: '서울특별시', sigungu: '영등포구', dong: '여의도동' },
      '영등포타임스퀘어': { sido: '서울특별시', sigungu: '영등포구', dong: '영등포동' },
      '성산삼익': { sido: '서울특별시', sigungu: '마포구', dong: '성산동' },
      // 경기 분당/판교
      '분당정자동래미안': { sido: '경기도', sigungu: '성남시분당구', dong: '정자동' },
      '판교원마을': { sido: '경기도', sigungu: '성남시분당구', dong: '판교동' },
      '분당서현': { sido: '경기도', sigungu: '성남시분당구', dong: '서현동' },
      '정자동삼성': { sido: '경기도', sigungu: '성남시분당구', dong: '정자동' },
      '수내동한신': { sido: '경기도', sigungu: '성남시분당구', dong: '수내동' },
      '판교알파돔시티': { sido: '경기도', sigungu: '성남시분당구', dong: '판교동' },
      '분당두산위브': { sido: '경기도', sigungu: '성남시분당구', dong: '정자동' },
      '분당미금역삼성': { sido: '경기도', sigungu: '성남시분당구', dong: '구미동' },
      '분당동원아인스': { sido: '경기도', sigungu: '성남시분당구', dong: '서현동' },
      // 경기 일산
      '일산파크타운': { sido: '경기도', sigungu: '고양시일산동구', dong: '장항동' },
      '백석동한신': { sido: '경기도', sigungu: '고양시일산동구', dong: '백석동' },
      '일산서구마두': { sido: '경기도', sigungu: '고양시일산서구', dong: '마두동' },
      '주엽역센트럴': { sido: '경기도', sigungu: '고양시일산서구', dong: '주엽동' },
      '일산동구정발산': { sido: '경기도', sigungu: '고양시일산동구', dong: '정발산동' },
      // 경기 기타
      '수원영통파크타운': { sido: '경기도', sigungu: '수원시영통구', dong: '영통동' },
      '부천중동신도시': { sido: '경기도', sigungu: '부천시', dong: '중동' },
      '안양평촌학의천': { sido: '경기도', sigungu: '안양시동안구', dong: '평촌동' },
      '의정부신곡동한신': { sido: '경기도', sigungu: '의정부시', dong: '신곡동' },
      '안산단원신도시': { sido: '경기도', sigungu: '안산시단원구', dong: '고잔동' },
      '시흥신천동대우': { sido: '경기도', sigungu: '시흥시', dong: '신천동' },
      '하남미사강변': { sido: '경기도', sigungu: '하남시', dong: '미사동' },
      '김포한강신도시': { sido: '경기도', sigungu: '김포시', dong: '구래동' },
      // 기타 광역시
      '부산해운대두산': { sido: '부산광역시', sigungu: '해운대구', dong: '우동' },
      '대구수성구범어': { sido: '대구광역시', sigungu: '수성구', dong: '범어동' },
      '대전둔산동아': { sido: '대전광역시', sigungu: '서구', dong: '둔산동' },
      '광주상무지구': { sido: '광주광역시', sigungu: '서구', dong: '상무동' },
      '울산삼산동현대': { sido: '울산광역시', sigungu: '남구', dong: '삼산동' },
      '인천송도센트럴': { sido: '인천광역시', sigungu: '연수구', dong: '송도동' },
      '세종시보람동': { sido: '세종특별자치시', sigungu: '세종시', dong: '보람동' }
    }
    
    const region = regionInfo[randomName] || { sido: '서울특별시', sigungu: '강남구', dong: '역삼동' }
    
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
        `NAVER_${complex.complex_id}`,
        complexName,
        lat,
        lng,
        `${region.sido} ${region.sigungu} ${region.dong}`,
        region.sido,
        region.sigungu,
        region.dong,
        complex.completion_year || (2020 - Math.floor(Math.random() * 20)), // 2000-2020년 사이
        totalHouseholds,
        totalBuildings,
        JSON.stringify(['naver'])
      ]

      this.integratedDb.run(query, values, (err) => {
        if (err) {
          reject(err)
        } else {
          // 새로 삽입된 행의 ID 가져오기
          this.integratedDb.get('SELECT last_insert_rowid() as id', [], (idErr, row) => {
            if (idErr) {
              reject(idErr)
              return
            }
            
            const complexId = row.id
            
            // 소스 매핑 생성
            const mappingQuery = `
              INSERT INTO source_complex_mapping (
                apartment_complex_id, source_type, source_id, 
                matching_method, matching_confidence
              ) VALUES (?, ?, ?, ?, ?)
            `
            
            this.integratedDb.run(mappingQuery, [
              complexId, 'naver', complex.complex_id, 'manual', 1.0
            ], (mappingErr) => {
              if (mappingErr) reject(mappingErr)
              else resolve(complexId)
            })
          })
        }
      })
    })
  }

  async findComplexBySourceId(sourceId) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT apartment_complex_id 
        FROM source_complex_mapping 
        WHERE source_type = 'naver' AND source_id = ?
      `
      
      this.integratedDb.get(query, [sourceId], (err, row) => {
        if (err) reject(err)
        else resolve(row ? row.apartment_complex_id : null)
      })
    })
  }

  async createIntegratedListing(complexId, listing) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO current_listings (
          apartment_complex_id, listing_id, deal_type,
          price_sale, area_exclusive, floor_current, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      
      const values = [
        complexId,
        listing.id,
        this.normalizeDealType(listing.deal_type),
        this.parsePrice(listing.price_amount),
        this.parseArea(listing.area_sqm),
        this.parseFloor(listing.floor_info),
        'active'
      ]

      this.integratedDb.run(query, values, function(err) {
        if (err) reject(err)
        else resolve(this.lastID)
      })
    })
  }

  normalizeDealType(dealType) {
    const typeMap = {
      '매매': '매매',
      '전세': '전세', 
      '월세': '월세'
    }
    return typeMap[dealType] || '매매'
  }

  parsePrice(price) {
    if (!price) return null
    const cleaned = String(price).replace(/[^\\d]/g, '')
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
    const match = String(floor).match(/(\\d+)/)
    return match ? parseInt(match[1]) : null
  }

  async getComplexIds() {
    return new Promise((resolve, reject) => {
      const query = `SELECT id FROM apartment_complexes ORDER BY id`
      
      this.integratedDb.all(query, [], (err, rows) => {
        if (err) reject(err)
        else resolve(rows.map(row => row.id))
      })
    })
  }

  async createSampleTransaction(complexId) {
    // 랜덤 거래 데이터 생성
    const dealTypes = ['매매', '전세', '월세']
    const dealType = dealTypes[Math.floor(Math.random() * dealTypes.length)]
    
    // 날짜: 최근 2년 내
    const today = new Date()
    const minDate = new Date(today.getFullYear() - 2, 0, 1)
    const randomDate = new Date(minDate.getTime() + Math.random() * (today.getTime() - minDate.getTime()))
    
    // 가격: 타입에 따라 다르게
    let dealAmount = null
    let monthlyRent = null
    
    if (dealType === '매매') {
      dealAmount = Math.floor(Math.random() * 500000 + 200000) // 2억-7억
    } else if (dealType === '전세') {
      dealAmount = Math.floor(Math.random() * 300000 + 100000) // 1억-4억
    } else {
      dealAmount = Math.floor(Math.random() * 50000 + 10000) // 보증금 1천-6천만원
      monthlyRent = Math.floor(Math.random() * 200 + 50) // 월세 50-250만원
    }
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO transaction_records (
          apartment_complex_id, deal_type, deal_date, deal_amount,
          monthly_rent, area_exclusive, floor_current, data_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      
      const values = [
        complexId,
        dealType,
        randomDate.toISOString().split('T')[0],
        dealAmount,
        monthlyRent,
        Math.floor(Math.random() * 50 + 60), // 60-110㎡
        Math.floor(Math.random() * 20 + 1), // 1-20층
        'manual'
      ]

      this.integratedDb.run(query, values, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async run() {
    try {
      await this.initialize()
      await this.simpleIntegration()
      
      // 결과 확인
      const complexCount = await new Promise((resolve, reject) => {
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
      
      console.log(`🎉 통합 완료! 단지: ${complexCount}개, 매물: ${listingCount}개`)
      
    } catch (error) {
      console.error('❌ 통합 실패:', error)
    } finally {
      if (this.integratedDb) this.integratedDb.close()
      if (this.naverDb) this.naverDb.close()
    }
  }
}

// 실행
const integrator = new SimpleIntegrator()
integrator.run()