const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('real_estate_crawling.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('🔍 데이터베이스 테이블 구조 확인\n');
  
  // 테이블 목록 확인
  db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
      console.error('테이블 조회 오류:', err.message);
      return;
    }
    
    console.log('📋 테이블 목록:');
    tables.forEach(table => {
      console.log(`  - ${table.name}`);
    });
    
    // 각 테이블의 스키마 확인
    if (tables.length > 0) {
      console.log('\n🏗️ 테이블 스키마:');
      
      let processedTables = 0;
      tables.forEach(table => {
        db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
          if (err) {
            console.error(`${table.name} 스키마 조회 오류:`, err.message);
          } else {
            console.log(`\n📊 ${table.name}:`);
            columns.forEach(col => {
              console.log(`  ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
            });
            
            // 데이터 개수 확인
            db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, result) => {
              if (err) {
                console.error(`${table.name} 데이터 개수 조회 오류:`, err.message);
              } else {
                console.log(`  📊 데이터 개수: ${result.count}개`);
              }
              
              processedTables++;
              if (processedTables === tables.length) {
                db.close();
              }
            });
          }
        });
      });
    } else {
      console.log('테이블이 없습니다.');
      db.close();
    }
  });
});