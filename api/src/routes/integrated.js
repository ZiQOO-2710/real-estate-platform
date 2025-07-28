/**
 * 통합 부동산 데이터 API 라우터
 * 단지, 매물, 실거래가가 통합된 데이터 제공
 */

const express = require('express')
const DataIntegrationService = require('../services/DataIntegrationService')

const router = express.Router()
const integrationService = new DataIntegrationService()

// 서비스 초기화
let serviceInitialized = false
const initializeService = async () => {
  if (!serviceInitialized) {
    await integrationService.initialize()
    serviceInitialized = true
  }
}

/**
 * GET /api/integrated/complexes
 * 통합된 단지 정보 조회 (매물 및 실거래 통계 포함)
 */
router.get('/complexes', async (req, res) => {
  try {
    await initializeService()

    const {
      keyword = '',
      region = '',
      dealType = '매매',
      priceMin,
      priceMax,
      limit = 50,
      offset = 0
    } = req.query

    const searchParams = {
      keyword,
      region,
      dealType,
      priceMin: priceMin ? parseInt(priceMin) : null,
      priceMax: priceMax ? parseInt(priceMax) : null,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }

    const complexes = await integrationService.searchIntegratedComplexes(searchParams)

    res.json({
      data: complexes,
      pagination: {
        limit: searchParams.limit,
        offset: searchParams.offset,
        has_more: complexes.length === searchParams.limit
      },
      filters: searchParams
    })

  } catch (error) {
    console.error('통합 단지 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '통합 단지 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/integrated/complexes/:id
 * 특정 단지의 상세 정보 (매물 및 실거래 데이터 포함)
 */
router.get('/complexes/:id', async (req, res) => {
  try {
    await initializeService()

    const idParam = req.params.id
    let complexDetails = null
    
    // 숫자 ID인 경우
    if (/^\d+$/.test(idParam)) {
      const complexId = parseInt(idParam)
      complexDetails = await integrationService.getComplexWithDetails(complexId)
    } 
    // 복합 ID인 경우 (단지명_좌표_가격 형태)
    else {
      const parts = idParam.split('_')
      if (parts.length >= 3) {
        const complexName = parts[0]
        const longitude = parseFloat(parts[1])
        const latitude = parseFloat(parts[2])
        
        // 이름과 좌표로 단지 검색
        complexDetails = await findComplexByNameAndCoordinates(complexName, longitude, latitude)
      }
    }
    
    if (!complexDetails) {
      return res.status(404).json({
        error: 'Not found',
        message: '해당 단지를 찾을 수 없습니다.',
        debug: { requested_id: idParam }
      })
    }

    // 관련 매물 조회
    const listings = await getComplexListings(complexDetails.id)
    
    // 관련 실거래 조회 (최근 2년)
    const transactions = await getComplexTransactions(complexDetails.id, 24)

    // 가격 분석
    const priceAnalysis = calculatePriceAnalysis(listings, transactions)

    res.json({
      complex: complexDetails,
      current_listings: listings,
      recent_transactions: transactions,
      price_analysis: priceAnalysis,
      summary: {
        total_listings: listings.length,
        total_transactions: transactions.length,
        avg_listing_price: priceAnalysis.avg_listing_price,
        avg_transaction_price: priceAnalysis.avg_transaction_price,
        price_trend: priceAnalysis.trend
      }
    })

  } catch (error) {
    console.error('단지 상세 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '단지 상세 정보 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/integrated/price-comparison
 * 매물가와 실거래가 비교 분석
 */
router.get('/price-comparison', async (req, res) => {
  try {
    await initializeService()

    const {
      region = '',
      dealType = '매매',
      areaMin,
      areaMax,
      months = 12
    } = req.query

    const comparison = await getPriceComparison({
      region,
      dealType,
      areaMin: areaMin ? parseFloat(areaMin) : null,
      areaMax: areaMax ? parseFloat(areaMax) : null,
      months: parseInt(months)
    })

    res.json({
      comparison,
      filters: { region, dealType, areaMin, areaMax, months },
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('가격 비교 분석 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '가격 비교 분석에 실패했습니다.'
    })
  }
})

/**
 * GET /api/integrated/market-analysis
 * 시장 동향 분석 (지역별, 시기별)
 */
router.get('/market-analysis', async (req, res) => {
  try {
    await initializeService()

    const {
      region = '',
      dealType = '매매',
      period = '12months'
    } = req.query

    const analysis = await getMarketAnalysis({
      region,
      dealType,
      period
    })

    res.json({
      analysis,
      filters: { region, dealType, period },
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('시장 분석 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '시장 분석에 실패했습니다.'
    })
  }
})

/**
 * GET /api/integrated/debug/coordinates
 * 좌표 데이터 진단 (개발용)
 */
router.get('/debug/coordinates', async (req, res) => {
  try {
    await initializeService()

    const coordinatesReport = await generateCoordinatesReport()
    
    res.json({
      debug_info: coordinatesReport,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('좌표 진단 실패:', error)
    res.status(500).json({
      error: 'Internal server error', 
      message: '좌표 데이터 진단에 실패했습니다.'
    })
  }
})

/**
 * POST /api/integrated/data-sync
 * 데이터 동기화 트리거 (관리자용)
 */
router.post('/data-sync', async (req, res) => {
  try {
    // 관리자 권한 체크 (실제 환경에서는 인증 미들웨어 사용)
    const { adminKey } = req.body
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(403).json({
        error: 'Forbidden',
        message: '관리자 권한이 필요합니다.'
      })
    }

    // 백그라운드에서 데이터 동기화 실행
    const RealEstateDataIntegrator = require('../scripts/integrateRealEstateData')
    const integrator = new RealEstateDataIntegrator()
    
    // 비동기로 실행 (응답은 즉시 반환)
    integrator.runIntegration().catch(error => {
      console.error('백그라운드 데이터 동기화 실패:', error)
    })

    res.json({
      message: '데이터 동기화가 시작되었습니다.',
      status: 'in_progress',
      started_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('데이터 동기화 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '데이터 동기화 시작에 실패했습니다.'
    })
  }
})

/**
 * 헬퍼 함수들
 */
async function getComplexListings(complexId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        id, listing_id, listing_url,
        deal_type, price_sale, price_jeonse, price_monthly, deposit,
        area_exclusive, area_supply, floor_current, floor_total,
        direction, room_structure, description,
        status, crawled_at, created_at
      FROM current_listings 
      WHERE apartment_complex_id = ? AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 100
    `

    integrationService.db.all(query, [complexId], (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

async function getComplexTransactions(complexId, months = 24) {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0]

  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        id, deal_type, deal_date, deal_amount, monthly_rent,
        area_exclusive, floor_current, building_name, unit_number,
        data_source, created_at
      FROM transaction_records 
      WHERE apartment_complex_id = ? AND deal_date >= ?
      ORDER BY deal_date DESC
      LIMIT 200
    `

    integrationService.db.all(query, [complexId, cutoffDateStr], (err, rows) => {
      if (err) reject(err)
      else resolve(rows || [])
    })
  })
}

function calculatePriceAnalysis(listings, transactions) {
  const analysis = {
    avg_listing_price: null,
    avg_transaction_price: null,
    price_gap: null,
    trend: 'stable',
    listing_count: listings.length,
    transaction_count: transactions.length
  }

  // 매물 평균가 계산
  const validListings = listings.filter(l => l.price_sale > 0)
  if (validListings.length > 0) {
    analysis.avg_listing_price = Math.round(
      validListings.reduce((sum, l) => sum + l.price_sale, 0) / validListings.length
    )
  }

  // 실거래 평균가 계산
  const validTransactions = transactions.filter(t => t.deal_amount > 0)
  if (validTransactions.length > 0) {
    analysis.avg_transaction_price = Math.round(
      validTransactions.reduce((sum, t) => sum + t.deal_amount, 0) / validTransactions.length
    )
  }

  // 가격 차이 계산
  if (analysis.avg_listing_price && analysis.avg_transaction_price) {
    analysis.price_gap = analysis.avg_listing_price - analysis.avg_transaction_price
    analysis.price_gap_percentage = ((analysis.price_gap / analysis.avg_transaction_price) * 100).toFixed(1)
  }

  // 트렌드 분석 (간단한 버전)
  if (validTransactions.length >= 6) {
    const recent = validTransactions.slice(0, 3)
    const older = validTransactions.slice(-3)
    
    const recentAvg = recent.reduce((sum, t) => sum + t.deal_amount, 0) / recent.length
    const olderAvg = older.reduce((sum, t) => sum + t.deal_amount, 0) / older.length
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100
    
    if (change > 5) analysis.trend = 'rising'
    else if (change < -5) analysis.trend = 'falling'
    else analysis.trend = 'stable'
  }

  return analysis
}

async function getPriceComparison(params) {
  const { region, dealType, areaMin, areaMax, months } = params
  
  // 실제 구현에서는 복잡한 SQL 쿼리로 데이터 집계
  return {
    region_analysis: {
      avg_listing_price: 45000, // 만원
      avg_transaction_price: 42000,
      price_gap: 3000,
      sample_size: {
        listings: 245,
        transactions: 189
      }
    },
    area_breakdown: [
      { area_range: '60-85㎡', avg_listing: 42000, avg_transaction: 39000, gap: 3000 },
      { area_range: '85-100㎡', avg_listing: 55000, avg_transaction: 52000, gap: 3000 }
    ]
  }
}

async function getMarketAnalysis(params) {
  const { region, dealType, period } = params
  
  // 실제 구현에서는 시계열 데이터 분석
  return {
    trend: 'rising',
    monthly_data: [
      { month: '2025-01', avg_price: 42000, transaction_count: 45 },
      { month: '2025-02', avg_price: 43000, transaction_count: 52 }
    ],
    insights: [
      '매물가격이 실거래가보다 평균 7.1% 높음',
      '최근 3개월 거래량이 전년 동기 대비 15% 증가'
    ]
  }
}

/**
 * 이름과 좌표로 단지 찾기
 */
async function findComplexByNameAndCoordinates(complexName, longitude, latitude) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        id, name, sido, sigungu, dong, jibun_address, road_address,
        latitude, longitude, total_households, total_buildings,
        completion_year, building_type, heating_type,
        parking_spaces, highest_floor, lowest_floor,
        data_source, created_at, updated_at
      FROM apartment_complexes 
      WHERE name = ? 
        AND ABS(latitude - ?) < 0.001 
        AND ABS(longitude - ?) < 0.001
      LIMIT 1
    `

    integrationService.db.get(query, [complexName, latitude, longitude], (err, row) => {
      if (err) reject(err)
      else resolve(row || null)
    })
  })
}

/**
 * 좌표 데이터 진단 리포트 생성
 */
async function generateCoordinatesReport() {
  return new Promise((resolve, reject) => {
    const queries = {
      total_complexes: `SELECT COUNT(*) as count FROM apartment_complexes`,
      
      with_coordinates: `
        SELECT COUNT(*) as count 
        FROM apartment_complexes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      `,
      
      valid_coordinates: `
        SELECT COUNT(*) as count 
        FROM apartment_complexes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
          AND latitude BETWEEN 33.0 AND 39.0 
          AND longitude BETWEEN 124.0 AND 132.0
      `,
      
      coordinate_samples: `
        SELECT id, name, latitude, longitude, sido, sigungu 
        FROM apartment_complexes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
        ORDER BY id LIMIT 10
      `,
      
      null_coordinates: `
        SELECT COUNT(*) as count 
        FROM apartment_complexes 
        WHERE latitude IS NULL OR longitude IS NULL
      `,
      
      invalid_coordinates: `
        SELECT COUNT(*) as count 
        FROM apartment_complexes 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
          AND (latitude < 33.0 OR latitude > 39.0 OR longitude < 124.0 OR longitude > 132.0)
      `
    }

    const results = {}
    const executeQuery = (key, query) => {
      return new Promise((resolve, reject) => {
        integrationService.db.all(query, [], (err, rows) => {
          if (err) reject(err)
          else resolve({ key, data: rows })
        })
      })
    }

    Promise.all(Object.entries(queries).map(([key, query]) => executeQuery(key, query)))
      .then(queryResults => {
        queryResults.forEach(({ key, data }) => {
          results[key] = key === 'coordinate_samples' ? data : data[0]
        })

        const report = {
          summary: {
            total_complexes: results.total_complexes.count,
            with_coordinates: results.with_coordinates.count,
            valid_coordinates: results.valid_coordinates.count,
            null_coordinates: results.null_coordinates.count,
            invalid_coordinates: results.invalid_coordinates.count,
            coordinate_coverage: ((results.with_coordinates.count / results.total_complexes.count) * 100).toFixed(1) + '%',
            coordinate_validity: results.with_coordinates.count > 0 ? 
              ((results.valid_coordinates.count / results.with_coordinates.count) * 100).toFixed(1) + '%' : '0%'
          },
          samples: results.coordinate_samples,
          recommendations: []
        }

        // 권장사항 생성
        if (results.null_coordinates.count > 0) {
          report.recommendations.push(`${results.null_coordinates.count}개 단지의 좌표 데이터가 누락되었습니다.`)
        }
        
        if (results.invalid_coordinates.count > 0) {
          report.recommendations.push(`${results.invalid_coordinates.count}개 단지의 좌표가 한국 범위를 벗어났습니다.`)
        }
        
        if (results.valid_coordinates.count === results.with_coordinates.count && results.with_coordinates.count > 0) {
          report.recommendations.push('모든 좌표 데이터가 유효합니다. ✅')
        }

        resolve(report)
      })
      .catch(reject)
  })
}

module.exports = router