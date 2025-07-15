const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('real_estate_crawling.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('🔍 크롤링된 URL 조건 분석\n');
  
  // 소스 URL 샘플 확인
  db.all("SELECT complex_name, source_url FROM apartment_complexes LIMIT 5", (err, rows) => {
    if (err) {
      console.error('쿼리 오류:', err.message);
      return;
    }
    
    console.log('📋 샘플 URL들:');
    rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.complex_name}`);
      console.log(`   URL: ${row.source_url}\n`);
    });
    
    // URL 파라미터 분석
    if (rows.length > 0) {
      const sampleUrl = rows[0].source_url;
      console.log('🔍 URL 파라미터 분석:');
      
      if (sampleUrl.includes('?')) {
        const params = new URLSearchParams(sampleUrl.split('?')[1]);
        console.log('현재 설정된 파라미터들:');
        for (const [key, value] of params) {
          console.log(`  - ${key}: ${value}`);
        }
      } else {
        console.log('파라미터가 없는 기본 URL입니다.');
      }
    }
    
    db.close();
  });
});