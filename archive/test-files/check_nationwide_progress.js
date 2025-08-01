const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('real_estate_crawling.db', (err) => {
  if (err) {
    console.error('데이터베이스 연결 오류:', err.message);
    return;
  }
  
  console.log('🔍 전국 동단위 크롤링 실시간 진행 상황\n');
  
  // 전체 통계
  db.get("SELECT COUNT(*) as total FROM dong_apartments", (err, row) => {
    if (err) {
      console.error('쿼리 오류:', err.message);
      return;
    }
    
    console.log(`📊 현재까지 수집된 아파트: ${row.total}개\n`);
    
    // 지역별 진행 상황
    db.all(`
      SELECT city, gu, dong, COUNT(*) as count,
             COUNT(CASE WHEN deal_min_price IS NOT NULL THEN 1 END) as deal_count,
             COUNT(CASE WHEN lease_min_price IS NOT NULL THEN 1 END) as lease_count,
             COUNT(CASE WHEN rent_min_price IS NOT NULL THEN 1 END) as rent_count
      FROM dong_apartments 
      GROUP BY city, gu, dong 
      ORDER BY city, gu, dong
    `, (err, rows) => {
      if (err) {
        console.error('쿼리 오류:', err.message);
        return;
      }
      
      console.log('📍 지역별 수집 현황:');
      let totalBuildings = 0;
      let currentCity = '';
      let currentGu = '';
      
      rows.forEach(row => {
        if (row.city !== currentCity) {
          console.log(`\n🏙️ ${row.city}:`);
          currentCity = row.city;
          currentGu = '';
        }
        if (row.gu !== currentGu) {
          console.log(`  📍 ${row.gu}:`);
          currentGu = row.gu;
        }
        
        console.log(`    ${row.dong.padEnd(12)}: ${row.count.toString().padStart(3)}개 (매매:${row.deal_count}, 전세:${row.lease_count}, 월세:${row.rent_count})`);
        totalBuildings += row.count;
      });
      
      console.log(`\n✅ 수집 완료된 동: ${rows.length}개`);
      console.log(`🏢 총 아파트 단지: ${totalBuildings}개`);
      
      // 최근 크롤링 진행 상황
      db.all(`
        SELECT city, gu, dong, trade_type, status, apartment_count,
               datetime(crawl_start_time, 'localtime') as start_time,
               datetime(crawl_end_time, 'localtime') as end_time
        FROM crawling_progress 
        WHERE crawl_start_time >= datetime('now', '-1 hour')
        ORDER BY crawl_start_time DESC
        LIMIT 20
      `, (err, progress) => {
        if (err) {
          console.error('진행상황 쿼리 오류:', err.message);
          return;
        }
        
        console.log('\n⚙️ 최근 1시간 크롤링 로그:');
        progress.forEach(p => {
          const status = p.status === 'completed' ? '✅' : 
                        p.status === 'failed' ? '❌' : 
                        p.status === 'processing' ? '🔄' : '⏳';
          const endTime = p.end_time || '진행중';
          console.log(`  ${status} ${p.city} ${p.gu} ${p.dong} ${p.trade_type}: ${p.apartment_count || 0}개 (${p.start_time})`);
        });
        
        // 거래타입별 통계
        db.get(`
          SELECT 
            COUNT(CASE WHEN deal_min_price IS NOT NULL THEN 1 END) as deal_count,
            COUNT(CASE WHEN lease_min_price IS NOT NULL THEN 1 END) as lease_count,
            COUNT(CASE WHEN rent_min_price IS NOT NULL THEN 1 END) as rent_count,
            AVG(CASE WHEN deal_min_price IS NOT NULL THEN deal_min_price END) as avg_deal_price,
            AVG(CASE WHEN lease_min_price IS NOT NULL THEN lease_min_price END) as avg_lease_price
          FROM dong_apartments
        `, (err, stats) => {
          if (err) {
            console.error('통계 쿼리 오류:', err.message);
            return;
          }
          
          console.log('\n💰 거래 타입별 통계:');
          console.log(`  매매: ${stats.deal_count}개 (평균 ${Math.round((stats.avg_deal_price || 0)/10000)}억)`);
          console.log(`  전세: ${stats.lease_count}개 (평균 ${Math.round((stats.avg_lease_price || 0)/10000)}억)`);
          console.log(`  월세: ${stats.rent_count}개`);
          
          // 샘플 최신 데이터
          db.all(`
            SELECT complex_name, city, gu, dong, trade_types, 
                   deal_min_price, lease_min_price, rent_min_price,
                   construction_year, total_units
            FROM dong_apartments 
            ORDER BY id DESC
            LIMIT 5
          `, (err, samples) => {
            if (err) {
              console.error('샘플 데이터 쿼리 오류:', err.message);
              return;
            }
            
            console.log('\n🏠 최근 수집된 아파트:');
            samples.forEach((apt, i) => {
              const dealPrice = apt.deal_min_price ? `매매:${Math.round(apt.deal_min_price/10000)}억` : '';
              const leasePrice = apt.lease_min_price ? `전세:${Math.round(apt.lease_min_price/10000)}억` : '';
              const rentPrice = apt.rent_min_price ? `월세:${Math.round(apt.rent_min_price/10000)}억` : '';
              const prices = [dealPrice, leasePrice, rentPrice].filter(p => p).join(', ');
              
              console.log(`  ${i+1}. ${apt.complex_name} (${apt.city} ${apt.gu} ${apt.dong})`);
              console.log(`     거래: ${apt.trade_types || '정보없음'} | ${prices || '가격정보없음'}`);
              console.log(`     ${apt.construction_year || '?'}년 건축, ${apt.total_units || '?'}세대\n`);
            });
            
            db.close();
          });
        });
      });
    });
  });
});