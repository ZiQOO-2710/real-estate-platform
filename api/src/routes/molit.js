/**
 * 국토부(MOLIT) 실거래가 데이터 전용 API 라우터
 * 공식 실거래 데이터 제공
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

// 국토부 DB 연결
const molitDbPath = path.join(__dirname, '../../data/full_integrated_real_estate.db')
let molitDb = null

const initializeMolitDb = () => {
  if (!molitDb) {
    molitDb = new sqlite3.Database(molitDbPath, (err) => {
      if (err) {
        console.error('국토부 DB 연결 실패:', err)
      } else {
        console.log('✅ 국토부 DB 연결 완료')
      }
    })
  }
  return molitDb
}

/**
 * GET /api/molit/complexes
 * 국토부 아파트 단지 목록 조회
 */
router.get('/complexes', async (req, res) => {
  try {
    const db = initializeMolitDb()
    const {
      keyword = '',
      sigungu = '',
      limit = 100,
      offset = 0
    } = req.query

    let query = `
      SELECT 
        id,
        apartment_name,
        sigungu,
        eup_myeon_dong,
        total_transactions,
        avg_price_per_pyeong,
        latest_transaction_date,
        price_trend,
        crawling_priority,
        created_at
      FROM apartment_complexes
      WHERE 1=1
    `
    const params = []

    // 키워드 검색
    if (keyword) {
      query += ` AND apartment_name LIKE ?`
      params.push(`%${keyword}%`)
    }

    // 시군구 검색
    if (sigungu) {
      query += ` AND sigungu LIKE ?`
      params.push(`%${sigungu}%`)
    }

    // 정렬 및 제한
    query += ` ORDER BY total_transactions DESC, latest_transaction_date DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    const complexes = await queryMolitDb(query, params)

    res.json({
      data: complexes.map(complex => ({
        ...complex,
        source: 'molit'
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: complexes.length === parseInt(limit)
      },
      filters: { keyword, sigungu },
      source: 'molit_db'
    })

  } catch (error) {
    console.error('국토부 단지 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '국토부 단지 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/complexes/:id
 * 특정 국토부 단지 상세 정보
 */
router.get('/complexes/:id', async (req, res) => {
  try {
    const db = initializeMolitDb()
    const complexId = parseInt(req.params.id)

    const complex = await queryMolitDb(`
      SELECT * FROM apartment_complexes WHERE id = ?
    `, [complexId])

    if (complex.length === 0) {
      return res.status(404).json({
        error: 'Not found',
        message: '해당 단지를 찾을 수 없습니다.'
      })
    }

      // 해당 단지의 실거래 데이터 조회
    const transactions = await queryMolitDb(`
      SELECT 
        deal_date,
        deal_amount,
        area_for_exclusive_use as area,
        floor,
        sigungu,
        eup_myeon_dong
      FROM transaction_records 
      WHERE complex_id = ?
      ORDER BY deal_date DESC
      LIMIT 100
    `, [complexId])

    // 월별 거래 통계
    const monthlyStats = await queryMolitDb(`
      SELECT 
        deal_year,
        deal_month,
        COUNT(*) as transaction_count,
        AVG(deal_amount) as avg_amount,
        MIN(deal_amount) as min_amount,
        MAX(deal_amount) as max_amount
      FROM transaction_records 
      WHERE apartment_complex_id = ?
      GROUP BY deal_year, deal_month
      ORDER BY deal_year DESC, deal_month DESC
      LIMIT 24
    `, [complexId])

    res.json({
      complex: {
        ...complex[0],
        source: 'molit'
      },
      transactions: transactions.map(tx => ({
        ...tx,
        source: 'molit'
      })),
      monthly_stats: monthlyStats,
      summary: {
        total_transactions: transactions.length,
        latest_transaction: transactions[0] || null,
        price_range: transactions.length > 0 ? {
          min: Math.min(...transactions.map(t => t.deal_amount)),
          max: Math.max(...transactions.map(t => t.deal_amount)),
          avg: Math.round(transactions.reduce((sum, t) => sum + t.deal_amount, 0) / transactions.length)
        } : null
      }
    })

  } catch (error) {
    console.error('국토부 단지 상세 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '단지 상세 정보 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/transactions
 * 국토부 실거래 데이터 조회
 */
router.get('/transactions', async (req, res) => {
  try {
    const db = initializeMolitDb()
    const {
      complexId,
      sigungu = '',
      dealType = '',
      yearFrom,
      yearTo,
      priceMin,
      priceMax,
      areaMin,
      areaMax,
      limit = 100,
      offset = 0
    } = req.query

    let query = `
      SELECT 
        tr.*,
        ac.apartment_name,
        ac.sigungu,
        ac.eup_myeon_dong
      FROM transaction_records tr
      JOIN apartment_complexes ac ON tr.apartment_complex_id = ac.id
      WHERE 1=1
    `
    const params = []

    // 단지 필터
    if (complexId) {
      query += ` AND tr.apartment_complex_id = ?`
      params.push(parseInt(complexId))
    }

    // 시군구 필터
    if (sigungu) {
      query += ` AND ac.sigungu LIKE ?`
      params.push(`%${sigungu}%`)
    }

    // 거래 유형 필터
    if (dealType) {
      query += ` AND tr.deal_type = ?`
      params.push(dealType)
    }

    // 년도 필터
    if (yearFrom) {
      query += ` AND tr.deal_year >= ?`
      params.push(parseInt(yearFrom))
    }
    if (yearTo) {
      query += ` AND tr.deal_year <= ?`
      params.push(parseInt(yearTo))
    }

    // 가격 필터
    if (priceMin) {
      query += ` AND tr.deal_amount >= ?`
      params.push(parseInt(priceMin))
    }
    if (priceMax) {
      query += ` AND tr.deal_amount <= ?`
      params.push(parseInt(priceMax))
    }

    // 면적 필터
    if (areaMin) {
      query += ` AND tr.area >= ?`
      params.push(parseFloat(areaMin))
    }
    if (areaMax) {
      query += ` AND tr.area <= ?`
      params.push(parseFloat(areaMax))
    }

    // 정렬 및 제한
    query += ` ORDER BY tr.deal_year DESC, tr.deal_month DESC, tr.deal_day DESC LIMIT ? OFFSET ?`
    params.push(parseInt(limit), parseInt(offset))

    const transactions = await queryMolitDb(query, params)

    res.json({
      data: transactions.map(tx => ({
        ...tx,
        source: 'molit'
      })),
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: transactions.length === parseInt(limit)
      },
      filters: { complexId, sigungu, dealType, yearFrom, yearTo, priceMin, priceMax, areaMin, areaMax },
      source: 'molit_db'
    })

  } catch (error) {
    console.error('국토부 실거래 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '실거래 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/search
 * 국토부 단지명으로 검색
 */
router.get('/search', async (req, res) => {
  try {
    const db = initializeMolitDb()
    const { q: query = '', limit = 20 } = req.query

    if (!query.trim()) {
      return res.json({
        data: [],
        message: '검색어를 입력해주세요.'
      })
    }

    const results = await queryMolitDb(`
      SELECT 
        id,
        apartment_name,
        sigungu,
        eup_myeon_dong,
        total_transactions,
        latest_transaction_date
      FROM apartment_complexes
      WHERE apartment_name LIKE ? OR sigungu LIKE ?
      ORDER BY total_transactions DESC
      LIMIT ?
    `, [`%${query}%`, `%${query}%`, parseInt(limit)])

    res.json({
      data: results.map(result => ({
        ...result,
        source: 'molit'
      })),
      query,
      count: results.length,
      source: 'molit_db'
    })

  } catch (error) {
    console.error('국토부 검색 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '검색에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/analysis
 * 시장 분석 데이터
 */
router.get('/analysis', async (req, res) => {
  try {
    const db = initializeMolitDb()
    const {
      sigungu = '',
      period = '12', // 개월
      dealType = '매매'
    } = req.query

    // 기간별 거래 통계
    const periodStats = await queryMolitDb(`
      SELECT 
        deal_year,
        deal_month,
        COUNT(*) as transaction_count,
        AVG(deal_amount) as avg_price,
        MIN(deal_amount) as min_price,
        MAX(deal_amount) as max_price
      FROM transaction_records tr
      JOIN apartment_complexes ac ON tr.apartment_complex_id = ac.id
      WHERE 1=1
        ${sigungu ? 'AND ac.sigungu LIKE ?' : ''}
        ${dealType ? 'AND tr.deal_type = ?' : ''}
        AND tr.deal_year >= ?
      GROUP BY deal_year, deal_month
      ORDER BY deal_year DESC, deal_month DESC
    `, [
      ...(sigungu ? [`%${sigungu}%`] : []),
      ...(dealType ? [dealType] : []),
      new Date().getFullYear() - Math.floor(parseInt(period) / 12)
    ])

    // 면적대별 통계
    const areaStats = await queryMolitDb(`
      SELECT 
        CASE 
          WHEN area < 60 THEN '60㎡ 미만'
          WHEN area < 85 THEN '60-85㎡'
          WHEN area < 102 THEN '85-102㎡'
          ELSE '102㎡ 이상'
        END as area_range,
        COUNT(*) as transaction_count,
        AVG(deal_amount) as avg_price
      FROM transaction_records tr
      JOIN apartment_complexes ac ON tr.apartment_complex_id = ac.id
      WHERE 1=1
        ${sigungu ? 'AND ac.sigungu LIKE ?' : ''}
        ${dealType ? 'AND tr.deal_type = ?' : ''}
        AND tr.deal_year >= ?
      GROUP BY area_range
      ORDER BY avg_price DESC
    `, [
      ...(sigungu ? [`%${sigungu}%`] : []),
      ...(dealType ? [dealType] : []),
      new Date().getFullYear() - 1
    ])

    res.json({
      period_analysis: periodStats,
      area_analysis: areaStats,
      filters: { sigungu, period, dealType },
      source: 'molit_db',
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('국토부 분석 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '시장 분석에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/stats
 * 국토부 데이터 통계
 */
router.get('/stats', async (req, res) => {
  try {
    const db = initializeMolitDb()

    const stats = await queryMolitDb(`
      SELECT 
        COUNT(DISTINCT ac.id) as total_complexes,
        COUNT(tr.id) as total_transactions,
        COUNT(DISTINCT tr.sigungu) as total_regions,
        MIN(substr(tr.deal_date, 1, 4)) as earliest_year,
        MAX(substr(tr.deal_date, 1, 4)) as latest_year
      FROM apartment_complexes ac
      LEFT JOIN transaction_records tr ON ac.id = tr.complex_id
    `)

    const regionStats = await queryMolitDb(`
      SELECT 
        tr.sigungu,
        COUNT(DISTINCT ac.id) as complex_count,
        COUNT(tr.id) as transaction_count,
        AVG(tr.deal_amount) as avg_price
      FROM apartment_complexes ac
      LEFT JOIN transaction_records tr ON ac.id = tr.complex_id
      WHERE tr.deal_amount > 0
      GROUP BY tr.sigungu
      ORDER BY transaction_count DESC
      LIMIT 20
    `)

    const yearlyStats = await queryMolitDb(`
      SELECT 
        substr(deal_date, 1, 4) as deal_year,
        COUNT(*) as transaction_count,
        AVG(deal_amount) as avg_price
      FROM transaction_records
      WHERE deal_amount > 0
      GROUP BY substr(deal_date, 1, 4)
      ORDER BY deal_year DESC
      LIMIT 10
    `)

    res.json({
      overview: stats[0],
      top_regions: regionStats,
      yearly_trends: yearlyStats,
      source: 'molit_db',
      generated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('국토부 통계 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '통계 데이터 조회에 실패했습니다.'
    })
  }
})

/**
 * GET /api/molit/coordinates
 * 국토부 실거래가 데이터의 좌표 정보 (통합 DB와 매칭)
 */
router.get('/coordinates', async (req, res) => {
  try {
    const {
      region = '',
      sigungu = '',
      limit = 500
    } = req.query

    // 97만건 MOLIT 데이터베이스 사용
    const sqlite3 = require('sqlite3').verbose()
    const completeMolitPath = require('path').join(__dirname, '../../../molit_complete_data.db')
    
    const molitData = await new Promise((resolve, reject) => {
      const completeMolitDb = new sqlite3.Database(completeMolitPath, (err) => {
        if (err) {
          console.error('완전한 MOLIT DB 연결 실패:', err.message)
          resolve([])
          return
        }
        
        let query = `
          SELECT DISTINCT 
            apartment_name,
            legal_dong,
            region_name,
            road_name,
            COUNT(*) as transaction_count,
            AVG(CAST(deal_amount AS INTEGER)) as avg_price,
            MAX(deal_year || '-' || deal_month) as latest_deal
          FROM apartment_transactions 
          WHERE apartment_name != '' AND legal_dong != ''
        `
        const params = []

        if (sigungu) {
          query += ` AND region_name LIKE ?`
          params.push(`%${sigungu}%`)
        }
        if (region) {
          query += ` AND (region_name LIKE ? OR legal_dong LIKE ?)`
          params.push(`%${region}%`, `%${region}%`)
        }

        query += ` 
          GROUP BY apartment_name, legal_dong, region_name
          HAVING transaction_count >= 3
          ORDER BY transaction_count DESC, avg_price DESC
          LIMIT ?
        `
        params.push(parseInt(limit))

        completeMolitDb.all(query, params, (err, rows) => {
          completeMolitDb.close()
          if (err) {
            console.warn('MOLIT 데이터 조회 실패:', err.message)
            resolve([])
          } else {
            resolve(rows || [])
          }
        })
      })
    })

    // 통합 DB에서 좌표 정보 가져오기
    const integratedDbPath = require('path').join(__dirname, '../../data/master_integrated_real_estate.db')
    
    const coordData = await new Promise((resolve, reject) => {
      const integratedDb = new sqlite3.Database(integratedDbPath, (err) => {
        if (err) {
          console.warn('통합 DB 연결 실패:', err.message)
          resolve([])
          return
        }
        
        const coordQuery = `
          SELECT name, latitude, longitude, sido, sigungu, eup_myeon_dong 
          FROM apartment_complexes 
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        `
        
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

    // MOLIT 데이터와 좌표 매칭
    const coordinatedData = molitData.map(complex => {
      // 단지명과 동 정보로 매칭
      const coordMatch = coordData.find(coord => {
        const nameMatch = coord.name === complex.apartment_name || 
                         coord.name?.includes(complex.apartment_name?.split(' ')[0]) ||
                         complex.apartment_name?.includes(coord.name?.split(' ')[0])
        
        const locationMatch = coord.eup_myeon_dong === complex.legal_dong ||
                            coord.sigungu?.includes(complex.region_name) ||
                            complex.region_name?.includes(coord.sigungu)
        
        return nameMatch && locationMatch
      })
      
      if (coordMatch) {
        return {
          id: `molit_${complex.apartment_name}_${complex.legal_dong}`.replace(/\s+/g, '_'),
          name: complex.apartment_name,
          latitude: coordMatch.latitude,
          longitude: coordMatch.longitude,
          address: `${complex.region_name} ${complex.legal_dong}`,
          region_name: complex.region_name,
          legal_dong: complex.legal_dong,
          road_name: complex.road_name,
          transaction_count: complex.transaction_count,
          avg_transaction_price: Math.round(complex.avg_price / 10000), // 억원 단위
          latest_transaction_date: complex.latest_deal,
          sido: coordMatch.sido,
          sigungu: coordMatch.sigungu,
          source: 'molit',
          coordinate_source: 'integrated_db'
        }
      }
      
      return null
    }).filter(Boolean)

    res.json({
      data: coordinatedData,
      count: coordinatedData.length,
      total_molit_complexes: molitData.length,
      coordinate_match_rate: molitData.length > 0 ? 
        Math.round((coordinatedData.length / molitData.length) * 100) : 0,
      source: 'molit_complete_db',
      coordinate_source: 'integrated_db',
      message: `국토부 ${molitData.length}개 단지 중 ${coordinatedData.length}개 단지에 좌표 매칭 완료 (97만건 실거래 데이터)`
    })

  } catch (error) {
    console.error('국토부 좌표 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '좌표 데이터 조회에 실패했습니다.'
    })
  }
})

// 헬퍼 함수
function queryMolitDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = initializeMolitDb()
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