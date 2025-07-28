-- Supabase RPC 함수 생성 스크립트
-- 원시 SQL 쿼리 실행을 위한 함수들

-- 1. 원시 쿼리 실행 함수
CREATE OR REPLACE FUNCTION execute_query(query_text TEXT)
RETURNS TABLE(result JSONB)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY EXECUTE query_text;
END;
$$;

-- 2. 지도 마커 조회 최적화 함수
CREATE OR REPLACE FUNCTION get_map_markers(
  center_lat NUMERIC DEFAULT NULL,
  center_lng NUMERIC DEFAULT NULL,
  radius_km NUMERIC DEFAULT 3,
  zoom_level INTEGER DEFAULT 8,
  region_filter TEXT DEFAULT NULL,
  deal_type_filter TEXT DEFAULT NULL,
  household_filter TEXT DEFAULT 'all',
  result_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  name TEXT,
  region_name TEXT,
  longitude NUMERIC,
  latitude NUMERIC,
  coordinate_source TEXT,
  transaction_count BIGINT,
  avg_deal_amount NUMERIC,
  first_deal_date TEXT,
  last_deal_date TEXT,
  sale_count BIGINT,
  jeonse_count BIGINT,
  monthly_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  min_transaction_count INTEGER := 1;
  sql_query TEXT;
BEGIN
  -- 줌 레벨에 따른 거래량 임계값 설정
  IF zoom_level < 7 THEN
    min_transaction_count := 10;
  ELSIF zoom_level < 10 THEN
    min_transaction_count := 5;
  END IF;

  -- 기본 쿼리 작성
  sql_query := '
    SELECT 
      apartment_name as name,
      region as region_name,
      ST_X(coordinates) as longitude,
      ST_Y(coordinates) as latitude,
      ''molit'' as coordinate_source,
      COUNT(*) as transaction_count,
      ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_deal_amount,
      MIN(deal_year || ''-'' || LPAD(deal_month::text, 2, ''0'') || ''-'' || LPAD(deal_day::text, 2, ''0'')) as first_deal_date,
      MAX(deal_year || ''-'' || LPAD(deal_month::text, 2, ''0'') || ''-'' || LPAD(deal_day::text, 2, ''0'')) as last_deal_date,
      COUNT(CASE WHEN deal_type = ''매매'' THEN 1 END) as sale_count,
      COUNT(CASE WHEN deal_type = ''전세'' THEN 1 END) as jeonse_count,
      COUNT(CASE WHEN deal_type = ''월세'' THEN 1 END) as monthly_count
    FROM apartment_transactions
    WHERE coordinates IS NOT NULL
  ';

  -- 지역 필터 추가
  IF region_filter IS NOT NULL THEN
    sql_query := sql_query || ' AND region ILIKE ''%' || region_filter || '%''';
  END IF;

  -- 반경 필터 추가 (PostGIS ST_DWithin 사용)
  IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
    sql_query := sql_query || ' AND ST_DWithin(
      coordinates::geography,
      ST_SetSRID(ST_Point(' || center_lng || ', ' || center_lat || '), 4326)::geography,
      ' || (radius_km * 1000) || '
    )';
  END IF;

  -- 거래 유형 필터 추가
  IF deal_type_filter IS NOT NULL AND deal_type_filter IN ('매매', '전세', '월세') THEN
    sql_query := sql_query || ' AND deal_type = ''' || deal_type_filter || '''';
  END IF;

  -- GROUP BY 추가
  sql_query := sql_query || '
    GROUP BY apartment_name, region, coordinates
    HAVING COUNT(*) >= ' || min_transaction_count;

  -- 단지 규모 필터 추가
  IF household_filter = 'small' THEN
    sql_query := sql_query || ' AND COUNT(*) < 10';
  ELSIF household_filter = 'medium' THEN
    sql_query := sql_query || ' AND COUNT(*) >= 10 AND COUNT(*) < 50';
  ELSIF household_filter = 'large' THEN
    sql_query := sql_query || ' AND COUNT(*) >= 50';
  END IF;

  -- 정렬 및 제한
  sql_query := sql_query || '
    ORDER BY COUNT(*) DESC, AVG(CAST(deal_amount as NUMERIC)) DESC
    LIMIT ' || result_limit;

  -- 쿼리 실행
  RETURN QUERY EXECUTE sql_query;
END;
$$;

-- 3. 클러스터링 함수
CREATE OR REPLACE FUNCTION get_map_clusters(
  center_lat NUMERIC DEFAULT NULL,
  center_lng NUMERIC DEFAULT NULL,
  radius_km NUMERIC DEFAULT 3,
  cluster_size NUMERIC DEFAULT 0.01,
  region_filter TEXT DEFAULT NULL
)
RETURNS TABLE(
  cluster_lng NUMERIC,
  cluster_lat NUMERIC,
  marker_count BIGINT,
  total_transactions BIGINT,
  avg_price NUMERIC,
  apartment_names TEXT,
  region_name TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  sql_query TEXT;
BEGIN
  sql_query := '
    SELECT 
      ROUND(ST_X(coordinates) / ' || cluster_size || ', 0) * ' || cluster_size || ' as cluster_lng,
      ROUND(ST_Y(coordinates) / ' || cluster_size || ', 0) * ' || cluster_size || ' as cluster_lat,
      COUNT(*) as marker_count,
      COUNT(*) as total_transactions,
      ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_price,
      STRING_AGG(DISTINCT apartment_name, ''|'') as apartment_names,
      region as region_name
    FROM apartment_transactions
    WHERE coordinates IS NOT NULL
  ';

  -- 지역 필터
  IF region_filter IS NOT NULL THEN
    sql_query := sql_query || ' AND region ILIKE ''%' || region_filter || '%''';
  END IF;

  -- 반경 필터
  IF center_lat IS NOT NULL AND center_lng IS NOT NULL THEN
    sql_query := sql_query || ' AND ST_DWithin(
      coordinates::geography,
      ST_SetSRID(ST_Point(' || center_lng || ', ' || center_lat || '), 4326)::geography,
      ' || (radius_km * 1000) || '
    )';
  END IF;

  sql_query := sql_query || '
    GROUP BY 
      ROUND(ST_X(coordinates) / ' || cluster_size || ', 0) * ' || cluster_size || ',
      ROUND(ST_Y(coordinates) / ' || cluster_size || ', 0) * ' || cluster_size || ',
      region
    HAVING COUNT(*) >= 1
    ORDER BY total_transactions DESC
    LIMIT 100
  ';

  RETURN QUERY EXECUTE sql_query;
