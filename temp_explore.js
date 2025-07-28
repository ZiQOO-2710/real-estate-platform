const { supabase1 } = require('./api/src/config/supabase.js');

async function exploreTables() {
  try {
    console.log('🔍 Primary DB 테이블 탐색');
    console.log('=========================');
    
    // 일반적인 실거래가 테이블명들을 시도
    const tableNames = [
      'apt_transactions',
      'real_estate_transactions', 
      'molit_data',
      'apartment_transactions',
      'transaction_data',
      'real_estate_data',
      'apt_trade_data',
      'molit_apt_trade',
      'apartment_prices',
      'property_transactions',
      'apartments',
      'complexes',
      'listings'
    ];
    
    for (const tableName of tableNames) {
      try {
        const { data, error } = await supabase1
          .from(tableName)
          .select('*')
          .limit(1);
        
        if (!error && data) {
          console.log('✅ 테이블 발견:', tableName);
          if (data[0]) {
            console.log('   - 컬럼들:', Object.keys(data[0]));
            
            // 금액 관련 컬럼 찾기
            const priceColumns = Object.keys(data[0]).filter(col => 
              col.includes('price') || 
              col.includes('amount') || 
              col.includes('cost') || 
              col.includes('fee') ||
              col.includes('거래금액') ||
              col.includes('가격')
            );
            
            if (priceColumns.length > 0) {
              console.log('   💰 금액 관련 컬럼:', priceColumns);
            }
          }
        }
      } catch (e) {
        // 테이블이 없으면 무시
      }
    }
    
  } catch (error) {
    console.error('❌ 탐색 오류:', error.message);
  }
}

exploreTables();