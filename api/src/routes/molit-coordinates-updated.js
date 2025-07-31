/**
 * 업데이트된 국토부 실거래가 좌표 API
 * - apt_master_info에서 매칭된 정확한 좌표 사용
 * - 97만건 실거래가 + 정확한 좌표 데이터
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

/**
 * GET /api/molit-coordinates-updated/
 * 정확한 좌표가 매칭된 국토부 실거래가 데이터
 */
router.get('/', async (req, res) => {
  try {
    const {
      region = '',
      sigungu = '',
      dong = '',
      limit = 500,
      minPrice = 0,
      maxPrice = 999999,
      dealType = '',
      year = ''
    } = req.query

    console.log('🎯 정확한 좌표 MOLIT API 호출:', { region, sigungu, dong, limit, minPrice, maxPrice, dealType, year })

    const startTime = Date.now()
    
    // 좌표가 업데이트된 MOLIT DB 연결
    const molitDbPath = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    
    const results = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(molitDbPath, (err) => {
        if (err) {
          console.error('MOLIT DB 연결 실패:', err.message)
          reject(err)
          return
        }
        
        // 필터 조건 구성
        let whereConditions = ['longitude IS NOT NULL', 'latitude IS NOT NULL']
        const params = []
        
        // 지역 필터
        if (region) {
          whereConditions.push('region_name LIKE ?')
          params.push(`%${region}%`)
        }
        
        if (sigungu) {
          whereConditions.push('(region_name LIKE ? OR json_extract(api_data, "$.sggNm") LIKE ?)')
          params.push(`%${sigungu}%`, `%${sigungu}%`)
        }
        
        if (dong) {
          whereConditions.push('json_extract(api_data, "$.umdNm") LIKE ?')
          params.push(`%${dong}%`)
        }
        
        // 거래 유형 필터
        if (dealType) {
          whereConditions.push('deal_type = ?')
          params.push(dealType)
        }
        
        // 거래 년도 필터
        if (year) {
          whereConditions.push('json_extract(api_data, "$.dealYear") = ?')
          params.push(year)
        }
        
        // 가격 필터 (API 데이터에서 추출)
        if (minPrice > 0) {
          whereConditions.push('CAST(json_extract(api_data, "$.dealAmount") AS INTEGER) >= ?')
          params.push(minPrice)
        }
        
        if (maxPrice < 999999) {
          whereConditions.push('CAST(json_extract(api_data, "$.dealAmount") AS INTEGER) <= ?')
          params.push(maxPrice)
        }
        
        // 정확한 좌표가 있는 데이터만 조회하는 쿼리
        const query = `
          SELECT 
            apartment_name,
            longitude,
            latitude,
            coordinate_source,
            json_extract(api_data, '$.aptNm') as original_apt_name,
            json_extract(api_data, '$.dealAmount') as deal_amount,
            json_extract(api_data, '$.dealYear') as deal_year,
            json_extract(api_data, '$.dealMonth') as deal_month,
            json_extract(api_data, '$.dealDay') as deal_day,
            json_extract(api_data, '$.area') as area,
            json_extract(api_data, '$.floor') as floor,
            json_extract(api_data, '$.buildYear') as build_year,
            json_extract(api_data, '$.umdNm') as dong_name,
            json_extract(api_data, '$.sggNm') as sigungu_name,
            deal_type,
            region_name,
            json_extract(api_data, '$.jibun') as jibun,
            json_extract(api_data, '$.roadNm') as road_name,
            json_extract(api_data, '$.roadNmSggCd') as road_code,
            json_extract(api_data, '$.rgstDate') as register_date
          FROM apartment_transactions 
          WHERE ${whereConditions.join(' AND ')}
          ORDER BY 
            json_extract(api_data, '$.dealYear') DESC,
            json_extract(api_data, '$.dealMonth') DESC,
            json_extract(api_data, '$.dealDay') DESC
          LIMIT ?
        `
        
        params.push(parseInt(limit))
        
        console.log('🔍 실행 쿼리:', query.substring(0, 200) + '...')
        console.log('📋 파라미터:', params)
        
        db.all(query, params, (err, rows) => {
          db.close()
          
          if (err) {
            console.error('쿼리 실행 오류:', err.message)
            reject(err)
            return
          }
          
          // 데이터 후처리
          const processedData = rows.map(row => ({
            // 기본 정보
            apartment_name: row.apartment_name || row.original_apt_name,
            original_apt_name: row.original_apt_name,
            
            // 정확한 좌표 (apt_master_info에서 매칭됨)
            longitude: parseFloat(row.longitude),
            latitude: parseFloat(row.latitude),
            coordinate_source: row.coordinate_source,
            
            // 거래 정보
            deal_amount: parseInt(row.deal_amount) || 0,
            deal_date: `${row.deal_year}-${String(row.deal_month).padStart(2, '0')}-${String(row.deal_day).padStart(2, '0')}`,
            deal_year: parseInt(row.deal_year),
            deal_month: parseInt(row.deal_month),
            deal_day: parseInt(row.deal_day),
            deal_type: row.deal_type,
            
            // 부동산 정보
            area: parseFloat(row.area) || 0,
            floor: parseInt(row.floor) || 0,
            build_year: parseInt(row.build_year) || 0,
            
            // 위치 정보
            region_name: row.region_name,
            sigungu_name: row.sigungu_name,
            dong_name: row.dong_name,
            jibun: row.jibun,
            road_name: row.road_name,
            road_code: row.road_code,
            
            // 기타
            register_date: row.register_date
          }))
          
          resolve(processedData)
        })
      })
    })

    const endTime = Date.now()
    const responseTime = endTime - startTime

    console.log(`✅ 정확한 좌표 MOLIT 데이터 조회 완료: ${results.length}개 (${responseTime}ms)`)

    res.json({
      success: true,
      data: results,
      total: results.length,
      filters: {
        region,
        sigungu,
        dong,
        dealType,
        year,
        minPrice,
        maxPrice
      },
      response_time_ms: responseTime,
      coordinate_source: 'apt_master_info',
      note: '정확한 좌표가 매칭된 국토부 실거래가 데이터'
    })

  } catch (error) {
    console.error('❌ 정확한 좌표 MOLIT API 오류:', error)
    res.status(500).json({
      success: false,
      error: '정확한 좌표 MOLIT 데이터 조회 실패',
      message: error.message
    })
  }
})

