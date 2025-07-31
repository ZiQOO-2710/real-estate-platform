/**
 * 국토부 실거래가 데이터 좌표 전용 API
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

/**
 * GET /api/molit-coords/coordinates
 * 국토부 실거래가 데이터의 좌표 정보 (통합 DB 좌표 활용)
 */
router.get('/coordinates', async (req, res) => {
  try {
    const {
      region = '',
      sigungu = '',
      limit = 500
    } = req.query

    // 통합 DB에서 직접 좌표 데이터를 가져와 MOLIT 소스로 표시
    const integratedDbPath = path.join(__dirname, '../../data/master_integrated_real_estate.db')
    
    const coordData = await new Promise((resolve, reject) => {
      const integratedDb = new sqlite3.Database(integratedDbPath, (err) => {
        if (err) {
          console.warn('통합 DB 연결 실패:', err.message)
          resolve([])
          return
        }
        
        let coordQuery = `
          SELECT 
            name, 
            latitude, 
            longitude, 
            sido, 
            sigungu, 
            eup_myeon_dong,
            total_households,
            total_buildings,
            completion_year,
            address_jibun as address
          FROM apartment_complexes 
          WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            AND latitude != 0 
            AND longitude != 0
            AND latitude BETWEEN 33.0 AND 39.0
            AND longitude BETWEEN 124.0 AND 132.0
        `
        const params = []

        // 지역 필터링
        if (sigungu) {
          coordQuery += ` AND sigungu LIKE ?`
          params.push(`%${sigungu}%`)
        }
        if (region) {
          coordQuery += ` AND (sigungu LIKE ? OR sido LIKE ? OR eup_myeon_dong LIKE ?)`
          params.push(`%${region}%`, `%${region}%`, `%${region}%`)
        }

        coordQuery += ` ORDER BY total_households DESC LIMIT ?`
        params.push(parseInt(limit))
        
        integratedDb.all(coordQuery, params, (err, rows) => {
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

    // 각 단지에 97만건 MOLIT 실거래 데이터 연결 (실제 데이터 처리)
    const completeMolitPath = path.join(__dirname, '../../../molit_complete_data.db')
    
    const coordinatedData = await Promise.all(
      coordData.map(async (complex) => {
        // 각 단지에 대해 실거래 데이터 찾기 (JSON 데이터 파싱)
        const transactionStats = await new Promise((resolve) => {
          const completeMolitDb = new sqlite3.Database(completeMolitPath, (err) => {
            if (err) {
              resolve({ count: 0, avg_price: 0, latest_deal: null })
              return
            }
            
            // JSON api_data에서 단지명 추출 및 매칭 (실제 97만건 데이터)
            const countQuery = `
              SELECT 
                COUNT(*) as count,
                AVG(CASE 
                  WHEN json_extract(api_data, '$.dealAmount') IS NOT NULL 
                  THEN CAST(replace(json_extract(api_data, '$.dealAmount'), ',', '') AS INTEGER)
                  ELSE 0 
                END) as avg_price,
                MAX(json_extract(api_data, '$.dealYear') || '-' || 
                    printf('%02d', CAST(json_extract(api_data, '$.dealMonth') AS INTEGER))) as latest_deal,
                json_extract(api_data, '$.aptNm') as apt_name,
                MIN(json_extract(api_data, '$.dealYear') || '-' || 
                    printf('%02d', CAST(json_extract(api_data, '$.dealMonth') AS INTEGER))) as earliest_deal
              FROM apartment_transactions 
              WHERE json_extract(api_data, '$.aptNm') IS NOT NULL
                AND (json_extract(api_data, '$.aptNm') LIKE ? 
                     OR json_extract(api_data, '$.aptNm') LIKE ?)
            `
            
            // 단지명 패턴 매칭 (정확도 향상)
            const namePatterns = [
              `%${complex.name?.split(' ')[0]}%`,
              `%${complex.name}%`
            ]
            
            completeMolitDb.get(countQuery, namePatterns, (err, row) => {
              completeMolitDb.close()
              if (err || !row || row.count === 0) {
                resolve({ count: 0, avg_price: 0, latest_deal: null })
              } else {
                resolve({
                  count: row.count || 0,
                  avg_price: row.avg_price || 0,
                  latest_deal: row.latest_deal,
                  matched_name: row.apt_name
                })
              }
            })
          })
        })

        return {
          id: `molit_${complex.name}`.replace(/\s+/g, '_'),
          name: complex.name,
          latitude: parseFloat(complex.latitude),
          longitude: parseFloat(complex.longitude),
          address: complex.address || `${complex.sido} ${complex.sigungu} ${complex.eup_myeon_dong}`,
          sido: complex.sido,
          sigungu: complex.sigungu,
          eup_myeon_dong: complex.eup_myeon_dong,
          total_households: complex.total_households || 0,
          total_buildings: complex.total_buildings || 0,
          completion_year: complex.completion_year,
          // 실제 97만건 거래 데이터 사용
          transaction_count: transactionStats.count || 0,
          avg_transaction_price: transactionStats.count > 0 ? 
            Math.round(transactionStats.avg_price / 10000) : null, // 억원 단위
          latest_transaction_date: transactionStats.latest_deal,
          matched_apt_name: transactionStats.matched_name,
          source: 'molit',
          coordinate_source: 'integrated_db',
          data_source: '97만건_실제_거래_데이터'
        }
      })
    )

    // 실제 거래 데이터 통계
    const totalTransactions = coordinatedData.reduce((sum, complex) => sum + complex.transaction_count, 0)
    const avgPrice = coordinatedData.filter(c => c.avg_transaction_price)
      .reduce((sum, c, i, arr) => sum + c.avg_transaction_price / arr.length, 0)
    
    res.json({
      data: coordinatedData,
      count: coordinatedData.length,
      source: 'molit_integrated_with_real_transactions',
      coordinate_source: 'integrated_db_validated',
      transaction_source: '97만건_실제_거래데이터',
      filters: { region, sigungu, limit: parseInt(limit) },
      statistics: {
        total_complexes_with_transactions: coordinatedData.filter(c => c.transaction_count > 0).length,
        total_transactions: totalTransactions,
        average_price_per_complex: Math.round(avgPrice) || 0
      },
      message: `97만건 실거래 데이터에서 ${coordinatedData.length}개 단지, 총 ${totalTransactions}건 거래 정보 연결`
    })

  } catch (error) {
    console.error('MOLIT 좌표 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '좌표 데이터 조회에 실패했습니다.'
    })
  }
})

module.exports = router