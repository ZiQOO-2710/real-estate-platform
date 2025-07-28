/**
 * 97만건 국토부 실거래가 데이터를 Primary Supabase DB에 마이그레이션
 * 최근 1년치 전체 컬럼 데이터 (거래금액, 주소, 좌표 등 포함)
 */

const sqlite3 = require('sqlite3').verbose();
const { supabase1 } = require('./api/src/config/supabase');

// 소스 데이터베이스 (로컬 SQLite)
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function migrateToSupabase() {
  console.log('🚀 국토부 실거래가 데이터 → Primary Supabase DB 마이그레이션 시작');
  console.log('================================================================');
  
  try {
    // 1. 로컬 SQLite DB 연결
    console.log('📂 로컬 SQLite DB 연결 중...');
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 2. 최근 1년 데이터 조회 (2024년 이후)
    console.log('📅 최근 1년치 데이터 추출 중...');
    
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
        json_extract(api_data, '$.deposit') as deposit,
        json_extract(api_data, '$.monthly_rent') as monthly_rent,
        longitude,
        latitude,
        coordinate_source,
        api_data,
        crawled_at,
        created_at
      FROM apartment_transactions 
      WHERE json_extract(api_data, '$.dealYear') IN ('2024', '2025')
      ORDER BY json_extract(api_data, '$.dealYear') DESC, 
               json_extract(api_data, '$.dealMonth') DESC
    `;
    
    const recentData = await new Promise((resolve, reject) => {
      db.all(recentDataQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log(`✅ 추출 완료: ${recentData.length.toLocaleString()}건`);
    
    // 3. Primary Supabase DB에 테이블 생성/업데이트
    console.log('🏗️  Primary Supabase DB에 완전한 테이블 생성 중...');
    
    // 기존 테이블 삭제 후 재생성 (완전한 스키마로)
    const { error: dropError } = await supabase1.rpc('execute_sql', {
      query: 'DROP TABLE IF EXISTS molit_real_estate_transactions;'
    });
    
    // 완전한 테이블 생성
    const createTableQuery = `
      CREATE TABLE molit_real_estate_transactions (
        id SERIAL PRIMARY KEY,
        source_id INTEGER,
        region_code TEXT,
        region_name TEXT,
        deal_type TEXT,
        deal_year TEXT,
        deal_month TEXT,
        deal_day TEXT,
        deal_amount TEXT,
        apartment_name TEXT,
        area TEXT,
        floor TEXT,
        construction_year TEXT,
        road_name TEXT,
        legal_dong TEXT,
        jibun TEXT,
        deposit TEXT,
        monthly_rent TEXT,
        longitude DECIMAL(11, 8),
        latitude DECIMAL(11, 8),
        coordinate_source TEXT,
        api_data JSONB,
        crawled_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- 인덱스를 위한 컬럼들
        deal_date DATE GENERATED ALWAYS AS (
          CASE 
            WHEN deal_year IS NOT NULL AND deal_month IS NOT NULL 
            THEN (deal_year || '-' || LPAD(deal_month, 2, '0') || '-' || COALESCE(LPAD(deal_day, 2, '0'), '01'))::DATE
            ELSE NULL
          END
        ) STORED,
        
        deal_amount_numeric INTEGER GENERATED ALWAYS AS (
          CASE 
            WHEN deal_amount IS NOT NULL 
            THEN CAST(REPLACE(REPLACE(deal_amount, ',', ''), '만원', '') AS INTEGER)
            ELSE NULL
          END
        ) STORED
      );
      
      -- 성능 최적화 인덱스
      CREATE INDEX idx_molit_deal_date ON molit_real_estate_transactions(deal_date);
      CREATE INDEX idx_molit_region ON molit_real_estate_transactions(region_name);
      CREATE INDEX idx_molit_apartment ON molit_real_estate_transactions(apartment_name);
      CREATE INDEX idx_molit_deal_type ON molit_real_estate_transactions(deal_type);
      CREATE INDEX idx_molit_coordinates ON molit_real_estate_transactions(longitude, latitude);
      CREATE INDEX idx_molit_amount ON molit_real_estate_transactions(deal_amount_numeric);
    `;
    
    const { error: createError } = await supabase1.rpc('execute_sql', {
      query: createTableQuery
    });
    
    if (createError) {
      console.error('❌ 테이블 생성 실패:', createError);
      return;
    }
    
    console.log('✅ 완전한 테이블 생성 완료');
    
    // 4. 배치 단위로 데이터 삽입
    console.log('📊 데이터 삽입 시작...');
    
    const BATCH_SIZE = 1000;
    let inserted = 0;
    let errors = 0;
    
    for (let i = 0; i < recentData.length; i += BATCH_SIZE) {
      const batch = recentData.slice(i, i + BATCH_SIZE);
      
      const insertData = batch.map(row => ({
        source_id: row.id,
        region_code: row.region_code,
        region_name: row.region_name,
        deal_type: row.deal_type,
        deal_year: row.deal_year,
        deal_month: row.deal_month,
        deal_day: row.deal_day,
        deal_amount: row.deal_amount,
        apartment_name: row.apartment_name,
        area: row.area,
        floor: row.floor,
        construction_year: row.construction_year,
        road_name: row.road_name,
        legal_dong: row.legal_dong,
        jibun: row.jibun,
        deposit: row.deposit,
        monthly_rent: row.monthly_rent,
        longitude: row.longitude,
        latitude: row.latitude,
        coordinate_source: row.coordinate_source,
        api_data: row.api_data ? JSON.parse(row.api_data) : null,
        crawled_at: row.crawled_at,
      }));
      
      const { data, error } = await supabase1
        .from('molit_real_estate_transactions')
        .insert(insertData);
      
      if (error) {
        console.error(`❌ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 삽입 실패:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
        console.log(`✅ 배치 ${Math.floor(i / BATCH_SIZE) + 1} 완료: ${inserted.toLocaleString()}/${recentData.length.toLocaleString()}건`);
      }
      
      // 진행률 표시
      const progress = ((i + BATCH_SIZE) / recentData.length * 100).toFixed(1);
      console.log(`📈 진행률: ${progress}%`);
    }
    
    // 5. 결과 요약
    console.log('\\n🎉 마이그레이션 완료!');
    console.log('========================');
    console.log(`✅ 성공: ${inserted.toLocaleString()}건`);
    console.log(`❌ 실패: ${errors.toLocaleString()}건`);
    console.log(`📊 전체: ${recentData.length.toLocaleString()}건`);
    
    // 6. 데이터 검증
    console.log('\\n🔍 데이터 검증 중...');
    
    const { count, error: countError } = await supabase1
      .from('molit_real_estate_transactions')
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log(`✅ Primary DB 최종 데이터: ${count.toLocaleString()}건`);
    }
    
    // 샘플 데이터 확인
    const { data: sampleData } = await supabase1
      .from('molit_real_estate_transactions')
      .select('*')
      .order('deal_year', { ascending: false })
      .limit(3);
    
    if (sampleData && sampleData.length > 0) {
      console.log('\\n💡 샘플 데이터:');
      sampleData.forEach((sample, index) => {
        console.log(`\\n--- 샘플 ${index + 1} ---`);
        console.log('아파트명:', sample.apartment_name);
        console.log('지역:', sample.region_name);
        console.log('거래유형:', sample.deal_type);
        console.log('💰 거래금액:', sample.deal_amount);
        console.log('📍 도로명:', sample.road_name);
        console.log('📍 법정동:', sample.legal_dong);
        console.log('📍 지번:', sample.jibun);
        console.log('🗺️  좌표:', sample.longitude, sample.latitude);
        console.log('거래일:', `${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
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
  migrateToSupabase();
}

module.exports = { migrateToSupabase };