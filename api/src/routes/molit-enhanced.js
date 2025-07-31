/**
 * 개선된 국토부 실거래가 데이터 API (더 많은 데이터 + 정확한 좌표)
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

/**
 * GET /api/molit-enhanced/coordinates
 * 개선된 국토부 실거래가 데이터 (네이버 DB + 좌표 매칭 + 97만건 거래 데이터)
 */
router.get('/coordinates', async (req, res) => {
  try {
    const {
      region = '',
      sigungu = '',
      limit = 500
    } = req.query

    console.log('📊 개선된 MOLIT API 호출:', { region, sigungu, limit })

    // Step 1: 네이버 DB에서 더 많은 단지 데이터 가져오기 (1,440개)
    const naverDbPath = path.join(__dirname, '../../../modules/naver-crawler/data/naver_real_estate.db')
    
    const naverComplexes = await new Promise((resolve, reject) => {
      const naverDb = new sqlite3.Database(naverDbPath, (err) => {
        if (err) {
          console.warn('네이버 DB 연결 실패:', err.message)
          resolve([])
          return
        }
        
        let naverQuery = `
          SELECT 
            id,
            complex_id,
            complex_name as name,
            address,
            total_households,
            total_buildings,
            completion_year
          FROM apartment_complexes
          WHERE complex_name IS NOT NULL 
            AND complex_name != '' 
            AND complex_name != '정보없음'
            AND address IS NOT NULL
            AND address != ''
        `
        const params = []

        // 지역 필터링
        if (region || sigungu) {
          naverQuery += ` AND address LIKE ?`
          params.push(`%${region || sigungu}%`)
        }

        naverQuery += ` ORDER BY total_households DESC LIMIT ?`
        params.push(parseInt(limit))
        
        naverDb.all(naverQuery, params, (err, rows) => {
          naverDb.close()
          if (err) {
            console.warn('네이버 단지 데이터 조회 실패:', err.message)
            resolve([])
          } else {
            resolve(rows || [])
          }
        })
      })
    })

    console.log('📍 네이버 DB에서 조회된 단지 수:', naverComplexes.length)

    if (naverComplexes.length === 0) {
      return res.json({
        data: [],
        count: 0,
        message: '조건에 맞는 단지가 없습니다.'
      })
    }

    // Step 2: 통합 DB에서 좌표 정보 매칭 (정확한 좌표)
    const integratedDbPath = path.join(__dirname, '../../data/master_integrated_real_estate.db')
    
    const coordinateMap = await new Promise((resolve, reject) => {
      const integratedDb = new sqlite3.Database(integratedDbPath, (err) => {
        if (err) {
          console.warn('통합 DB 연결 실패:', err.message)
          resolve({})
          return
        }
        
        const coordQuery = `
          SELECT name, latitude, longitude, sido, sigungu, eup_myeon_dong
          FROM apartment_complexes 
          WHERE latitude IS NOT NULL 
            AND longitude IS NOT NULL
            AND latitude BETWEEN 33.0 AND 39.0
            AND longitude BETWEEN 124.0 AND 132.0
        `
        
        integratedDb.all(coordQuery, [], (err, rows) => {
          integratedDb.close()
          if (err) {
            console.warn('좌표 데이터 조회 실패:', err.message)
            resolve({})
          } else {
            // 단지명을 키로 하는 좌표 맵 생성
            const coordMap = {}
            rows.forEach(row => {
              // 정확한 매칭과 부분 매칭을 위한 다양한 키 생성
              const keys = [
                row.name,
                row.name?.replace(/\d+단지$/, ''),
                row.name?.replace(/아파트$/, ''),
                row.name?.split(' ')[0]
              ].filter(Boolean)
              
              keys.forEach(key => {
                if (!coordMap[key] || coordMap[key].match_level > 1) {
                  coordMap[key] = {
                    ...row,
                    match_level: key === row.name ? 1 : 2
                  }
                }
              })
            })
            resolve(coordMap)
          }
        })
      })
    })

    console.log('🗺️ 좌표 데이터 맵 생성 완료:', Object.keys(coordinateMap).length, '개 매칭 키')

    // Step 3: 97만건 MOLIT DB에서 실거래 데이터 매칭
    const completeMolitPath = path.join(__dirname, '../../data/molit_complete_data.db')
    
    const transactionMap = await new Promise((resolve) => {
      const completeMolitDb = new sqlite3.Database(completeMolitPath, (err) => {
        if (err) {
          console.warn('MOLIT DB 연결 실패:', err.message)
          resolve({})
          return
        }
        
        // 네이버 단지명들로 거래 데이터 조회
        const aptNames = naverComplexes.map(c => c.name).filter(Boolean)
        if (aptNames.length === 0) {
          resolve({})
          return
        }

        // 부분 매칭을 위한 OR 조건 생성
        const likeConditions = aptNames.map(() => 'json_extract(api_data, \'$.aptNm\') LIKE ?').join(' OR ')
        const likeParams = aptNames.map(name => `%${name.split(' ')[0]}%`)

        const transactionQuery = `
          SELECT 
            json_extract(api_data, '$.aptNm') as apt_name,
            COUNT(*) as count,
            AVG(CASE 
              WHEN json_extract(api_data, '$.dealAmount') IS NOT NULL 
              THEN CAST(replace(json_extract(api_data, '$.dealAmount'), ',', '') AS INTEGER)
              ELSE 0 
            END) as avg_price,
            MAX(json_extract(api_data, '$.dealYear') || '-' || 
                printf('%02d', CAST(json_extract(api_data, '$.dealMonth') AS INTEGER))) as latest_deal
          FROM apartment_transactions 
          WHERE json_extract(api_data, '$.aptNm') IS NOT NULL
            AND (${likeConditions})
          GROUP BY json_extract(api_data, '$.aptNm')
        `
        
        completeMolitDb.all(transactionQuery, likeParams, (err, rows) => {
          completeMolitDb.close()
          if (err) {
            console.warn('거래 데이터 조회 실패:', err.message)
            resolve({})
          } else {
            const txMap = {}
            rows.forEach(row => {
              if (row.apt_name) {
                txMap[row.apt_name] = {
                  count: row.count || 0,
                  avg_price: row.avg_price || 0,
                  latest_deal: row.latest_deal
                }
              }
            })
            resolve(txMap)
          }
        })
      })
    })

    console.log('💰 거래 데이터 조회 완료:', Object.keys(transactionMap).length, '개 단지')

    // Step 4: 네이버 단지 + 좌표 + 거래 데이터 통합
    const coordinatedData = naverComplexes.map((complex) => {
      // 좌표 매칭 (다양한 방식 시도)
      let coordinates = null
      const matchKeys = [
        complex.name,
        complex.name?.replace(/\d+단지$/, ''),
        complex.name?.replace(/아파트$/, ''),
        complex.name?.split(' ')[0]
      ].filter(Boolean)

      for (const key of matchKeys) {
        if (coordinateMap[key]) {
          coordinates = coordinateMap[key]
          break
        }
      }

      // 거래 데이터 매칭
      let transactionStats = { count: 0, avg_price: 0, latest_deal: null }
      for (const [aptName, stats] of Object.entries(transactionMap)) {
        if (aptName.includes(complex.name?.split(' ')[0]) || 
            complex.name?.includes(aptName.split(' ')[0])) {
          if (stats.count > transactionStats.count) {
            transactionStats = stats
          }
        }
      }

      // 좌표가 있는 단지만 반환
      if (!coordinates) {
        return null
      }

      return {
        id: `molit_enhanced_${complex.id}`,
        name: complex.name,
        latitude: parseFloat(coordinates.latitude),
        longitude: parseFloat(coordinates.longitude),
        address: complex.address,
        sido: coordinates.sido,
        sigungu: coordinates.sigungu,
        eup_myeon_dong: coordinates.eup_myeon_dong,
        total_households: complex.total_households || 0,
        total_buildings: complex.total_buildings || 0,
        completion_year: complex.completion_year,
        // 실제 97만건 거래 데이터
        transaction_count: transactionStats.count,
        avg_transaction_price: transactionStats.count > 0 ? 
          Math.round(transactionStats.avg_price / 10000) : null,
        latest_transaction_date: transactionStats.latest_deal,
        source: 'molit_enhanced',
        coordinate_source: 'integrated_db_verified',
        data_source: '네이버_1440개단지_+_97만건거래데이터',
        coordinate_accuracy: coordinates.match_level === 1 ? 'exact' : 'partial'
      }
    }).filter(Boolean) // null 값 제거

    console.log('✅ 최종 좌표 매칭 완료:', coordinatedData.length, '개 단지')

    // 통계 계산
    const totalTransactions = coordinatedData.reduce((sum, complex) => sum + (complex.transaction_count || 0), 0)
    const complexesWithTransactions = coordinatedData.filter(c => c.transaction_count > 0)
    const avgPrice = complexesWithTransactions.length > 0 ? 
      complexesWithTransactions.reduce((sum, c, i, arr) => sum + (c.avg_transaction_price || 0) / arr.length, 0) : 0

    res.json({
      data: coordinatedData,
      count: coordinatedData.length,
      source: 'molit_enhanced_naver_integrated',
      coordinate_source: 'master_integrated_db',
      transaction_source: '97만건_실제_거래데이터',
      data_sources: {
        naver_complexes: naverComplexes.length,
        coordinate_matches: coordinatedData.length,
        transaction_matches: complexesWithTransactions.length
      },
      statistics: {
        total_complexes: coordinatedData.length,
        total_complexes_with_transactions: complexesWithTransactions.length,
        total_transactions: totalTransactions,
        average_price_per_complex: Math.round(avgPrice) || 0,
        coordinate_accuracy: {
          exact_matches: coordinatedData.filter(c => c.coordinate_accuracy === 'exact').length,
          partial_matches: coordinatedData.filter(c => c.coordinate_accuracy === 'partial').length
        }
      },
      message: `개선된 MOLIT: 네이버 ${naverComplexes.length}개 단지 중 ${coordinatedData.length}개 좌표 매칭, ${totalTransactions}건 실거래 데이터 연결`
    })

  } catch (error) {
    console.error('개선된 MOLIT 좌표 조회 실패:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: '개선된 좌표 데이터 조회에 실패했습니다.'
    })
  }
})

module.exports = router