END;
$$;

-- 4. 통계 조회 함수
CREATE OR REPLACE FUNCTION get_map_stats(region_filter TEXT DEFAULT NULL)
RETURNS TABLE(
  total_complexes BIGINT,
  total_transactions BIGINT,
  overall_avg_amount NUMERIC,
  regions_count BIGINT,
  total_sales BIGINT,
  total_jeonse BIGINT,
  total_monthly BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  sql_query TEXT;
BEGIN
  sql_query := '
    SELECT 
      COUNT(DISTINCT apartment_name) as total_complexes,
      COUNT(*) as total_transactions,
      ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as overall_avg_amount,
      COUNT(DISTINCT region) as regions_count,
      COUNT(CASE WHEN deal_type = ''매매'' THEN 1 END) as total_sales,
      COUNT(CASE WHEN deal_type = ''전세'' THEN 1 END) as total_jeonse,
      COUNT(CASE WHEN deal_type = ''월세'' THEN 1 END) as total_monthly
    FROM apartment_transactions
  ';

  IF region_filter IS NOT NULL THEN
    sql_query := sql_query || ' WHERE region ILIKE ''%' || region_filter || '%''';
  END IF;

  RETURN QUERY EXECUTE sql_query;
END;
$$;

-- 5. 지역별 통계 함수
CREATE OR REPLACE FUNCTION get_region_stats(region_filter TEXT DEFAULT NULL)
RETURNS TABLE(
  region_name TEXT,
  complex_count BIGINT,
  transaction_count BIGINT,
  avg_amount NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  sql_query TEXT;
BEGIN
  sql_query := '
    SELECT 
      region as region_name,
      COUNT(DISTINCT apartment_name) as complex_count,
      COUNT(*) as transaction_count,
      ROUND(AVG(CAST(deal_amount as NUMERIC)), 0) as avg_amount
    FROM apartment_transactions
  ';

  IF region_filter IS NOT NULL THEN
    sql_query := sql_query || ' WHERE region ILIKE ''%' || region_filter || '%''';
  END IF;

  sql_query := sql_query || '
    GROUP BY region
    ORDER BY transaction_count DESC
    LIMIT 10
  ';

  RETURN QUERY EXECUTE sql_query;
END;
$$;

-- 함수 권한 설정
GRANT EXECUTE ON FUNCTION execute_query(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_map_markers(NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT, TEXT, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_map_clusters(NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO anon, authenticated;  
GRANT EXECUTE ON FUNCTION get_map_stats(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_region_stats(TEXT) TO anon, authenticated;