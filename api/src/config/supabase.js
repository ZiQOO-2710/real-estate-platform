/**
 * Supabase 클라이언트 설정
 * PostGIS 지원 PostgreSQL 데이터베이스 연결
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 첫 번째 Supabase 프로젝트 (기존 - Primary)
const supabaseUrl1 = process.env.SUPABASE_URL;
const supabaseKey1 = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

// 두 번째 Supabase 프로젝트 (새 프로젝트 - Secondary)  
const supabaseUrl2 = process.env.SUPABASE_URL_2;
const supabaseKey2 = process.env.SUPABASE_ANON_KEY_2;

// 첫 번째 프로젝트 검증
if (!supabaseUrl1 || !supabaseKey1) {
  throw new Error('첫 번째 Supabase URL과 ANON KEY가 환경변수에 설정되지 않았습니다.');
}

// 두 번째 프로젝트 검증 (선택적)
if (supabaseUrl2 && !supabaseKey2) {
  console.warn('⚠️ 두 번째 Supabase URL은 있지만 ANON KEY가 없습니다.');
}

// 첫 번째 Supabase 클라이언트 생성 (기존)
const supabase1 = createClient(supabaseUrl1, supabaseKey1, {
  auth: {
    persistSession: false, // API 서버에서는 세션 유지 불필요
  },
  db: {
    schema: 'public'
  }
});

// 두 번째 Supabase 클라이언트 생성 (새 프로젝트)
let supabase2 = null;
if (supabaseUrl2 && supabaseKey2) {
  supabase2 = createClient(supabaseUrl2, supabaseKey2, {
    auth: {
      persistSession: false,
    },
    db: {
      schema: 'public'
    }
  });
  console.log('✅ 두 번째 Supabase 프로젝트 클라이언트 생성 완료:', supabaseUrl2);
}

// 기본 클라이언트는 첫 번째 프로젝트
const supabase = supabase1;

/**
 * Supabase 클라이언트 선택 함수
 * @param {string} project - 'primary' | 'secondary' | 1 | 2
 * @returns {Object} Supabase 클라이언트
 */
function getSupabaseClient(project = 'primary') {
  if (project === 'secondary' || project === 2) {
    if (!supabase2) {
      throw new Error('두 번째 Supabase 프로젝트가 설정되지 않았습니다.');
    }
    return supabase2;
  }
  return supabase1; // 기본값은 첫 번째 프로젝트
}

/**
 * PostGIS 지원 쿼리 실행 함수
 * Supabase 테이블 직접 조회 방식 사용
 * @param {string} tableName - 테이블 명
 * @param {Object} options - 쿼리 옵션
 * @param {string} project - 사용할 프로젝트 ('primary' | 'secondary')
 * @returns {Promise<Array>} 쿄리 결과
 */
async function executeQuery(tableName, options = {}, project = 'primary') {
  const client = getSupabaseClient(project);
  try {
    console.log(`🔍 Supabase 테이블 조회 (${project}):`, tableName);
    console.log('📊 쿼리 옵션:', options);
    
    const startTime = Date.now();
    
    let query = client.from(tableName).select(options.select || '*');
    
    // 필터 조건 적용
    if (options.filters) {
      options.filters.forEach(filter => {
        if (filter.type === 'eq') {
          query = query.eq(filter.column, filter.value);
        } else if (filter.type === 'gte') {
          query = query.gte(filter.column, filter.value);
        } else if (filter.type === 'lte') {
          query = query.lte(filter.column, filter.value);
        } else if (filter.type === 'like') {
          query = query.ilike(filter.column, filter.value);
        } else if (filter.type === 'in') {
          query = query.in(filter.column, filter.value);
        }
      });
    }
    
    // 정렬
    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending !== false });
    }
    
    // 제한
    if (options.limit) {
      query = query.limit(options.limit);
    }
    
    const { data, error } = await query;
    
    const executionTime = Date.now() - startTime;
    
    if (error) {
      console.error('❌ Supabase 쿼리 오류:', error);
      throw error;
    }
    
    console.log(`✅ Supabase 쿼리 완료 (${executionTime}ms): ${data?.length || 0}건`);
    return data || [];
    
  } catch (error) {
    console.error('💥 Supabase 쿼리 실행 실패:', error);
    throw error;
  }
}

/**
 * 원시 SQL 쿼리 실행 (PostGIS 함수 사용시)
 * @param {string} query - 원시 SQL 쿼리
 * @param {string} project - 사용할 프로젝트 ('primary' | 'secondary')
 * @returns {Promise<Array>} 쿼리 결과  
 */
async function executeRawQuery(query, project = 'primary') {
  const client = getSupabaseClient(project);
  try {
    console.log('🔍 Supabase 원시 쿼리 실행:', query.substring(0, 100) + '...');
    
    const startTime = Date.now();
    
    // RPC를 통한 원시 쿼리 실행
    const { data, error } = await client.rpc('execute_query', { query_text: query });
    
    const executionTime = Date.now() - startTime;
    
    if (error) {
      console.error('❌ Supabase 원시 쿼리 오류:', error);
      throw error;
    }
    
    console.log(`✅ Supabase 원시 쿼리 완료 (${executionTime}ms): ${data?.length || 0}건`);
    return data || [];
    
  } catch (error) {
    console.error('💥 Supabase 원시 쿼리 실행 실패:', error);
    throw error;
  }
}

/**
 * 단일 행 조회
 * @param {string} tableName - 테이블 명
 * @param {Object} options - 쿼리 옵션
 * @param {string} project - 사용할 프로젝트 ('primary' | 'secondary')
 * @returns {Promise<Object|null>} 단일 결과 또는 null
 */
async function getRow(tableName, options = {}, project = 'primary') {
  const results = await executeQuery(tableName, { ...options, limit: 1 }, project);
  return results.length > 0 ? results[0] : null;
}

/**
 * PostGIS 반경 검색 쿼리 빌더
 * @param {number} centerLat - 중심점 위도
 * @param {number} centerLng - 중심점 경도  
 * @param {number} radiusKm - 반경 (킬로미터)
 * @returns {string} PostGIS 거리 조건 문자열
 */
function buildRadiusCondition(centerLat, centerLng, radiusKm = 3) {
  return `ST_DWithin(
    coordinates::geography,
    ST_SetSRID(ST_Point(${centerLng}, ${centerLat}), 4326)::geography,
    ${radiusKm * 1000}
  )`;
}

/**
 * 지도 경계 조건 빌더 (PostGIS 최적화)
 * @param {Object} bounds - 지도 경계 {north, south, east, west}
 * @returns {string} PostGIS 경계 조건 문자열
 */
function buildBoundsCondition(bounds) {
  const { north, south, east, west } = bounds;
  return `ST_Within(
    coordinates,
    ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
  )`;
}

module.exports = {
  // 기본 클라이언트 (하위 호환성)
  supabase,
  
  // 개별 클라이언트들
  supabase1,      // 첫 번째 프로젝트 (기존)
  supabase2,      // 두 번째 프로젝트 (새 프로젝트)
  
  // 클라이언트 선택 함수
  getSupabaseClient,
  
  // 쿼리 함수들 (프로젝트 선택 가능)
  executeQuery,
  executeRawQuery,
  getRow,
  
  // PostGIS 헬퍼 함수들
  buildRadiusCondition,
  buildBoundsCondition
};