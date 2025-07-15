const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('real_estate_crawling.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('🔍 강남구 아파트 데이터 분석\n');
  
  // 강남구 아파트 수 확인
  db.get(`
    SELECT COUNT(*) as count 
    FROM apartment_complexes 
    WHERE city = '서울' AND gu = '강남구'
  `, (err, row) => {
    if (err) {
      console.error('쿼리 오류:', err.message);
      return;
    }
    
    console.log(`📊 현재 크롤링된 강남구 아파트: ${row.count}개`);
    
    // 강남구 아파트 리스트 확인
    db.all(`
      SELECT complex_name, address_road, construction_year, total_units, last_transaction_price
      FROM apartment_complexes 
      WHERE city = '서울' AND gu = '강남구'
      ORDER BY complex_name
      LIMIT 20
    `, (err, rows) => {
      if (err) {
        console.error('쿼리 오류:', err.message);
        return;
      }
      
      console.log('\n📋 강남구 아파트 리스트 (처음 20개):');
      rows.forEach((row, i) => {
        const price = row.last_transaction_price ? 
          Math.round(row.last_transaction_price / 10000) + '억' : '정보없음';
        console.log(`${i+1}. ${row.complex_name}`);
        console.log(`   주소: ${row.address_road || '정보없음'}`);
        console.log(`   건축: ${row.construction_year || '?'}년, 세대: ${row.total_units || '?'}개, 가격: ${price}\n`);
      });
      
      // 실제 강남구에 있어야 할 유명 아파트들 확인
      const famousApartments = [
        '래미안퍼스티지', '타워팰리스', '아크로타워', '포스코더샵',
        '개포한신', '대치삼성', '은마아파트', '압구정현대'
      ];
      
      console.log('🏢 유명 아파트 확인:');
      
      let checkCount = 0;
      famousApartments.forEach(aptName => {
        db.get(`
          SELECT complex_name 
          FROM apartment_complexes 
          WHERE city = '서울' AND gu = '강남구' AND complex_name LIKE '%${aptName}%'
        `, (err, result) => {
          checkCount++;
          if (result) {
            console.log(`✅ ${aptName}: 발견됨 (${result.complex_name})`);
          } else {
            console.log(`❌ ${aptName}: 없음`);
          }
          
          if (checkCount === famousApartments.length) {
            console.log('\n💡 분석 결과:');
            console.log('- 강남구에는 수백 개의 아파트 단지가 있어야 합니다');
            console.log('- 현재 크롤링된 데이터가 일부만 포함되었을 가능성 높음');
            console.log('- API 호출 조건이나 페이지네이션 문제일 수 있음');
            db.close();
          }
        });
      });
    });
  });
});