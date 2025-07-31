/**
 * 개선된 국토부 실거래가 데이터 좌표 API - 좌표 정확성 보정
 */

const express = require('express')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const router = express.Router()

// 알려진 좌표 오류 보정 데이터
const COORDINATE_FIXES = {
  '안산단원신도시': {
    correct_latitude: 37.3194,
    correct_longitude: 126.8207,
    description: '안산시 단원구 정확한 좌표로 보정'
  },
  // 추가 좌표 보정 데이터 여기에 추가 가능
}

/**
 * 좌표 정확성 검증 및 보정
 */
function validateAndCorrectCoordinates(complex) {
  // 알려진 오류 좌표 보정
  if (COORDINATE_FIXES[complex.name]) {
    const fix = COORDINATE_FIXES[complex.name]
    return {
      ...complex,
      latitude: fix.correct_latitude,
      longitude: fix.correct_longitude,
      coordinate_corrected: true,
      correction_reason: fix.description
    }
  }

  // 일반적인 좌표 유효성 검사
  const lat = parseFloat(complex.latitude)
  const lng = parseFloat(complex.longitude)

  // 한국 좌표 범위 검증
  if (lat < 33.0 || lat > 39.0 || lng < 124.0 || lng > 132.0) {
    return {
      ...complex,
      coordinate_error: true,
      error_reason: `좌표가 한국 범위를 벗어남: ${lat}, ${lng}`
    }
  }

  // 지역별 좌표 일치성 검사
  if (complex.sigungu && complex.sigungu.includes('안산') && (lat > 37.5 || lng > 127.0)) {
    return {
      ...complex,
      coordinate_suspicious: true,
      suspicious_reason: '안산 지역 좌표가 의심스러움 (서울 지역 좌표로 보임)'
    }
  }

  return complex
}

/**
 * GET /api/molit-coords-improved/coordinates
 * 좌표 정확성이 보정된 국토부 실거래가 데이터
 */
router.get('/coordinates', async (req, res) => {
  try {
    const {
      region = '',
      sigungu = '',
      limit = 200  // 더 많은 데이터 제공
    } = req.query

    console.log('📍 개선된 좌표 보정 API 호출:', { region, sigungu, limit })

    // 통합 DB에서 좌표 데이터 조회
    const integratedDbPath = path.join(__dirname, '../../data/integrated_real_estate.db')
    
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

    if (coordData.length === 0) {
      return res.json({
        data: [],
        count: 0,
        message: '조건에 맞는 단지가 없습니다.'
      })
    }

    // 좌표 정확성 검증 및 보정 적용
    const correctedData = coordData.map(validateAndCorrectCoordinates)

    // 97만건 MOLIT DB에서 거래 데이터 조회
    const completeMolitPath = path.join(__dirname, '../../data/molit_complete_data.db')
    
    const allTransactionStats = await new Promise((resolve) => {
      const completeMolitDb = new sqlite3.Database(completeMolitPath, (err) => {
        if (err) {
          console.warn('MOLIT DB 연결 실패:', err.message)
          resolve({})
          return
        }
        
        const aptNames = correctedData.map(c => c.name).filter(Boolean)
        if (aptNames.length === 0) {
          resolve({})
          return
        }

        const placeholders = aptNames.map(() => '?').join(',')
        const optimizedQuery = `
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
          WHERE json_extract(api_data, '$.aptNm') IN (${placeholders})
          GROUP BY json_extract(api_data, '$.aptNm')
        `
        
        completeMolitDb.all(optimizedQuery, aptNames, (err, rows) => {
          completeMolitDb.close()
          if (err) {
            console.warn('거래 데이터 조회 실패:', err.message)
            resolve({})
          } else {
            const statsMap = {}
            rows.forEach(row => {
              if (row.apt_name) {
                statsMap[row.apt_name] = {
                  count: row.count || 0,
                  avg_price: row.avg_price || 0,
                  latest_deal: row.latest_deal
                }
              }
            })
            resolve(statsMap)
          }
        })
      })
    })

    // 최종 데이터 조합 및 품질 정보 추가
    const finalData = correctedData
      .filter(complex => !complex.coordinate_error) // 오류 좌표 제외
      .map((complex) => {
        const stats = allTransactionStats[complex.name] || { count: 0, avg_price: 0, latest_deal: null }

        return {
          id: `molit_improved_${complex.name}`.replace(/\s+/g, '_'),
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
          // 실거래 데이터
          transaction_count: stats.count,
          avg_transaction_price: stats.count > 0 ? 
            Math.round(stats.avg_price / 10000) : null,
          latest_transaction_date: stats.latest_deal,
          // 좌표 품질 정보
          coordinate_corrected: complex.coordinate_corrected || false,
          correction_reason: complex.correction_reason,
          coordinate_suspicious: complex.coordinate_suspicious || false,
          suspicious_reason: complex.suspicious_reason,
          source: 'molit_coordinate_improved',
          coordinate_source: 'integrated_db_with_validation',
          data_source: '좌표_정확성_보정_적용'
        }
      })

    // 통계 계산
    const totalTransactions = finalData.reduce((sum, complex) => sum + (complex.transaction_count || 0), 0)
    const complexesWithTransactions = finalData.filter(c => c.transaction_count > 0)
    const correctedCount = finalData.filter(c => c.coordinate_corrected).length
    const suspiciousCount = finalData.filter(c => c.coordinate_suspicious).length

    res.json({
      data: finalData,
      count: finalData.length,
      source: 'molit_coordinate_accuracy_improved',
      coordinate_source: 'validated_and_corrected',
      transaction_source: '97만건_실제_거래데이터',
      filters: { region, sigungu, limit: parseInt(limit) },
      statistics: {
        total_complexes: finalData.length,
        total_complexes_with_transactions: complexesWithTransactions.length,
        total_transactions: totalTransactions,
        coordinate_corrections: correctedCount,
        suspicious_coordinates: suspiciousCount,
        data_quality_score: ((finalData.length - suspiciousCount) / finalData.length * 100).toFixed(1) + '%'
      },
      quality_improvements: {
        coordinate_fixes_applied: correctedCount,
        known_issues_filtered: suspiciousCount,
        validation_rules: ['한국_좌표_범위_검증', '지역별_좌표_일치성_검사', '알려진_오류_보정']
      },
      message: `좌표 개선: ${finalData.length}개 단지, ${correctedCount}개 좌표 보정, ${totalTransactions}건 실거래 데이터`
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