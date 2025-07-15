const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('real_estate_crawling.db');

console.log('📊 크롤링 데이터를 마커용 JSON으로 변환 중...\n');

// 현재 크롤링된 모든 데이터 가져오기
db.all('SELECT * FROM dong_apartments WHERE latitude IS NOT NULL AND longitude IS NOT NULL', (err, rows) => {
  if (err) {
    console.error('데이터 조회 오류:', err);
    return;
  }
  
  console.log(`📊 지도 마커용 데이터: ${rows.length}개 아파트`);
  
  // 마커 데이터 생성
  const markers = rows.map(apt => ({
    lat: apt.latitude,
    lng: apt.longitude,
    name: apt.complex_name,
    address: apt.address_road || apt.address_jibun || `${apt.city} ${apt.gu} ${apt.dong}`,
    city: apt.city,
    gu: apt.gu,
    dong: apt.dong,
    constructionYear: apt.construction_year,
    totalUnits: apt.total_units,
    dealPrice: apt.deal_min_price ? `${Math.round(apt.deal_min_price/10000)}억` : null,
    leasePrice: apt.lease_min_price ? `${Math.round(apt.lease_min_price/10000)}억` : null,
    rentPrice: apt.rent_min_price ? `${Math.round(apt.rent_min_price/10000)}억` : null,
    tradeTypes: apt.trade_types,
    dealCount: apt.deal_count || 0,
    leaseCount: apt.lease_count || 0,
    rentCount: apt.rent_count || 0,
    minArea: apt.min_area,
    maxArea: apt.max_area
  }));
  
  // 지역별 통계
  const cityStats = {};
  markers.forEach(marker => {
    const key = `${marker.city} ${marker.gu}`;
    if (!cityStats[key]) {
      cityStats[key] = { count: 0, dealCount: 0, leaseCount: 0, rentCount: 0 };
    }
    cityStats[key].count++;
    cityStats[key].dealCount += marker.dealCount;
    cityStats[key].leaseCount += marker.leaseCount;
    cityStats[key].rentCount += marker.rentCount;
  });
  
  console.log('\n📍 지역별 마커 분포:');
  Object.entries(cityStats).forEach(([region, stats]) => {
    console.log(`  ${region}: ${stats.count}개 (매매:${stats.dealCount}, 전세:${stats.leaseCount}, 월세:${stats.rentCount})`);
  });
  
  // 마커 데이터를 JSON 파일로 저장
  fs.writeFileSync('crawled_markers_data.json', JSON.stringify(markers, null, 2));
  console.log('\n✅ 마커 데이터 저장 완료: crawled_markers_data.json');
  
  // 전체 통계
  const totalDeal = markers.reduce((sum, m) => sum + m.dealCount, 0);
  const totalLease = markers.reduce((sum, m) => sum + m.leaseCount, 0);
  const totalRent = markers.reduce((sum, m) => sum + m.rentCount, 0);
  
  console.log(`\n💰 전체 거래 통계:`);
  console.log(`  총 아파트 단지: ${markers.length}개`);
  console.log(`  매매 매물: ${totalDeal}개`);
  console.log(`  전세 매물: ${totalLease}개`);
  console.log(`  월세 매물: ${totalRent}개`);
  
  db.close();
});