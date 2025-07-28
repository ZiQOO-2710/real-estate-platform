/**
 * 97만건 국토부 실거래가 데이터 대량 마이그레이션
 * 최근 1년치 전체 데이터를 Primary Supabase DB에 삽입
 */

const sqlite3 = require('sqlite3').verbose();
const { supabase1 } = require('./api/src/config/supabase');

// 소스 데이터베이스 (로컬 SQLite)
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function migrateFullData() {
  console.log('🚀 국토부 실거래가 데이터 대량 마이그레이션 시작');
  console.log('==============================================');
  
  try {
    // 1. 로컬 SQLite DB 연결
    console.log('📂 로컬 SQLite DB 연결 중...');
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 2. 최근 1년 데이터 총 개수 확인
    console.log('📊 최근 1년치 데이터 개수 확인 중...');
    
    const countQuery = `
      SELECT COUNT(*) as total
      FROM apartment_transactions 
      WHERE json_extract(api_data, '$.dealYear') IN ('2024', '2025')
        AND json_extract(api_data, '$.dealAmount') IS NOT NULL
        AND json_extract(api_data, '$.aptNm') IS NOT NULL
    `;
    
    const totalCount = await new Promise((resolve, reject) => {
      db.get(countQuery, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });
    
    console.log(`📈 마이그레이션 대상: ${totalCount.toLocaleString()}건`);
    
    // 3. 배치 단위로 마이그레이션
    const BATCH_SIZE = 500;
    const MAX_RECORDS = 50000; // 최대 5만건부터 시작
    const targetRecords = Math.min(totalCount, MAX_RECORDS);
    
    console.log(`🎯 목표: ${targetRecords.toLocaleString()}건`);
    console.log(`📦 배치 크기: ${BATCH_SIZE}건`);
    
    let totalInserted = 0;
    let totalErrors = 0;
    let offset = 0;
    
    // 4. 배치별 처리
    while (offset < targetRecords) {
      const currentBatch = Math.min(BATCH_SIZE, targetRecords - offset);
      
      console.log(`\\n🔄 배치 ${Math.floor(offset / BATCH_SIZE) + 1} 처리 중... (${offset + 1} ~ ${offset + currentBatch})`);
      
      // 배치 데이터 조회
      const batchQuery = `
        SELECT 
          id,
          region_code,
          region_name,
          deal_type,
          json_extract(api_data, '$.dealYear') as deal_year,
          json_extract(api_data, '$.dealMonth') as deal_month,
          json_extract(api_data, '$.dealDay') as deal_day,
          json_extract(api_data, '$.dealAmount') as deal_amount,
          json_extract(api_data, '$.aptNm') as apartment_name,
          json_extract(api_data, '$.excluUseAr') as area,
          json_extract(api_data, '$.floor') as floor,
          json_extract(api_data, '$.buildYear') as construction_year,
          json_extract(api_data, '$.roadNm') as road_name,
          json_extract(api_data, '$.umdNm') as legal_dong,
          json_extract(api_data, '$.jibun') as jibun,
          longitude,
          latitude,
          coordinate_source
        FROM apartment_transactions 
        WHERE json_extract(api_data, '$.dealYear') IN ('2024', '2025')
          AND json_extract(api_data, '$.dealAmount') IS NOT NULL
          AND json_extract(api_data, '$.aptNm') IS NOT NULL
        ORDER BY json_extract(api_data, '$.dealYear') DESC, 
                 json_extract(api_data, '$.dealMonth') DESC,
                 id
        LIMIT ${currentBatch} OFFSET ${offset}
      `;
      
      const batchData = await new Promise((resolve, reject) => {
        db.all(batchQuery, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log(`📥 조회 완료: ${batchData.length}건`);
      
      // 데이터 변환
      const insertData = batchData.map(row => {
        // deal_amount에서 숫자만 추출
        let dealAmount = null;
        if (row.deal_amount) {
          const amountStr = row.deal_amount.replace(/[^0-9]/g, '');
          dealAmount = amountStr ? parseInt(amountStr) : null;
        }
        
        return {
          apartment_name: row.apartment_name?.trim() || '',
          region_name: row.region_name?.trim() || '',
          legal_dong: row.legal_dong?.trim() || '',
          jibun: row.jibun?.trim() || '',
          road_name: row.road_name?.trim() || '',
          deal_type: row.deal_type?.trim() || '',
          deal_year: row.deal_year ? parseInt(row.deal_year) : null,
          deal_month: row.deal_month ? parseInt(row.deal_month) : null,
          deal_day: row.deal_day ? parseInt(row.deal_day) : null,
          deal_amount: dealAmount,
          area: row.area ? parseFloat(row.area) : null,
          floor: row.floor ? parseInt(row.floor) : null,
          longitude: row.longitude || null,
          latitude: row.latitude || null,
          coordinate_source: row.coordinate_source || 'molit_migration_2025'
        };
      });
      
      // 배치 정보 출력
      const sampleData = insertData[0];
      console.log('💡 배치 샘플:');
      console.log(`  아파트: ${sampleData?.apartment_name}`);
      console.log(`  지역: ${sampleData?.region_name}`);
      console.log(`  💰 금액: ${sampleData?.deal_amount?.toLocaleString() || '없음'}만원`);
      console.log(`  📍 주소: ${sampleData?.road_name || '없음'}`);
      
      // Supabase에 삽입
      try {
        const { data, error } = await supabase1
          .from('apartment_transactions')
          .insert(insertData);
        
        if (error) {
          console.error(`❌ 배치 ${Math.floor(offset / BATCH_SIZE) + 1} 실패:`, error.message);
          totalErrors += batchData.length;
        } else {
          totalInserted += batchData.length;
          console.log(`✅ 배치 ${Math.floor(offset / BATCH_SIZE) + 1} 성공: ${batchData.length}건`);
        }
      } catch (insertError) {
        console.error(`💥 삽입 오류:`, insertError.message);
        totalErrors += batchData.length;
      }
      
      offset += currentBatch;
      
      // 진행률 표시
      const progress = (offset / targetRecords * 100).toFixed(1);
      console.log(`📈 전체 진행률: ${progress}% (${totalInserted.toLocaleString()}/${targetRecords.toLocaleString()}건)`);
      
      // 속도 조절 (서버 부하 방지)
      if (offset < targetRecords) {
        console.log('⏳ 2초 대기 중...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // 5. 최종 결과
    console.log('\\n🎉 대량 마이그레이션 완료!');
    console.log('=============================');
    console.log(`✅ 성공: ${totalInserted.toLocaleString()}건`);
    console.log(`❌ 실패: ${totalErrors.toLocaleString()}건`);
    console.log(`📊 성공률: ${((totalInserted / (totalInserted + totalErrors)) * 100).toFixed(1)}%`);
    
    // 6. Primary DB 최종 데이터 확인
    console.log('\\n🔍 Primary DB 최종 상태 확인...');
    
    const { count: finalCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Primary DB 총 데이터: ${finalCount?.toLocaleString() || 0}건`);
    
    // 최근 삽입된 데이터 샘플
    const { data: recentSamples } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .not('deal_amount', 'is', null)
      .not('road_name', 'is', null)
      .eq('coordinate_source', 'molit_migration_2025')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recentSamples && recentSamples.length > 0) {
      console.log('\\n💎 최신 마이그레이션 데이터 샘플:');
      recentSamples.forEach((sample, index) => {
        console.log(`\\n🏠 샘플 ${index + 1}:`);
        console.log(`  아파트: ${sample.apartment_name}`);
        console.log(`  지역: ${sample.region_name}`);
        console.log(`  거래: ${sample.deal_type}`);
        console.log(`  💰 금액: ${sample.deal_amount?.toLocaleString()}만원`);
        console.log(`  📍 도로명: ${sample.road_name}`);
        console.log(`  📍 법정동: ${sample.legal_dong}`);
        console.log(`  📍 지번: ${sample.jibun}`);
        console.log(`  📅 거래일: ${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
        console.log(`  🗺️  좌표: ${sample.longitude}, ${sample.latitude}`);
      });
    }
    
    // 통계 정보
    const { data: stats } = await supabase1
      .from('apartment_transactions')
      .select('deal_type')
      .eq('coordinate_source', 'molit_migration_2025');
    
    if (stats) {
      const dealTypeCount = {};
      stats.forEach(item => {
        dealTypeCount[item.deal_type || '기타'] = (dealTypeCount[item.deal_type || '기타'] || 0) + 1;
      });
      
      console.log('\\n📊 거래 유형별 분포:');
      Object.entries(dealTypeCount).forEach(([type, count]) => {
        console.log(`  ${type}: ${count.toLocaleString()}건`);
      });
    }
    
    db.close();
    console.log('\\n🏁 대량 마이그레이션 완료!');
    
  } catch (error) {
    console.error('💥 대량 마이그레이션 오류:', error);
  }
}

// 실행
if (require.main === module) {
  migrateFullData();
}

module.exports = { migrateFullData };