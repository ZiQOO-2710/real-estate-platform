const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('dong_level_apartments.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('🔍 동단위 크롤링 진행 상황 확인\n');
  
  // 전체 통계
  db.get("SELECT COUNT(*) as total FROM dong_apartments", (err, row) => {
    if (err) {
      console.error('쿼리 오류:', err.message);
      return;
    }
    
    console.log(`📊 현재까지 수집된 아파트: ${row.total}개\n`);
    
    // 동별 진행 상황
    db.all(`
      SELECT dong, COUNT(*) as count,
             COUNT(CASE WHEN deal_min_price IS NOT NULL THEN 1 END) as deal_count,
             COUNT(CASE WHEN lease_min_price IS NOT NULL THEN 1 END) as lease_count,
             COUNT(CASE WHEN rent_min_price IS NOT NULL THEN 1 END) as rent_count
      FROM dong_apartments 
      GROUP BY dong 
      ORDER BY dong
    `, (err, rows) => {
      if (err) {
        console.error('쿼리 오류:', err.message);
        return;
      }
      
      console.log('📍 동별 수집 현황:');
      let totalBuildings = 0;
      rows.forEach(row => {
        console.log(`  ${row.dong.padEnd(12)}: ${row.count.toString().padStart(3)}개 (매매:${row.deal_count}, 전세:${row.lease_count}, 월세:${row.rent_count})`);
        totalBuildings += row.count;
      });
      
      console.log(`\n✅ 수집 완료된 동: ${rows.length}개`);
      console.log(`🏢 총 아파트 단지: ${totalBuildings}개`);
      
      // 크롤링 진행 상황
      db.all(`
        SELECT dong, trade_type, status, apartment_count,
               datetime(crawl_start_time, 'localtime') as start_time,
               datetime(crawl_end_time, 'localtime') as end_time
        FROM crawling_progress 
        ORDER BY dong, trade_type
      `, (err, progress) => {
        if (err) {
          console.error('진행상황 쿼리 오류:', err.message);
          return;
        }
        
        console.log('\n⚙️ 크롤링 진행 로그:');
        progress.forEach(p => {
          const status = p.status === 'completed' ? '✅' : 
                        p.status === 'failed' ? '❌' : '🔄';
          const endTime = p.end_time || '진행중';
          console.log(`  ${status} ${p.dong} ${p.trade_type}: ${p.apartment_count || 0}개 (${endTime})`);
        });
        
        // 샘플 데이터 확인
        db.all(`
          SELECT complex_name, dong, trade_types, deal_min_price, lease_min_price, rent_min_price
          FROM dong_apartments 
          ORDER BY dong, complex_name
          LIMIT 10
        `, (err, samples) => {
          if (err) {
            console.error('샘플 데이터 쿼리 오류:', err.message);
            return;
          }
          
          console.log('\n🏠 샘플 데이터:');
          samples.forEach((apt, i) => {
            const dealPrice = apt.deal_min_price ? `매매:${Math.round(apt.deal_min_price/10000)}억` : '';
            const leasePrice = apt.lease_min_price ? `전세:${Math.round(apt.lease_min_price/10000)}억` : '';
            const rentPrice = apt.rent_min_price ? `월세:${Math.round(apt.rent_min_price/10000)}억` : '';
            const prices = [dealPrice, leasePrice, rentPrice].filter(p => p).join(', ');
            
            console.log(`  ${i+1}. ${apt.complex_name} (${apt.dong})`);
            console.log(`     거래타입: ${apt.trade_types || '정보없음'}`);
            console.log(`     가격: ${prices || '정보없음'}\n`);
          });
          
          db.close();
        });
      });
    });
  });
});