const { supabase1 } = require('./api/src/config/supabase.js');

async function checkAllTables() {
  try {
    console.log('🔍 모든 테이블 확인 - 실거래가 데이터 찾기');
    console.log('=========================================');
    
    // 더 많은 테이블명 시도
    const tableNames = [
      'apartment_transactions',
      'molit_transactions', 
      'real_estate_transactions',
      'apt_trade',
      'apartment_trade_data',
      'molit_data',
      'transaction_history',
      'property_sales',
      'real_estate_deals',
      'housing_transactions',
      'apt_sales_data',
      'building_transactions',
      'estate_trades'
    ];
    
    for (const tableName of tableNames) {
      try {
        console.log(`\n🔍 테이블 확인: ${tableName}`);
        
        const { data, error } = await supabase1
          .from(tableName)
          .select('*')
          .limit(2);
        
        if (!error && data && data.length > 0) {
          console.log(`✅ 테이블 발견: ${tableName} (${data.length}건 샘플)`);
          
          // 첫 번째 데이터 분석
          const first = data[0];
          const columns = Object.keys(first);
          console.log(`   📋 총 컬럼 수: ${columns.length}개`);
          
          // null이 아닌 컬럼 확인
          const nonNullColumns = columns.filter(col => first[col] !== null);
          console.log(`   ✅ 데이터가 있는 컬럼: ${nonNullColumns.length}개`);
          
          if (nonNullColumns.length > 0) {
            console.log(`   📊 데이터가 있는 컬럼들:`, nonNullColumns.join(', '));
            
            // 금액 관련 컬럼 찾기
            const priceColumns = nonNullColumns.filter(col => 
              col.includes('price') || 
              col.includes('amount') || 
              col.includes('cost') || 
              col.includes('fee') ||
              col.includes('거래금액') ||
              col.includes('가격') ||
              col.includes('금액')
            );
            
            if (priceColumns.length > 0) {
              console.log(`   💰 금액 컬럼 (데이터 있음):`, priceColumns);
              priceColumns.forEach(col => {
                console.log(`      ${col}: ${first[col]}`);
              });
            }
            
            // 날짜 관련 컬럼 찾기  
            const dateColumns = nonNullColumns.filter(col =>
              col.includes('date') ||
              col.includes('year') ||
              col.includes('month') ||
              col.includes('day') ||
              col.includes('거래일') ||
              col.includes('일자')
            );
            
            if (dateColumns.length > 0) {
              console.log(`   📅 날짜 컬럼 (데이터 있음):`, dateColumns);
            }
          } else {
            console.log(`   ❌ 모든 컬럼이 null - 빈 테이블`);
          }
        }
        
      } catch (e) {
        // 테이블이 없으면 무시
      }
    }
    
  } catch (error) {
    console.error('❌ 전체 확인 오류:', error.message);
  }
}

checkAllTables();