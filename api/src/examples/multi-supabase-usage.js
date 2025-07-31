/**
 * 다중 Supabase 프로젝트 사용 예시
 * 두 개의 Supabase 프로젝트를 동시에 사용하는 방법
 */

const { 
  supabase1, 
  supabase2, 
  getSupabaseClient, 
  executeQuery, 
  executeRawQuery,
  getRow 
} = require('../config/supabase');

// 사용 방법 1: 직접 클라이언트 사용
async function directClientUsage() {
  console.log('=== 직접 클라이언트 사용 ===');
  
  try {
    // 첫 번째 프로젝트에서 데이터 조회
    const { data: data1, error: error1 } = await supabase1
      .from('your_table_name')
      .select('*')
      .limit(5);
    
    console.log('📍 첫 번째 프로젝트 데이터:', data1?.length || 0, '건');
    
    // 두 번째 프로젝트에서 데이터 조회
    if (supabase2) {
      const { data: data2, error: error2 } = await supabase2
        .from('your_table_name')
        .select('*')
        .limit(5);
      
      console.log('📍 두 번째 프로젝트 데이터:', data2?.length || 0, '건');
    }
    
  } catch (error) {
    console.error('❌ 직접 클라이언트 사용 오류:', error.message);
  }
}

// 사용 방법 2: getSupabaseClient 함수 사용
async function dynamicClientUsage() {
  console.log('\n=== 동적 클라이언트 선택 ===');
  
  try {
    // 첫 번째 프로젝트 클라이언트
    const client1 = getSupabaseClient('primary');
    const { data: data1 } = await client1
      .from('your_table_name')
      .select('*')
      .limit(3);
    
    console.log('📍 Primary 프로젝트:', data1?.length || 0, '건');
    
    // 두 번째 프로젝트 클라이언트
    const client2 = getSupabaseClient('secondary');
    const { data: data2 } = await client2
      .from('your_table_name')
      .select('*')
      .limit(3);
    
    console.log('📍 Secondary 프로젝트:', data2?.length || 0, '건');
    
  } catch (error) {
    console.error('❌ 동적 클라이언트 선택 오류:', error.message);
  }
}

// 사용 방법 3: executeQuery 함수 사용 (추천)
async function executeQueryUsage() {
  console.log('\n=== executeQuery 함수 사용 ===');
  
  try {
    // 첫 번째 프로젝트에서 쿼리
    const data1 = await executeQuery('your_table_name', {
      select: '*',
      limit: 3
    }, 'primary');
    
    console.log('📍 Primary executeQuery:', data1?.length || 0, '건');
    
    // 두 번째 프로젝트에서 쿼리
    const data2 = await executeQuery('your_table_name', {
      select: '*',
      limit: 3
    }, 'secondary');
    
    console.log('📍 Secondary executeQuery:', data2?.length || 0, '건');
    
  } catch (error) {
    console.error('❌ executeQuery 사용 오류:', error.message);
  }
}

// 사용 방법 4: 단일 행 조회
async function getRowUsage() {
  console.log('\n=== getRow 함수 사용 ===');
  
  try {
    // 첫 번째 프로젝트에서 단일 행 조회
    const row1 = await getRow('your_table_name', {
      filters: [{ type: 'eq', column: 'id', value: 1 }]
    }, 'primary');
    
    console.log('📍 Primary getRow:', row1 ? 'Found' : 'Not found');
    
    // 두 번째 프로젝트에서 단일 행 조회
    const row2 = await getRow('your_table_name', {
      filters: [{ type: 'eq', column: 'id', value: 1 }]
    }, 'secondary');
    
    console.log('📍 Secondary getRow:', row2 ? 'Found' : 'Not found');
    
  } catch (error) {
    console.error('❌ getRow 사용 오류:', error.message);
  }
}

// 실행 함수
async function runExamples() {
  console.log('🚀 다중 Supabase 프로젝트 사용 예시 실행');
  console.log('=====================================\n');
  
  await directClientUsage();
  await dynamicClientUsage();
  await executeQueryUsage();
  await getRowUsage();
  
  console.log('\n✅ 모든 예시 실행 완료!');
}

// 예시 실행 (이 파일을 직접 실행할 때만)
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  directClientUsage,
  dynamicClientUsage,
  executeQueryUsage,
  getRowUsage,
  runExamples
};