const { supabase1 } = require('./api/src/config/supabase.js');

async function analyzeTransactionHistory() {
  try {
    console.log('🔍 transaction_history 테이블 상세 분석');
    console.log('======================================');
    
    // 전체 데이터 개수
    const { count, error: countError } = await supabase1
      .from('transaction_history')
      .select('*', { count: 'exact', head: true });
    
    if (!countError) {
      console.log('📊 전체 거래 데이터:', count.toLocaleString(), '건');
    }
    
    // 샘플 데이터 상세 확인 (모든 컬럼)
    const { data: samples, error: sampleError } = await supabase1
      .from('transaction_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (!sampleError && samples) {
      console.log('\\n💡 최신 거래 데이터 샘플 (5건):');
      samples.forEach((sample, index) => {
        console.log(`\\n--- 거래 ${index + 1} ---`);
        console.log('ID:', sample.id);
        console.log('Complex ID:', sample.complex_id);
        console.log('거래 유형:', sample.transaction_type);
        console.log('💰 거래금액:', sample.price_amount?.toLocaleString() || sample.price_amount);
        console.log('면적(㎡):', sample.area_sqm);
        console.log('면적(평):', sample.area_pyeong);
        console.log('생성일:', sample.created_at);
        console.log('전체 컬럼:', Object.keys(sample));
      });
    }
    
    // 최근 1년 데이터 확인
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    const { data: recentData, error: recentError } = await supabase1
      .from('transaction_history')
      .select('*')
      .gte('created_at', oneYearAgo.toISOString())
      .order('created_at', { ascending: false });
    
    if (!recentError && recentData) {
      console.log('\\n📅 최근 1년 거래 데이터:', recentData.length.toLocaleString(), '건');
      
      if (recentData.length > 0) {
        // 금액 통계
        const validPrices = recentData
          .filter(item => item.price_amount && item.price_amount > 0)
          .map(item => item.price_amount)
          .sort((a, b) => b - a);
        
        if (validPrices.length > 0) {
          console.log('\\n💰 최근 1년 거래금액 통계:');
          console.log('  최고가:', validPrices[0]?.toLocaleString());
          console.log('  최저가:', validPrices[validPrices.length - 1]?.toLocaleString()); 
          console.log('  평균가:', Math.round(validPrices.reduce((a, b) => a + b, 0) / validPrices.length)?.toLocaleString());
          console.log('  유효 거래 수:', validPrices.length.toLocaleString());
        }
        
        // 거래 유형별 분포
        const typeCount = {};
        recentData.forEach(item => {
          if (item.transaction_type) {
            typeCount[item.transaction_type] = (typeCount[item.transaction_type] || 0) + 1;
          }
        });
        
        console.log('\\n📊 거래 유형별 분포 (최근 1년):');
        Object.entries(typeCount).forEach(([type, count]) => {
          console.log(`  ${type}: ${count.toLocaleString()}건`);
        });
      }
    }
    
    // 면적별 분포
    const { data: areaData, error: areaError } = await supabase1
      .from('transaction_history')
      .select('area_sqm, area_pyeong')
      .not('area_sqm', 'is', null)
      .limit(1000);
    
    if (!areaError && areaData) {
      const avgAreaSqm = areaData.reduce((sum, item) => sum + (item.area_sqm || 0), 0) / areaData.length;
      const avgAreaPyeong = areaData.reduce((sum, item) => sum + (item.area_pyeong || 0), 0) / areaData.length;
      
      console.log('\\n📐 면적 통계 (샘플 1000건):');
      console.log(`  평균 면적: ${avgAreaSqm.toFixed(1)}㎡ (${avgAreaPyeong.toFixed(1)}평)`);
    }
    
  } catch (error) {
    console.error('❌ transaction_history 분석 오류:', error.message);
  }
}

analyzeTransactionHistory();