/**
 * GET /api/molit-coordinates-updated/summary
 * 좌표 매칭 상태 요약
 */
router.get('/summary', async (req, res) => {
  try {
    console.log('📊 좌표 매칭 요약 정보 조회')
    
    const molitDbPath = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    
    const summary = await new Promise((resolve, reject) => {
      const db = new sqlite3.Database(molitDbPath, (err) => {
        if (err) {
          reject(err)
          return
        }
        
        const queries = [
          // 전체 레코드 수
          'SELECT COUNT(*) as total FROM apartment_transactions',
          
          // 좌표가 있는 레코드 수
          'SELECT COUNT(*) as with_coordinates FROM apartment_transactions WHERE longitude IS NOT NULL AND latitude IS NOT NULL',
          
          // 좌표 출처별 통계
          'SELECT coordinate_source, COUNT(*) as count FROM apartment_transactions WHERE coordinate_source IS NOT NULL GROUP BY coordinate_source',
          
          // 상위 아파트별 거래량
          `SELECT 
            apartment_name, 
            COUNT(*) as transaction_count,
            AVG(CAST(json_extract(api_data, '$.dealAmount') AS INTEGER)) as avg_price
           FROM apartment_transactions 
           WHERE longitude IS NOT NULL 
           GROUP BY apartment_name 
           ORDER BY transaction_count DESC 
           LIMIT 10`,
           
          // 지역별 매칭 현황
          `SELECT 
            region_name,
            COUNT(*) as total_transactions,
            COUNT(CASE WHEN longitude IS NOT NULL THEN 1 END) as matched_coordinates,
            ROUND(COUNT(CASE WHEN longitude IS NOT NULL THEN 1 END) * 100.0 / COUNT(*), 2) as match_rate
           FROM apartment_transactions 
           GROUP BY region_name 
           ORDER BY total_transactions DESC 
           LIMIT 10`
        ]
        
        Promise.all(queries.map(query => new Promise((resolve, reject) => {
          db.all(query, [], (err, rows) => {
            if (err) reject(err)
            else resolve(rows)
          })
        }))).then(results => {
          db.close()
          
          const [totalResult, coordinatesResult, sourcesResult, topApartmentsResult, regionsResult] = results
          
          resolve({
            total_records: totalResult[0].total,
            records_with_coordinates: coordinatesResult[0].with_coordinates,
            match_rate: ((coordinatesResult[0].with_coordinates / totalResult[0].total) * 100).toFixed(2),
            coordinate_sources: sourcesResult,
            top_apartments: topApartmentsResult,
            regions_summary: regionsResult
          })
        }).catch(reject)
      })
    })

    res.json({
      success: true,
      summary,
      updated_at: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ 좌표 매칭 요약 조회 오류:', error)
    res.status(500).json({
      success: false,
      error: '요약 정보 조회 실패',
      message: error.message
    })
  }
})

module.exports = router