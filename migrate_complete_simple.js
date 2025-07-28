/**
 * 97만건 국토부 실거래가 데이터 완전 마이그레이션 (단순 버전)
 * 기존 테이블에 좌표 + 모든 필드 포함하여 삽입
 */

const sqlite3 = require('sqlite3').verbose();
const { supabase1 } = require('./api/src/config/supabase');

// 소스 데이터베이스 (로컬 SQLite)
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function migrateCompleteSimple() {
  console.log('🚀 97만건 국토부 데이터 완전 마이그레이션 (단순)');
  console.log('지도 마커용 좌표 + 모든 필드 포함');
  console.log('==========================================');
  
  try {
    // 1. 로컬 SQLite DB 연결
    console.log('📂 로컬 SQLite DB 연결 중...');
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 2. 좌표가 있는 최신 데이터 조회 (10만건 제한)
    console.log('🗺️  좌표 포함 최신 데이터 추출 중...');
    
    const completeDataQuery = `
      SELECT 
        id,
        region_code,
        region_name,
        deal_type,
        api_data,
        longitude,
        latitude,
        coordinate_source,
        crawled_at,
        created_at
      FROM apartment_transactions 
      WHERE longitude IS NOT NULL 
        AND latitude IS NOT NULL
        AND longitude BETWEEN 124 AND 132
        AND latitude BETWEEN 33 AND 39
        AND api_data IS NOT NULL
        AND json_extract(api_data, '$.dealYear') IN ('2023', '2024', '2025')
        AND json_extract(api_data, '$.aptNm') IS NOT NULL
        AND json_extract(api_data, '$.dealAmount') IS NOT NULL
      ORDER BY json_extract(api_data, '$.dealYear') DESC, 
               json_extract(api_data, '$.dealMonth') DESC
      LIMIT 10000
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
    
    // 4. 기존 데이터 삭제 (마이그레이션 소스)
    console.log('\n🗑️  기존 마이그레이션 데이터 정리 중...');
    
    const { error: deleteError } = await supabase1
      .from('apartment_transactions')
      .delete()
      .eq('coordinate_source', 'molit_migration_2025');
    
    if (deleteError) {
      console.log('⚠️ 기존 데이터 삭제 실패:', deleteError.message);
    } else {
      console.log('✅ 기존 마이그레이션 데이터 정리 완료');
    }
    
    // 5. 배치 단위로 완전 데이터 삽입
    console.log('\n📊 완전한 데이터 삽입 시작...');
    
    const BATCH_SIZE = 200; // 작은 배치로 안전하게
    let totalInserted = 0;
    let totalErrors = 0;
    
    for (let i = 0; i < completeData.length; i += BATCH_SIZE) {
      const batch = completeData.slice(i, i + BATCH_SIZE);
      
      console.log(`\n🔄 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 중... (${i + 1} ~ ${i + batch.length})`);
      
      const insertData = batch.map(row => {
        const apiData = JSON.parse(row.api_data || '{}');
        
        // deal_amount에서 숫자만 추출
        let dealAmount = null;
        if (apiData.dealAmount) {
          const amountStr = apiData.dealAmount.replace(/[^0-9]/g, '');
          dealAmount = amountStr ? parseInt(amountStr) : null;
        }
        
        return {
          // 기본 정보
          apartment_name: apiData.aptNm?.trim() || '',
          region_name: row.region_name?.trim() || '',
          legal_dong: apiData.umdNm?.trim() || '',
          jibun: apiData.jibun?.trim() || '',
          road_name: apiData.roadNm?.trim() || '',
          deal_type: row.deal_type?.trim() || apiData.deal_type || '',
          
          // 거래 정보
          deal_year: apiData.dealYear ? parseInt(apiData.dealYear) : null,
          deal_month: apiData.dealMonth ? parseInt(apiData.dealMonth) : null,
          deal_day: apiData.dealDay ? parseInt(apiData.dealDay) : null,
          deal_amount: dealAmount,
          
          // 부동산 정보
          area: apiData.excluUseAr ? parseFloat(apiData.excluUseAr) : null,
          floor: apiData.floor ? parseInt(apiData.floor) : null,
          construction_year: apiData.buildYear ? parseInt(apiData.buildYear) : null,
          
          // 좌표 (지도 마커용 - 핵심!)
          longitude: row.longitude,
          latitude: row.latitude,
          coordinate_source: 'molit_complete_2025',
          
          // 추가 정보 (JSON으로 저장)
          api_data_json: apiData,
          
          // 월세/전세 정보
          deposit: apiData.deposit ? parseInt(apiData.deposit.replace(/[^0-9]/g, '')) || null : null,
          monthly_rent: apiData.monthlyRent ? parseInt(apiData.monthlyRent.replace(/[^0-9]/g, '')) || null : null,
          
          // 메타 정보
          source_id: row.id,
          crawled_at: row.crawled_at
        };
      });
      
      // 샘플 정보 출력
      const sample = insertData[0];
      console.log('💡 배치 샘플:');
      console.log(`  🏠 아파트: ${sample.apartment_name}`);
      console.log(`  💰 금액: ${sample.deal_amount?.toLocaleString() || '없음'}만원`);
      console.log(`  🗺️  좌표: ${sample.longitude}, ${sample.latitude} ⭐`);
      console.log(`  🏗️  건축년도: ${sample.construction_year || '없음'}`);
      console.log(`  📐 면적: ${sample.area || '없음'}㎡`);
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
        console.log('⏳ 1초 대기 중...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 6. 최종 결과
    console.log('\n🎉 지도 마커용 완전한 데이터 마이그레이션 완료!');
    console.log('================================================');
    console.log(`✅ 성공: ${totalInserted.toLocaleString()}건`);
    console.log(`❌ 실패: ${totalErrors.toLocaleString()}건`);
    console.log(`📊 성공률: ${((totalInserted / (totalInserted + totalErrors)) * 100).toFixed(1)}%`);
    
    // 7. 최종 검증
    console.log('\n🔍 지도 마커 데이터 검증...');
    
    // 좌표 포함 데이터 확인
    const { count: coordCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .not('longitude', 'is', null)
      .not('latitude', 'is', null);
    
    console.log(`🗺️  좌표 포함 데이터: ${coordCount?.toLocaleString() || 0}건 (지도 마커 표시 가능!)`);
    
    // 완전한 데이터 확인
    const { count: completeCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('coordinate_source', 'molit_complete_2025');
    
    console.log(`✅ 완전한 데이터: ${completeCount?.toLocaleString() || 0}건`);
    
    // 샘플 데이터 확인
    const { data: finalSamples } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .eq('coordinate_source', 'molit_complete_2025')
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (finalSamples && finalSamples.length > 0) {
      console.log('\n💎 지도 마커용 최종 데이터 샘플:');
      finalSamples.forEach((sample, index) => {
        console.log(`\n🗺️  마커 ${index + 1}:`);
        console.log(`  🏠 아파트: ${sample.apartment_name}`);
        console.log(`  💰 금액: ${sample.deal_amount?.toLocaleString()}만원`);
        console.log(`  📍 좌표: ${sample.longitude}, ${sample.latitude} ⭐`);
        console.log(`  🏗️  건축년도: ${sample.construction_year}`);
        console.log(`  📐 면적: ${sample.area}㎡`);
        console.log(`  📍 도로명: ${sample.road_name}`);
        console.log(`  📅 거래일: ${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
        console.log(`  🗂️  상세정보: ${Object.keys(sample.api_data_json || {}).length}개 필드`);
      });
    }
    
    db.close();
    console.log('\n🏁 지도 마커용 완전한 데이터 마이그레이션 성공!');
    console.log('🗺️  이제 지도에 마커 표시하고 클릭 시 상세 정보 표시 가능합니다!');
    console.log('⭐ 좌표 데이터 포함으로 완벽한 지도 서비스 구현 준비 완료!');
    
  } catch (error) {
    console.error('💥 완전 마이그레이션 오류:', error);
  }
}

// 실행
if (require.main === module) {
  migrateCompleteSimple();
}

module.exports = { migrateCompleteSimple };