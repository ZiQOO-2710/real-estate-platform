/**
 * 97만건 국토부 실거래가 데이터 컬럼 구조 분석
 */

const sqlite3 = require('sqlite3').verbose();
const SOURCE_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db';

async function checkMolitColumns() {
  console.log('🔍 97만건 국토부 실거래가 데이터 컬럼 구조 분석');
  console.log('==============================================');
  
  try {
    const db = new sqlite3.Database(SOURCE_DB_PATH);
    
    // 1. 테이블 스키마 확인
    console.log('📋 테이블 스키마:');
    const schemaQuery = 'PRAGMA table_info(apartment_transactions)';
    
    const columns = await new Promise((resolve, reject) => {
      db.all(schemaQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n📊 기본 컬럼 (25개):');
    columns.forEach((col, index) => {
      console.log(`${index + 1}. ${col.name} (${col.type})`);
    });
    
    // 2. 샘플 데이터로 실제 컬럼 확인
    console.log('\n🔍 샘플 데이터 분석 (JSON 필드 포함):');
    
    const sampleQuery = `
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
      WHERE api_data IS NOT NULL
      LIMIT 1
    `;
    
    const sampleData = await new Promise((resolve, reject) => {
      db.get(sampleQuery, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    
    if (sampleData && sampleData.api_data) {
      const apiData = JSON.parse(sampleData.api_data);
      console.log('\n💡 JSON api_data 필드 내부 구조:');
      Object.keys(apiData).forEach((key, index) => {
        console.log(`${index + 1}. ${key}: ${apiData[key] || '값 없음'}`);
      });
      
      console.log('\n📝 주요 필드 매핑:');
      console.log(`• 아파트명: aptNm = "${apiData.aptNm || '없음'}"`);
      console.log(`• 거래금액: dealAmount = "${apiData.dealAmount || '없음'}"`);
      console.log(`• 거래년도: dealYear = "${apiData.dealYear || '없음'}"`);
      console.log(`• 거래월: dealMonth = "${apiData.dealMonth || '없음'}"`);
      console.log(`• 거래일: dealDay = "${apiData.dealDay || '없음'}"`);
      console.log(`• 전용면적: excluUseAr = "${apiData.excluUseAr || '없음'}"`);
      console.log(`• 층수: floor = "${apiData.floor || '없음'}"`);
      console.log(`• 건축년도: buildYear = "${apiData.buildYear || '없음'}"`);
      console.log(`• 도로명: roadNm = "${apiData.roadNm || '없음'}"`);
      console.log(`• 법정동: umdNm = "${apiData.umdNm || '없음'}"`);
      console.log(`• 지번: jibun = "${apiData.jibun || '없음'}"`);
    }
    
    // 3. 전체 데이터 개수 확인
    const countQuery = 'SELECT COUNT(*) as total FROM apartment_transactions';
    const totalCount = await new Promise((resolve, reject) => {
      db.get(countQuery, (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    });
    
    console.log('\n📊 데이터 현황:');
    console.log(`• 총 데이터: ${totalCount.toLocaleString()}건`);
    
    // 4. 최근 데이터 개수
    const recentQuery = `
      SELECT COUNT(*) as recent_count
      FROM apartment_transactions 
      WHERE json_extract(api_data, '$.dealYear') IN ('2024', '2025')
    `;
    
    const recentCount = await new Promise((resolve, reject) => {
      db.get(recentQuery, (err, row) => {
        if (err) reject(err);
        else resolve(row.recent_count);
      });
    });
    
    console.log(`• 2024-2025년 데이터: ${recentCount.toLocaleString()}건`);
    
    // 5. API 데이터의 모든 가능한 키 확인
    console.log('\n🗂️ API 데이터 전체 키 목록:');
    const allKeysQuery = `
      SELECT DISTINCT json_each.key
      FROM apartment_transactions, json_each(api_data)
      WHERE api_data IS NOT NULL
      LIMIT 50
    `;
    
    const allKeys = await new Promise((resolve, reject) => {
      db.all(allKeysQuery, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    if (allKeys && allKeys.length > 0) {
      const uniqueKeys = [...new Set(allKeys.map(row => row.key))].sort();
      uniqueKeys.forEach((key, index) => {
        console.log(`${index + 1}. ${key}`);
      });
    }
    
    db.close();
    
  } catch (error) {
    console.error('❌ 오류:', error);
  }
}

checkMolitColumns();