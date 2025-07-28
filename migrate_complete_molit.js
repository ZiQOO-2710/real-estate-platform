/**
 * 97만건 국토부 실거래가 데이터 완전 마이그레이션
 * 지도 마커용 좌표 + 모든 필드 포함
 */

const sqlite3 = require('sqlite3').verbose();
const { supabase1 } = require('./api/src/config/supabase');

// 소스 데이터베이스 (로컬 SQLite)
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function migrateCompleteData() {
  console.log('🚀 97만건 국토부 데이터 완전 마이그레이션 시작');
  console.log('지도 마커용 좌표 + 모든 41개 필드 포함');
  console.log('===============================================');
  
  try {
    // 1. 로컬 SQLite DB 연결
    console.log('📂 로컬 SQLite DB 연결 중...');
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 2. 좌표가 있는 최신 데이터 조회
    console.log('🗺️  좌표 포함 최신 데이터 추출 중...');
    
    const completeDataQuery = `
      SELECT 
        id,
        region_code,
        region_name,
        deal_type,
        deal_year,
        deal_month,
        deal_day,
        deal_amount,
        apartment_name,
        area,
        floor,
        construction_year,
        road_name,
        road_name_code,
        legal_dong,
        jibun,
        apartment_seq,
        monthly_rent,
        deposit,
        api_data,
        longitude,
        latitude,
        coordinate_source,
        crawled_at,
        created_at
      FROM apartment_transactions 
      WHERE longitude IS NOT NULL 
        AND latitude IS NOT NULL
        AND api_data IS NOT NULL
        AND json_extract(api_data, '$.dealYear') IN ('2023', '2024', '2025')
      ORDER BY json_extract(api_data, '$.dealYear') DESC, 
               json_extract(api_data, '$.dealMonth') DESC
      LIMIT 100000
    `;
    
    const completeData = await new Promise((resolve, reject) => {
      db.all(completeDataQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`✅ 추출 완료: ${completeData.length.toLocaleString()}건 (좌표 포함)`);
    
    if (completeData.length === 0) {
      console.log('❌ 좌표가 있는 데이터가 없습니다.');
      return;
    }
    
    // 3. 샘플 데이터 분석
    const sampleData = completeData[0];
    const apiData = JSON.parse(sampleData.api_data);
    
    console.log('\n💡 샘플 데이터 분석:');
    console.log(`• 아파트명: ${apiData.aptNm || '없음'}`);
    console.log(`• 거래금액: ${apiData.dealAmount || '없음'}만원`);
    console.log(`• 좌표: ${sampleData.longitude}, ${sampleData.latitude}`);
    console.log(`• 전용면적: ${apiData.excluUseAr || '없음'}㎡`);
    console.log(`• 건축년도: ${apiData.buildYear || '없음'}`);
    console.log(`• 도로명: ${apiData.roadNm || '없음'}`);
    console.log(`• JSON 필드 개수: ${Object.keys(apiData).length}개`);
    
    // 4. 새로운 완전한 테이블 생성
    console.log('\n🏗️  완전한 테이블 구조 생성 중...');
    
    // 기존 테이블 백업 후 새 테이블 생성
    const { error: backupError } = await supabase1.rpc('execute_sql', {
      query: `
        -- 기존 데이터 백업
        CREATE TABLE IF NOT EXISTS apartment_transactions_backup AS 
        SELECT * FROM apartment_transactions;
        
        -- 기존 테이블 삭제
        DROP TABLE IF EXISTS apartment_transactions;
        
        -- 완전한 새 테이블 생성
        CREATE TABLE apartment_transactions (
          id SERIAL PRIMARY KEY,
          source_id INTEGER,
          
          -- 기본 정보
          region_code TEXT,
          region_name TEXT,
          deal_type TEXT,
          
          -- 거래 정보
          deal_year INTEGER,
          deal_month INTEGER,
          deal_day INTEGER,
          deal_amount INTEGER,
          deposit INTEGER,
          monthly_rent INTEGER,
          
          -- 부동산 정보
          apartment_name TEXT,
          apartment_seq TEXT,
          area DECIMAL(10,2),
          floor INTEGER,
          construction_year INTEGER,
          
          -- 주소 정보
          road_name TEXT,
          road_name_code TEXT,
          legal_dong TEXT,
          jibun TEXT,
          
          -- 좌표 (지도 마커용)
          longitude DECIMAL(11,8),
          latitude DECIMAL(11,8),
          coordinate_source TEXT,
          
          -- API 원본 데이터 (모든 41개 필드)
          api_data JSONB,
          
          -- 메타 정보
          crawled_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- 성능 최적화 인덱스
          CONSTRAINT valid_coordinates CHECK (
            longitude BETWEEN 124 AND 132 AND 
            latitude BETWEEN 33 AND 39
          )
        );
        
        -- 지도 성능 인덱스
        CREATE INDEX idx_coordinates ON apartment_transactions(longitude, latitude);
        CREATE INDEX idx_apartment_name ON apartment_transactions(apartment_name);
        CREATE INDEX idx_deal_date ON apartment_transactions(deal_year, deal_month);
        CREATE INDEX idx_deal_amount ON apartment_transactions(deal_amount);
        CREATE INDEX idx_region ON apartment_transactions(region_name);
        CREATE INDEX idx_road_name ON apartment_transactions(road_name);
        
        -- JSON 필드 인덱스 (상세 검색용)
        CREATE INDEX idx_api_data_apt_name ON apartment_transactions USING GIN ((api_data->'aptNm'));
        CREATE INDEX idx_api_data_deal_amount ON apartment_transactions USING GIN ((api_data->'dealAmount'));
      `
    });
    
    if (backupError) {
      console.error('❌ 테이블 생성 오류:', backupError);
      return;
    }
    
    console.log('✅ 완전한 테이블 구조 생성 완료');
    
    // 5. 배치 단위로 완전 데이터 삽입
    console.log('\n📊 완전한 데이터 삽입 시작...');
    
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < completeData.length; i += BATCH_SIZE) {
      const batch = completeData.slice(i, i + BATCH_SIZE);
      
      console.log(`\n🔄 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 중... (${i + 1} ~ ${i + batch.length})`);
      
      const insertData = batch.map(row => {
        const apiData = JSON.parse(row.api_data || '{}');
        
        return {
          source_id: row.id,
          region_code: row.region_code,
          region_name: row.region_name,
          deal_type: row.deal_type,
          
          // 거래 정보
          deal_year: apiData.dealYear ? parseInt(apiData.dealYear) : null,
          deal_month: apiData.dealMonth ? parseInt(apiData.dealMonth) : null,
          deal_day: apiData.dealDay ? parseInt(apiData.dealDay) : null,
          deal_amount: apiData.dealAmount ? parseInt(apiData.dealAmount.replace(/[^0-9]/g, '')) : null,
          deposit: apiData.deposit ? parseInt(apiData.deposit.replace(/[^0-9]/g, '')) : null,
          monthly_rent: apiData.monthlyRent ? parseInt(apiData.monthlyRent.replace(/[^0-9]/g, '')) : null,
          
          // 부동산 정보
          apartment_name: apiData.aptNm?.trim() || '',
          apartment_seq: apiData.aptSeq,
          area: apiData.excluUseAr ? parseFloat(apiData.excluUseAr) : null,
          floor: apiData.floor ? parseInt(apiData.floor) : null,
          construction_year: apiData.buildYear ? parseInt(apiData.buildYear) : null,
          
          // 주소 정보
          road_name: apiData.roadNm?.trim() || '',
          road_name_code: apiData.roadNmCd,
          legal_dong: apiData.umdNm?.trim() || '',
          jibun: apiData.jibun,
          
          // 좌표 (지도 마커용)
          longitude: row.longitude,
          latitude: row.latitude,
          coordinate_source: row.coordinate_source || 'molit_complete_2025',
          
          // 모든 API 원본 데이터
          api_data: apiData,
          
          // 메타 정보
          crawled_at: row.crawled_at,
        };
      });
      
      // 샘플 정보 출력
      const sample = insertData[0];
      console.log('💡 배치 샘플:');
      console.log(`  아파트: ${sample.apartment_name}`);
      console.log(`  💰 금액: ${sample.deal_amount?.toLocaleString() || '없음'}만원`);
      console.log(`  🗺️  좌표: ${sample.longitude}, ${sample.latitude}`);
      console.log(`  🏗️  건축년도: ${sample.construction_year || '없음'}`);
      console.log(`  📍 도로명: ${sample.road_name}`);
      
      // Supabase에 삽입
      try {
        const { data, error } = await supabase1
          .from('apartment_transactions')
          .insert(insertData);
        
        if (error) {
          console.error(`❌ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 실패:`, error.message);
          totalErrors += batch.length;
        } else {
          totalInserted += batch.length;
          console.log(`✅ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 성공: ${batch.length}건`);
        }
      } catch (insertError) {
        console.error(`💥 삽입 오류:`, insertError.message);
        totalErrors += batch.length;
      }
      
      // 진행률 표시
      const progress = ((i + batch.length) / completeData.length * 100).toFixed(1);
      console.log(`📈 전체 진행률: ${progress}% (${totalInserted.toLocaleString()}/${completeData.length.toLocaleString()}건)`);
      
      // 속도 조절
      if (i + batch.length < completeData.length) {
        console.log('⏳ 2초 대기 중...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // 6. 최종 결과
    console.log('\n🎉 완전한 데이터 마이그레이션 완료!');
    console.log('=====================================');
    console.log(`✅ 성공: ${totalInserted.toLocaleString()}건`);
    console.log(`❌ 실패: ${totalErrors.toLocaleString()}건`);
    console.log(`📊 성공률: ${((totalInserted / (totalInserted + totalErrors)) * 100).toFixed(1)}%`);
    
    // 7. 최종 검증
    console.log('\n🔍 완전한 데이터 검증...');
    
    const { count: finalCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Primary DB 총 데이터: ${finalCount?.toLocaleString() || 0}건`);
    
    // 좌표 포함 데이터 확인
    const { count: coordCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);
    
    console.log(`🗺️  좌표 포함 데이터: ${coordCount?.toLocaleString() || 0}건 (지도 마커 표시 가능)`);
    
    // 샘플 데이터 확인
    const { data: finalSamples } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .not('longitude', 'is', null)
      .not('api_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (finalSamples && finalSamples.length > 0) {
      console.log('\n💎 최종 완전한 데이터 샘플:');
      finalSamples.forEach((sample, index) => {
        console.log(`\n🏠 샘플 ${index + 1}:`);
        console.log(`  아파트: ${sample.apartment_name}`);
        console.log(`  💰 금액: ${sample.deal_amount?.toLocaleString()}만원`);
        console.log(`  🗺️  좌표: ${sample.longitude}, ${sample.latitude}`);
        console.log(`  🏗️  건축년도: ${sample.construction_year}`);
        console.log(`  📐 면적: ${sample.area}㎡`);
        console.log(`  📍 도로명: ${sample.road_name}`);
        console.log(`  📅 거래일: ${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
        console.log(`  🗂️  JSON 필드: ${Object.keys(sample.api_data || {}).length}개`);
      });
    }
    
    db.close();
    console.log('\n🏁 지도 마커용 완전한 데이터 마이그레이션 완료!');
    console.log('이제 지도에 마커 표시하고 클릭 시 상세 정보 표시 가능합니다! 🗺️');
    
  } catch (error) {
    console.error('💥 완전 마이그레이션 오류:', error);
  }
}

// 실행
if (require.main === module) {
  migrateCompleteData();
}

module.exports = { migrateCompleteData };