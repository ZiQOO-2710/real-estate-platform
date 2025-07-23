/**
 * 좌표 및 중복 데이터 정리 스크립트
 * 잘못된 헬리오시티 좌표 수정 및 중복 데이터 제거
 */

const sqlite3 = require('sqlite3').verbose()
const path = require('path')

class CoordinatesCleaner {
  constructor() {
    this.dbPath = path.join(__dirname, '../../data/master_integrated_real_estate.db')
    this.db = null
    this.corrections = []
    this.deletions = []
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err)
          return
        }
        console.log('✅ 마스터 데이터베이스 연결 완료')
        resolve()
      })
    })
  }

  async cleanData() {
    console.log('🧹 좌표 및 중복 데이터 정리 시작')

    try {
      // 1. 헬리오시티 좌표 문제 수정
      await this.fixHeliosCityCoordinates()
      
      // 2. 중복 데이터 정리
      await this.removeDuplicateComplexes()
      
      // 3. 좌표 검증 및 수정
      await this.validateAndFixCoordinates()
      
      // 4. 최종 검증
      await this.validateResults()

      console.log('✅ 데이터 정리 완료')
      console.log(`📊 수정된 레코드: ${this.corrections.length}개`)
      console.log(`🗑️ 삭제된 레코드: ${this.deletions.length}개`)

    } catch (error) {
      console.error('❌ 데이터 정리 실패:', error)
      throw error
    }
  }

  async fixHeliosCityCoordinates() {
    console.log('🔧 헬리오시티 좌표 문제 수정 중...')

    // 헬리오시티 레코드 조회
    const heliosCities = await this.query(`
      SELECT id, name, latitude, longitude, sido, sigungu 
      FROM apartment_complexes 
      WHERE name = '헬리오시티'
      ORDER BY id
    `)

    console.log(`  📍 발견된 헬리오시티: ${heliosCities.length}개`)

    for (const complex of heliosCities) {
      console.log(`    ID ${complex.id}: (${complex.latitude}, ${complex.longitude}) ${complex.sigungu}`)
      
      // 잘못된 좌표 (중구 근처) 확인 및 삭제
      if (complex.longitude < 127.0) {
        console.log(`    🗑️ 잘못된 좌표 발견 - 삭제 예정: ID ${complex.id}`)
        await this.deleteComplex(complex.id, '헬리오시티 잘못된 좌표')
      } else {
        console.log(`    ✅ 정확한 좌표 확인: ID ${complex.id}`)
        
        // 정확한 헬리오시티 좌표로 업데이트 (잠실 헬리오시티)
        const correctCoords = {
          latitude: 37.5142,  // 실제 헬리오시티 좌표
          longitude: 127.1026,
          address_jibun: '서울 송파구 잠실동 40-1',
          eup_myeon_dong: '잠실동'
        }
        
        await this.updateComplex(complex.id, correctCoords, '헬리오시티 정확한 좌표로 수정')
      }
    }
  }

  async removeDuplicateComplexes() {
    console.log('🔍 중복 단지 데이터 정리 중...')

    // 중복이 많은 단지들 조회
    const duplicates = await this.query(`
      SELECT name, sigungu, COUNT(*) as count,
             GROUP_CONCAT(id) as ids
      FROM apartment_complexes 
      GROUP BY name, sigungu 
      HAVING COUNT(*) > 1 
      ORDER BY count DESC
    `)

    console.log(`  📊 중복 그룹: ${duplicates.length}개`)

    for (const duplicate of duplicates) {
      const ids = duplicate.ids.split(',').map(id => parseInt(id))
      console.log(`  🔄 ${duplicate.name} (${duplicate.sigungu}): ${duplicate.count}개`)
      
      // 가장 완전한 데이터를 가진 레코드 찾기
      const complexes = await this.query(`
        SELECT * FROM apartment_complexes 
        WHERE id IN (${ids.join(',')})
        ORDER BY 
          CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 ELSE 0 END DESC,
          CASE WHEN address_jibun IS NOT NULL THEN 1 ELSE 0 END DESC,
          created_at ASC
      `)

      // 첫 번째(가장 완전한) 레코드는 유지, 나머지는 삭제
      const keepId = complexes[0].id
      const deleteIds = complexes.slice(1).map(c => c.id)

      console.log(`    ✅ 유지: ID ${keepId}`)
      console.log(`    🗑️ 삭제: ID ${deleteIds.join(', ')}`)

      for (const deleteId of deleteIds) {
        await this.deleteComplex(deleteId, `${duplicate.name} 중복 제거`)
      }
    }
  }

  async validateAndFixCoordinates() {
    console.log('🗺️ 좌표 검증 및 수정 중...')

    // 한국 범위를 벗어난 좌표 찾기
    const invalidCoords = await this.query(`
      SELECT id, name, latitude, longitude, sido, sigungu
      FROM apartment_complexes 
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        AND (latitude < 33.0 OR latitude > 39.0 OR longitude < 124.0 OR longitude > 132.0)
    `)

    console.log(`  ⚠️ 유효하지 않은 좌표: ${invalidCoords.length}개`)

    for (const complex of invalidCoords) {
      console.log(`    🚨 ${complex.name} (${complex.sigungu}): (${complex.latitude}, ${complex.longitude})`)
      
      // 좌표를 null로 설정 (잘못된 좌표보다 null이 나음)
      await this.run(`
        UPDATE apartment_complexes 
        SET latitude = NULL, longitude = NULL 
        WHERE id = ?
      `, [complex.id])
      
      this.corrections.push(`${complex.name} - 잘못된 좌표 제거`)
    }
  }

  async deleteComplex(complexId, reason) {
    try {
      // 관련 데이터도 함께 삭제
      await this.run('DELETE FROM current_listings WHERE apartment_complex_id = ?', [complexId])
      await this.run('DELETE FROM transaction_records WHERE apartment_complex_id = ?', [complexId])
      await this.run('DELETE FROM apartment_complexes WHERE id = ?', [complexId])
      
      this.deletions.push(`ID ${complexId} - ${reason}`)
      console.log(`    🗑️ 삭제 완료: ID ${complexId} (${reason})`)
      
    } catch (error) {
      console.error(`    ❌ 삭제 실패: ID ${complexId} - ${error.message}`)
    }
  }

  async updateComplex(complexId, updates, reason) {
    try {
      const setParts = Object.keys(updates).map(key => `${key} = ?`)
      const values = [...Object.values(updates), complexId]
      
      await this.run(`
        UPDATE apartment_complexes 
        SET ${setParts.join(', ')} 
        WHERE id = ?
      `, values)
      
      this.corrections.push(`ID ${complexId} - ${reason}`)
      console.log(`    ✅ 업데이트 완료: ID ${complexId} (${reason})`)
      
    } catch (error) {
      console.error(`    ❌ 업데이트 실패: ID ${complexId} - ${error.message}`)
    }
  }

  async validateResults() {
    console.log('🔍 최종 검증 중...')

    const stats = await this.query(`
      SELECT 
        COUNT(*) as total_complexes,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL 
               AND latitude BETWEEN 33.0 AND 39.0 
               AND longitude BETWEEN 124.0 AND 132.0 THEN 1 END) as valid_coords
      FROM apartment_complexes
    `)

    const heliosCheck = await this.query(`
      SELECT id, name, latitude, longitude, sigungu 
      FROM apartment_complexes 
      WHERE name = '헬리오시티'
    `)

    console.log('📊 최종 통계:')
    console.log(`  전체 단지: ${stats[0].total_complexes}개`)
    console.log(`  좌표 보유: ${stats[0].with_coords}개`)
    console.log(`  유효 좌표: ${stats[0].valid_coords}개`)
    console.log(`  헬리오시티: ${heliosCheck.length}개`)

    if (heliosCheck.length > 0) {
      heliosCheck.forEach(complex => {
        console.log(`    ID ${complex.id}: (${complex.latitude}, ${complex.longitude}) ${complex.sigungu}`)
      })
    }
  }

  // 헬퍼 메서드들
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve(this)
      })
    })
  }

  async close() {
    if (this.db) {
      return new Promise(resolve => {
        this.db.close(err => {
          if (err) console.error('DB 종료 오류:', err)
          resolve()
        })
      })
    }
  }
}

// 메인 실행 함수
async function cleanCoordinates() {
  const cleaner = new CoordinatesCleaner()
  
  try {
    await cleaner.initialize()
    await cleaner.cleanData()
    
    console.log('\n🎉 좌표 데이터 정리가 완료되었습니다!')
    return true
    
  } catch (error) {
    console.error('💥 좌표 데이터 정리 실패:', error)
    return false
  } finally {
    await cleaner.close()
  }
}

// 스크립트로 직접 실행할 때
if (require.main === module) {
  cleanCoordinates()
    .then(success => {
      process.exit(success ? 0 : 1)
    })
    .catch(error => {
      console.error('실행 오류:', error)
      process.exit(1)
    })
}

module.exports = CoordinatesCleaner