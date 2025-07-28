-- 지도 최적화용 Supabase PostgreSQL + PostGIS 스키마
-- 생성일: 2025-07-24
-- 목적: 977K+ 국토부 실거래가 데이터 최적화 저장

-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- 1. 아파트 실거래가 메인 테이블 (PostGIS 최적화)
CREATE TABLE IF NOT EXISTS apartment_transactions (
    id BIGSERIAL PRIMARY KEY,
    
    -- 기본 정보
    apartment_name VARCHAR(200) NOT NULL,
    region_name VARCHAR(100) NOT NULL,
    sigungu_name VARCHAR(100),
    legal_dong VARCHAR(100),
    jibun VARCHAR(100),
    road_name VARCHAR(200),
    
    -- 거래 정보
    deal_type VARCHAR(20) NOT NULL, -- 매매, 전세, 월세
    deal_year INTEGER NOT NULL,
    deal_month INTEGER NOT NULL,
    deal_day INTEGER,
    deal_amount NUMERIC(15,2), -- 거래금액 (만원)
    
    -- 물리적 정보
    area NUMERIC(10,2), -- 전용면적 (㎡)
    floor INTEGER, -- 층수
    
    -- 지리공간 정보 (PostGIS)
    coordinates GEOGRAPHY(POINT, 4326), -- 위경도 좌표
    coordinate_source VARCHAR(50), -- 좌표 출처
    
    -- 메타데이터
    api_data JSONB, -- 원본 API 응답
    crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 지도용 집계 뷰 (성능 최적화)
CREATE MATERIALIZED VIEW IF NOT EXISTS map_markers AS
SELECT 
    apartment_name as name,
    region_name,
    ST_X(coordinates::geometry) as longitude,
    ST_Y(coordinates::geometry) as latitude,
    coordinate_source,
    COUNT(*) as transaction_count,
    ROUND(AVG(deal_amount), 2) as avg_deal_amount,
    MIN(CONCAT(deal_year, '-', LPAD(deal_month::text, 2, '0'), '-', LPAD(COALESCE(deal_day, 1)::text, 2, '0')))::date as first_deal_date,
    MAX(CONCAT(deal_year, '-', LPAD(deal_month::text, 2, '0'), '-', LPAD(COALESCE(deal_day, 1)::text, 2, '0')))::date as last_deal_date,
    COUNT(CASE WHEN deal_type = '매매' THEN 1 END) as sale_count,
    COUNT(CASE WHEN deal_type = '전세' THEN 1 END) as jeonse_count,
    COUNT(CASE WHEN deal_type = '월세' THEN 1 END) as monthly_count
FROM apartment_transactions 
WHERE coordinates IS NOT NULL
GROUP BY apartment_name, region_name, coordinates, coordinate_source;

-- 3. 고성능 지리공간 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_coordinates_gist ON apartment_transactions USING GIST (coordinates);
CREATE INDEX IF NOT EXISTS idx_region_coordinates ON apartment_transactions USING BTREE (region_name, coordinates);
CREATE INDEX IF NOT EXISTS idx_apartment_location ON apartment_transactions USING BTREE (apartment_name, region_name);
CREATE INDEX IF NOT EXISTS idx_deal_type_year ON apartment_transactions USING BTREE (deal_type, deal_year, deal_month);
CREATE INDEX IF NOT EXISTS idx_transaction_amount ON apartment_transactions USING BTREE (deal_amount) WHERE deal_amount IS NOT NULL;

-- 4. Materialized View 인덱스
CREATE INDEX IF NOT EXISTS idx_map_markers_coords ON map_markers USING BTREE (longitude, latitude);
CREATE INDEX IF NOT EXISTS idx_map_markers_region ON map_markers USING BTREE (region_name);
CREATE INDEX IF NOT EXISTS idx_map_markers_transaction_count ON map_markers USING BTREE (transaction_count DESC);

-- 5. 성능 최적화 함수들

-- 반경 3km 내 마커 조회 함수 (PostGIS 최적화)
CREATE OR REPLACE FUNCTION get_markers_within_radius(
    center_lat NUMERIC,
    center_lng NUMERIC,
    radius_km NUMERIC DEFAULT 3,
    max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
    name VARCHAR,
    region_name VARCHAR,
    longitude NUMERIC,
    latitude NUMERIC,
    transaction_count BIGINT,
    avg_deal_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mm.name,
        mm.region_name,
        mm.longitude,
        mm.latitude,
        mm.transaction_count,
        mm.avg_deal_amount
    FROM map_markers mm
    WHERE ST_DWithin(
        ST_Point(mm.longitude, mm.latitude)::geography,
        ST_Point(center_lng, center_lat)::geography,
        radius_km * 1000  -- km를 m로 변환
    )
    ORDER BY mm.transaction_count DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- 지도 클러스터링 함수
CREATE OR REPLACE FUNCTION get_map_clusters(
    zoom_level INTEGER DEFAULT 8,
    cluster_size NUMERIC DEFAULT 0.01,
    bounds_north NUMERIC DEFAULT NULL,
    bounds_south NUMERIC DEFAULT NULL,
    bounds_east NUMERIC DEFAULT NULL,
    bounds_west NUMERIC DEFAULT NULL
)
RETURNS TABLE (
    cluster_lng NUMERIC,
    cluster_lat NUMERIC,
    marker_count BIGINT,
    total_transactions BIGINT,
    avg_price NUMERIC,
    apartment_names VARCHAR[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ROUND(mm.longitude / cluster_size, 0) * cluster_size as cluster_lng,
        ROUND(mm.latitude / cluster_size, 0) * cluster_size as cluster_lat,
        COUNT(*) as marker_count,
        SUM(mm.transaction_count) as total_transactions,
        AVG(mm.avg_deal_amount) as avg_price,
        ARRAY_AGG(mm.name ORDER BY mm.transaction_count DESC) as apartment_names
    FROM map_markers mm
    WHERE (bounds_north IS NULL OR mm.latitude <= bounds_north)
      AND (bounds_south IS NULL OR mm.latitude >= bounds_south)
      AND (bounds_east IS NULL OR mm.longitude <= bounds_east)
      AND (bounds_west IS NULL OR mm.longitude >= bounds_west)
    GROUP BY cluster_lng, cluster_lat
    HAVING COUNT(*) >= 1
    ORDER BY total_transactions DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- 6. 거래량 기준 규모 필터링 함수
CREATE OR REPLACE FUNCTION get_markers_by_scale(
    scale_filter VARCHAR DEFAULT 'all', -- 'all', 'small', 'medium', 'large'
    region_filter VARCHAR DEFAULT NULL,
    max_results INTEGER DEFAULT 50
)
RETURNS TABLE (
    name VARCHAR,
    region_name VARCHAR,
    longitude NUMERIC,
    latitude NUMERIC,
    transaction_count BIGINT,
    avg_deal_amount NUMERIC,
    scale_category VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mm.name,
        mm.region_name,
        mm.longitude,
        mm.latitude,
        mm.transaction_count,
        mm.avg_deal_amount,
        CASE 
            WHEN mm.transaction_count < 10 THEN 'small'
            WHEN mm.transaction_count >= 10 AND mm.transaction_count < 50 THEN 'medium'
            ELSE 'large'
        END as scale_category
    FROM map_markers mm
    WHERE (region_filter IS NULL OR mm.region_name ILIKE '%' || region_filter || '%')
      AND (scale_filter = 'all' OR 
           (scale_filter = 'small' AND mm.transaction_count < 10) OR
           (scale_filter = 'medium' AND mm.transaction_count >= 10 AND mm.transaction_count < 50) OR
           (scale_filter = 'large' AND mm.transaction_count >= 50))
    ORDER BY mm.transaction_count DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- 7. 실시간 업데이트 트리거
CREATE OR REPLACE FUNCTION refresh_map_markers()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY map_markers;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 8. RLS (Row Level Security) 설정 (선택사항)
-- ALTER TABLE apartment_transactions ENABLE ROW LEVEL SECURITY;

-- 9. 통계 및 성능 뷰
CREATE OR REPLACE VIEW map_statistics AS
SELECT 
    COUNT(*) as total_transactions,
    COUNT(DISTINCT apartment_name) as unique_complexes,
    COUNT(DISTINCT region_name) as regions_count,
    MIN(deal_year) as earliest_year,
    MAX(deal_year) as latest_year,
    COUNT(CASE WHEN coordinates IS NOT NULL THEN 1 END) as geo_tagged_count,
    ROUND(
        COUNT(CASE WHEN coordinates IS NOT NULL THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100, 2
    ) as geo_coverage_percent
FROM apartment_transactions;

-- 10. 자동 Materialized View 갱신 (옵션)
-- 매일 새벽 2시에 자동 갱신하려면 pg_cron 확장 필요
-- SELECT cron.schedule('refresh-map-markers', '0 2 * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY map_markers;');

-- 11. 테이블 코멘트
COMMENT ON TABLE apartment_transactions IS '국토부 아파트 실거래가 데이터 (PostGIS 최적화)';
COMMENT ON MATERIALIZED VIEW map_markers IS '지도 마커용 집계 뷰 (성능 최적화)';
COMMENT ON FUNCTION get_markers_within_radius IS '반경 N km 내 마커 조회 (PostGIS 활용)';
COMMENT ON FUNCTION get_map_clusters IS '줌 레벨별 마커 클러스터링';
COMMENT ON FUNCTION get_markers_by_scale IS '거래량 기준 단지 규모 필터링';