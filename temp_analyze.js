const { supabase1 } = require('./api/src/config/supabase.js');

async function analyzeTransactionTable() {
  try {
    console.log('🔍 apartment_transactions 테이블 분석');
    console.log('=====================================');
    
    // 전체 데이터 개수 확인
    const { count, error: countError } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log('📊 전체 데이터 개수:', count.toLocaleString(), '건');
    }
    
    // 최근 1년 데이터 개수 확인
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    const { count: yearCount, error: yearError } = await supabase1
      .from('apartment_transactions')
      .select('*', { count: 'exact', head: true })
      .gte('deal_year', lastYear);
    
    if (!yearError) {
      console.log('📅 최근 1년 데이터:', yearCount.toLocaleString(), '건');
    }
    
    // 샘플 데이터 확인 (모든 컬럼 포함)
    const { data: samples, error: sampleError } = await supabase1
      .from('apartment_transactions')
      .select('*')
      .order('deal_year', { ascending: false })
      .order('deal_month', { ascending: false })
      .limit(3);
    
    if (!sampleError && samples) {
      console.log('\n💡 최신 샘플 데이터 (3건):');
      samples.forEach((sample, index) => {
        console.log(`\n--- 샘플 ${index + 1} ---`);
        console.log('아파트명:', sample.apartment_name);
        console.log('지역:', sample.region_name);
        console.log('거래일:', `${sample.deal_year}-${sample.deal_month}-${sample.deal_day}`);
        console.log('💰 거래금액:', sample.deal_amount);
        console.log('면적:', sample.area);
        console.log('층수:', sample.floor);
        console.log('좌표:', sample.longitude, sample.latitude);
        console.log('전체 컬럼:', Object.keys(sample).join(', '));
      });
    }
    
    // 거래금액 통계
    const { data: priceStats, error: priceError } = await supabase1
      .from('apartment_transactions')
      .select('deal_amount')
      .not('deal_amount', 'is', null)
      .order('deal_amount', { ascending: false })
      .limit(10);
    
    if (!priceError && priceStats) {
      console.log('\n💰 최고 거래금액 TOP 10:');
      priceStats.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.deal_amount}`);
      });
    }
    
    // 연도별 데이터 분포
    const { data: yearlyData, error: yearlyError } = await supabase1
      .from('apartment_transactions')
      .select('deal_year')
      .order('deal_year', { ascending: false });
    
    if (!yearlyError && yearlyData) {
      const yearCount = {};
      yearlyData.forEach(item => {
        yearCount[item.deal_year] = (yearCount[item.deal_year] || 0) + 1;
      });
      
      console.log('\n📊 연도별 데이터 분포:');
      Object.entries(yearCount)
        .sort(([a], [b]) => b - a)
        .slice(0, 5)
        .forEach(([year, count]) => {
          console.log(`  ${year}년: ${count.toLocaleString()}건`);
        });
    }
    
  } catch (error) {
    console.error('❌ 분석 오류:', error.message);
  }
}

analyzeTransactionTable();