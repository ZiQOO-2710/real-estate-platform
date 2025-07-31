/**
 * 네이버 부동산 데이터 전용 API 라우터
 * 좌표 정보와 실시간 매물 데이터 제공
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

// 네이버 DB 연결
const naverDbPath = path.join(__dirname, '../../../modules/naver-crawler/data/naver_real_estate.db')
let naverDb = null

const initializeNaverDb = () => {
  if (!naverDb) {
    naverDb = new sqlite3.Database(naverDbPath, (err) => {
      if (err) {
        console.error('네이버 DB 연결 실패:', err)
      } else {
        console.log('✅ 네이버 DB 연결 완료')
      }
    })
  }
  return naverDb
}

/**
 * GET /api/naver/complexes
 * 네이버 아파트 단지 목록 조회 (좌표 포함)
 */
router.get('/complexes', async (req, res) => {
  try {
    const db = initializeNaverDb()
    const {
      keyword = '',
      region = '',
      limit = 100,
      offset = 0,
      withCoordinates = 'true'
    } = req.query

    let query = `
      SELECT 
        id,
        complex_name as name,
        address,
        completion_year,
        total_households,
        total_buildings,
        created_at
      FROM apartment_complexes
      WHERE 1=1
    `
    const params = []

    // 키워드 검색
    if (keyword) {
      query += ` AND complex_name LIKE ?`
      params.push(`%${keyword}%`)
    }

    // 지역 검색
    if (region) {
      query += ` AND address LIKE ?`
      params.push(`%${region}%`)
    }

    // 정렬 및 제한
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    const complexes = await queryNaverDb(query, params)

    // 각 단지의 현재 매물 수 조회
    const complexesWithStats = await Promise.all(
      complexes.map(async (complex) => {
        const listingCount = await queryNaverDb(`
          SELECT COUNT(*) as count 
          FROM current_listings 
          WHERE complex_id = ?
        `, [complex.complex_id || complex.id])

        return {
          ...complex,
          current_listing_count: listingCount[0]?.count || 0,
          source: 'naver'
        }
      })
    )

    res.json({
      data: complexesWithStats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: complexes.length === parseInt(limit)
      },
      filters: { keyword, region, withCoordinates },
      source: 'naver_db'
    })

  } catch (error) {
    console.error('네이버 단지 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '네이버 단지 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/naver/complexes/:id
 * 특정 네이버 단지 상세 정보
 */
router.get('/complexes/:id', async (req, res) => {
  try {
    const db = initializeNaverDb()
    const complexId = parseInt(req.params.id)

    const complex = await queryNaverDb(`
      SELECT * FROM apartment_complexes WHERE id = ?
    `, [complexId])

    if (complex.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: '해당 단지를 찾을 수 없습니다.'
      })
    }

    // 현재 매물 조회 (complex_id 사용)
    const complex_id = complex[0].complex_id;
    const listings = await queryNaverDb(`
      SELECT 
        id,
        deal_type,
        price_amount,
        deposit_amount,
        monthly_rent,
        area_sqm,
        area_pyeong,
        floor_info,
        direction,
        room_structure,
        description,
        extracted_at
      FROM current_listings 
      WHERE complex_id = ?
      ORDER BY extracted_at DESC
      LIMIT 50
    `, [complex_id])

    res.json({
      complex: {
        ...complex[0],
        source: 'naver'
      },
      listings: listings.map(listing => ({
        ...listing,
        source: 'naver'
      })),
      summary: {
        total_listings: listings.length,
        deal_types: [...new Set(listings.map(l => l.deal_type))]
      }
    })

  } catch (error) {
    console.error('네이버 단지 상세 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '단지 상세 정보 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/naver/listings
 * 네이버 매물 목록 조회
 */
router.get('/listings', async (req, res) => {
  try {
    const db = initializeNaverDb()
    const {
      complexId,
      dealType = '',
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      limit = 50,
      offset = 0
    } = req.query

    let query = `
      SELECT 
        cl.*,
        ac.complex_name,
        ac.address as complex_address
      FROM current_listings cl
      JOIN apartment_complexes ac ON cl.complex_id = ac.complex_id
      WHERE 1=1
    `
    const params = []

    // 단지 필터
    if (complexId) {
      query += ` AND ac.id = ?`
      params.push(parseInt(complexId))
    }

    // 거래 유형 필터
    if (dealType) {
      query += ` AND cl.deal_type = ?`
      params.push(dealType)
    }

    // 가격 필터
    if (priceMin) {
      query += ` AND cl.price_amount >= ?`
      params.push(parseInt(priceMin))
    }
    if (priceMax) {
      query += ` AND cl.price_amount <= ?`
      params.push(parseInt(priceMax))
    }

    // 면적 필터
    if (areaMin) {
      query += ` AND cl.area_sqm >= ?`
      params.push(parseFloat(areaMin))
    }
    if (areaMax) {
      query += ` AND cl.area_sqm <= ?`
      params.push(parseFloat(areaMax))
    }

    // 정렬 및 제한
    query += ` ORDER BY cl.extracted_at DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    const listings = await queryNaverDb(query, params)

    res.json({
      data: listings.map(listing => ({
        ...listing,
        source: 'naver'
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: listings.length === parseInt(limit)
      },
      filters: { complexId, dealType, priceMin, priceMax, areaMin, areaMax },
      source: 'naver_db'
    })

  } catch (error) {
    console.error('네이버 매물 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '매물 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/naver/coordinates
 * 좌표 데이터 (통합 DB와 연동하여 네이버 단지에 좌표 매핑)
 */
router.get('/coordinates', async (req, res) => {
  try {
    const db = initializeNaverDb()
    const {
      region = '',
      limit = 500
    } = req.query

    // 네이버 단지 데이터 조회
    let query = `
      SELECT 
        ac.id,
        ac.complex_id,
        ac.complex_name as name,
        ac.address,
        ac.completion_year,
        ac.total_households,
        ac.total_buildings,
        COUNT(cl.id) as listing_count
      FROM apartment_complexes ac
      LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
      WHERE 1=1
    `
    const params = []

    // 지역 필터
    if (region) {
      query += ` AND ac.address LIKE ?`
      params.push(`%${region}%`)
    }

    query += ` GROUP BY ac.id ORDER BY listing_count DESC LIMIT ?`
    params.push(parseInt(limit))

    const naverComplexes = await queryNaverDb(query, params)

    // 통합 DB에서 좌표 정보 가져오기
    const sqlite3 = require('sqlite3').verbose()
    const integratedDbPath = require('path').join(__dirname, '../../data/master_integrated_real_estate.db')
    
    const coordData = await new Promise((resolve, reject) => {
      const integratedDb = new sqlite3.Database(integratedDbPath, (err) => {
        if (err) {
          console.warn('통합 DB 연결 실패:', err.message)
          resolve([])
          return
        }
        
        const coordQuery = `SELECT name, latitude, longitude, sido, sigungu FROM apartment_complexes WHERE latitude IS NOT NULL AND longitude IS NOT NULL`
        
        integratedDb.all(coordQuery, [], (err, rows) => {
          integratedDb.close()
          if (err) {
            console.warn('좌표 데이터 조회 실패:', err.message)
            resolve([])
          } else {
            resolve(rows || [])
          }
        })
      })
    })

    // 네이버 단지와 좌표 매핑
    const coordinatedData = naverComplexes.map(complex => {
      // 이름으로 매칭 시도
      const coordMatch = coordData.find(coord => 
        coord.name === complex.name ||
        coord.name?.includes(complex.name?.split(' ')[0]) ||
        complex.name?.includes(coord.name?.split(' ')[0])
      )
      
      if (coordMatch) {
        return {
          id: complex.id,
          complex_id: complex.complex_id,
          name: complex.name,
          address: complex.address,
          latitude: coordMatch.latitude,
          longitude: coordMatch.longitude,
          completion_year: complex.completion_year,
          total_households: complex.total_households,
          total_buildings: complex.total_buildings,
          listing_count: complex.listing_count,
          sido: coordMatch.sido,
          sigungu: coordMatch.sigungu,
          source: 'naver',
          coordinate_source: 'integrated_db'
        }
      }
      
      return null
    }).filter(Boolean)

    res.json({
      data: coordinatedData,
      count: coordinatedData.length,
      total_naver_complexes: naverComplexes.length,
      coordinate_match_rate: naverComplexes.length > 0 ? 
        Math.round((coordinatedData.length / naverComplexes.length) * 100) : 0,
      source: 'naver_db',
      coordinate_source: 'integrated_db',
      message: `네이버 ${naverComplexes.length}개 단지 중 ${coordinatedData.length}개 단지에 좌표 매핑 완료`
    })

  } catch (error) {
    console.error('네이버 좌표 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '좌표 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/naver/stats
 * 네이버 데이터 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const db = initializeNaverDb()

    const stats = await queryNaverDb(`
      SELECT 
        COUNT(DISTINCT ac.id) as total_complexes,
        COUNT(cl.id) as total_listings,
        COUNT(DISTINCT cl.deal_type) as deal_types
      FROM apartment_complexes ac
      LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
    `)

    const dealTypeStats = await queryNaverDb(`
      SELECT 
        deal_type,
        COUNT(*) as count,
        AVG(price_amount) as avg_price,
        MIN(price_amount) as min_price,
        MAX(price_amount) as max_price
      FROM current_listings
      WHERE price_amount > 0
      GROUP BY deal_type
      ORDER BY count DESC
    `)

    res.json({
      overview: stats[0],
      deal_types: dealTypeStats,
      source: 'naver_db',
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('네이버 통계 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '통계 데이터 조회에 실패했습니다.'
    })
  }
})

// 헬퍼 함수
function queryNaverDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = initializeNaverDb()
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err)
      } else {
        resolve(rows || [])
      }
    })
  })
}

module.exports = router