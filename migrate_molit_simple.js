/**
 * 97만건 국토부 실거래가 데이터를 Primary Supabase DB에 마이그레이션 (단순 버전)
 * 기존 테이블 구조를 활용하여 누락된 컬럼 데이터 보완
 */

const sqlite3 = require('sqlite3').verbose();
const { supabase1 } = require('./api/src/config/supabase');

// 소스 데이터베이스 (로컬 SQLite)
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function migrateToSupabaseSimple() {
  console.log('🚀 국토부 실거래가 데이터 → Primary Supabase DB 마이그레이션 (단순)');
  console.log('================================================================');
  
  try {
    // 1. 로컬 SQLite DB 연결
    console.log('📂 로컬 SQLite DB 연결 중...');
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 2. 최근 1년 데이터 조회 (샘플부터 시작)
    console.log('📅 최근 1년치 데이터 추출 중 (샘플 1000건)...');
    
    const recentDataQuery = `
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
               json_extract(api_data, '$.dealMonth') DESC
      LIMIT 1000
    `;
    
    const recentData = await new Promise((resolve, reject) => {
      db.all(recentDataQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`✅ 추출 완료: ${recentData.length.toLocaleString()}건`);
    
    // 3. 기존 Primary DB에서 기존 데이터 확인
    console.log('🔍 Primary DB 기존 데이터 확인 중...');
    
    const { count: existingCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 기존 데이터: ${existingCount?.toLocaleString() || 0}건`);
    
    // 4. 기존 테이블에 누락 컬럼 있는지 확인 (샘플 데이터로)
    const { data: sampleExisting } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .limit(1);
    
    if (sampleExisting && sampleExisting.length > 0) {
      console.log('📋 기존 컬럼:', Object.keys(sampleExisting[0]));
    }
    
    // 5. 새로운 완전한 데이터로 삽입 (기존 테이블 구조 활용)
    console.log('📊 새 데이터 삽입 시작...');
    
    const BATCH_SIZE = 100; // 작은 배치로 시작
    let inserted = 0;
    let errors = 0;
    
    for (let i = 0; i < Math.min(recentData.length, 500); i += BATCH_SIZE) { // 최대 500건
      const batch = recentData.slice(i, i + BATCH_SIZE);
      
      console.log(`\\n🔄 배치 ${Math.floor(i / BATCH_SIZE) + 1} 처리 중...`);
      
      const insertData = batch.map(row => {
        // deal_amount에서 숫자만 추출하여 정수로 변환
        let dealAmount = null;
        if (row.deal_amount) {
          const amountStr = row.deal_amount.replace(/[^0-9]/g, '');
          dealAmount = amountStr ? parseInt(amountStr) : null;
        }
        
        return {
          apartment_name: row.apartment_name || '',
          region_name: row.region_name || '',
          legal_dong: row.legal_dong || '',
          jibun: row.jibun || '',
          road_name: row.road_name || '',
          deal_type: row.deal_type || '',
          deal_year: row.deal_year ? parseInt(row.deal_year) : null,
          deal_month: row.deal_month ? parseInt(row.deal_month) : null,
          deal_day: row.deal_day ? parseInt(row.deal_day) : null,
          deal_amount: dealAmount,
          area: row.area ? parseFloat(row.area) : null,
          floor: row.floor ? parseInt(row.floor) : null,
          longitude: row.longitude || null,
          latitude: row.latitude || null,
          coordinate_source: row.coordinate_source || 'molit_migration'
        };
      });
      
      // 배치별로 상세 정보 출력
      console.log('💡 배치 샘플:');
      console.log('  아파트명:', insertData[0]?.apartment_name);
      console.log('  지역:', insertData[0]?.region_name);
      console.log('  💰 거래금액:', insertData[0]?.deal_amount?.toLocaleString() || '없음');
      console.log('  📍 도로명:', insertData[0]?.road_name || '없음');
      console.log('  📍 지번:', insertData[0]?.jibun || '없음');
      
      const { data, error } = await supabase1
        .from('apartment_transactions')
        .insert(insertData);
      
      if (error) {
        console.error(`❌ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 삽입 실패:`, error.message);
        console.error('오류 상세:', error);
        errors += batch.length;
      } else {
        inserted += batch.length;
        console.log(`✅ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료: ${inserted}/${Math.min(recentData.length, 500)}건`);
      }
      
      // 진행률 표시
      const progress = ((i + BATCH_SIZE) / Math.min(recentData.length, 500) * 100).toFixed(1);
      console.log(`📈 진행률: ${progress}%`);
      
      // 속도 조절
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 6. 결과 요약
    console.log('\\n🎉 마이그레이션 완료!');
    console.log('========================');
    console.log(`✅ 성공: ${inserted.toLocaleString()}건`);
    console.log(`❌ 실패: ${errors.toLocaleString()}건`);
    
    // 7. 데이터 검증
    console.log('\\n🔍 최종 데이터 검증 중...');
    
    const { count: finalCount } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`✅ Primary DB 최종 데이터: ${finalCount?.toLocaleString() || 0}건`);
    
    // 샘플 데이터 확인 (완전한 컬럼 포함)
    const { data: newSampleData } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .not('deal_amount', 'is', null)
      .not('road_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (newSampleData && newSampleData.length > 0) {
      console.log('\\n💡 새로 삽입된 완전한 데이터 샘플:');
      newSampleData.forEach((sample, index) => {
        console.log(`\\n--- 샘플 ${index + 1} ---`);
        console.log('아파트명:', sample.apartment_name);
        console.log('지역:', sample.region_name);
        console.log('거래유형:', sample.deal_type);
        console.log('💰 거래금액:', sample.deal_amount?.toLocaleString() || '없음', '만원');
        console.log('📍 도로명:', sample.road_name || '없음');
        console.log('📍 법정동:', sample.legal_dong || '없음');
        console.log('📍 지번:', sample.jibun || '없음');
        console.log('🗺️  좌표:', sample.longitude, sample.latitude);
        console.log('거래일:', `${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
        console.log('전체 컬럼:', Object.keys(sample).length + '개');
      });
    }
    
    db.close();
    console.log('\\n🏁 마이그레이션 완료!');
    
  } catch (error) {
    console.error('💥 마이그레이션 오류:', error);
  }
}

// 실행
if (require.main === module) {
  migrateToSupabaseSimple();
}

module.exports = { migrateToSupabaseSimple };