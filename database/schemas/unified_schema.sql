-- =============================================
-- 부동산 플랫폼 통합 데이터베이스 스키마
-- PostgreSQL + PostGIS 기반 지도 서비스 최적화
-- =============================================

-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- =============================================
-- 1. 통합 아파트 단지 마스터 테이블
-- =============================================
CREATE TABLE unified_complexes (
    -- 기본 식별자
    complex_id SERIAL PRIMARY KEY,
    
    -- 외부 시스템 식별자들 (개체 식별용)
    naver_complex_id VARCHAR(50),
    molit_complex_code VARCHAR(20),
    supabase_complex_id INTEGER,
    
    -- 기본 단지 정보
    complex_name VARCHAR(200) NOT NULL,
    complex_name_english VARCHAR(200),
    
    -- 주소 정보 (계층적 구조)
    sido VARCHAR(50) NOT NULL,               -- 시/도
    sigungu VARCHAR(50) NOT NULL,            -- 시/군/구  
    dong VARCHAR(50) NOT NULL,               -- 동/읍/면
    ri VARCHAR(50),                          -- 리 (읍/면 하위)
    jibun VARCHAR(50),                       -- 지번
    road_name VARCHAR(200),                  -- 도로명
    road_number VARCHAR(50),                 -- 도로명번호
    detail_address VARCHAR(200),             -- 상세주소
    postal_code VARCHAR(10),                 -- 우편번호
    
    -- 지리 정보 (PostGIS)
    geom GEOMETRY(POINT, 4326),              -- WGS84 좌표
    geom_tm GEOMETRY(POINT, 5179),           -- TM 좌표 (한국 측지계)
    latitude DECIMAL(10, 8),                 -- 위도
    longitude DECIMAL(11, 8),                -- 경도
    
    -- 단지 상세 정보
    total_households INTEGER,                -- 총 세대수
    total_buildings INTEGER,                 -- 총 동수
    completion_date DATE,                    -- 준공일
    approval_date DATE,                      -- 사용승인일
    construction_company VARCHAR(100),       -- 시공사
    
    -- 관리 정보
    management_office_phone VARCHAR(20),     -- 관리사무소 전화
    management_fee_per_pyeong INTEGER,       -- 평당 관리비
    
    -- 교통 및 편의시설
    nearest_subway_station VARCHAR(100),     -- 최인근 지하철역
    subway_distance_m INTEGER,               -- 지하철역 거리(미터)
    parking_spaces INTEGER,                  -- 주차대수
    parking_ratio DECIMAL(5, 2),             -- 주차율
    
    -- 데이터 품질 관리
    data_source VARCHAR(20) NOT NULL,        -- 데이터 출처 (naver, molit, supabase)
    data_quality_score INTEGER DEFAULT 100, -- 데이터 품질 점수 (0-100)
    is_verified BOOLEAN DEFAULT FALSE,       -- 검증 여부
    
    -- 시스템 관리
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_crawled_at TIMESTAMP WITH TIME ZONE,
    
    -- 제약조건
    CONSTRAINT valid_coordinates CHECK (
        latitude BETWEEN 33.0 AND 39.0 AND 
        longitude BETWEEN 124.0 AND 132.0
    ),
    CONSTRAINT valid_quality_score CHECK (data_quality_score BETWEEN 0 AND 100)
);

-- =============================================
-- 2. 통합 가격 정보 테이블 (실거래가 + 호가)
-- =============================================
CREATE TABLE unified_prices (
    -- 기본 식별자
    price_id BIGSERIAL PRIMARY KEY,
    complex_id INTEGER NOT NULL REFERENCES unified_complexes(complex_id) ON DELETE CASCADE,
    
    -- 외부 시스템 식별자들
    transaction_id VARCHAR(100),             -- 원본 거래 ID
    listing_id VARCHAR(100),                 -- 매물 ID (호가용)
    
    -- 거래/매물 기본 정보
    price_type VARCHAR(20) NOT NULL,         -- 'transaction' or 'listing'
    deal_type VARCHAR(20) NOT NULL,          -- 'sale', 'rent', 'lease'
    
    -- 가격 정보 (만원 단위)
    price_amount BIGINT NOT NULL,            -- 거래가/호가
    deposit_amount BIGINT,                   -- 보증금 (전세/월세)
    monthly_rent BIGINT,                     -- 월세
    maintenance_fee INTEGER,                 -- 관리비
    
    -- 물건 정보
    area_type VARCHAR(20),                   -- 'exclusive', 'supply', 'total'
    exclusive_area DECIMAL(8, 2),            -- 전용면적(㎡)
    supply_area DECIMAL(8, 2),               -- 공급면적(㎡)
    total_area DECIMAL(8, 2),                -- 연면적(㎡)
    exclusive_area_pyeong DECIMAL(6, 2),     -- 전용면적(평)
    
    -- 위치 정보
    building_name VARCHAR(50),               -- 동명
    floor_number INTEGER,                    -- 층수
    total_floors INTEGER,                    -- 총 층수
    room_count VARCHAR(20),                  -- 방 구조 (예: 3룸)
    
    -- 거래 일시 정보
    deal_date DATE,                          -- 거래일/등록일
    deal_year INTEGER,                       -- 거래년도
    deal_month INTEGER,                      -- 거래월
    contract_date DATE,                      -- 계약일
    
    -- 매물 상태 (listing용)
    listing_status VARCHAR(20),              -- 'active', 'sold', 'expired'
    is_immediate_move BOOLEAN DEFAULT FALSE, -- 즉시입주 가능
    move_in_date DATE,                       -- 입주가능일
    
    -- 추가 정보
    broker_name VARCHAR(100),                -- 중개업소명
    broker_phone VARCHAR(20),                -- 중개업소 전화
    special_notes TEXT,                      -- 특이사항
    
    -- 데이터 품질 관리
    data_source VARCHAR(20) NOT NULL,        -- 데이터 출처
    data_quality_score INTEGER DEFAULT 100,
    is_verified BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,      -- 중복 데이터 표시
    
    -- 시스템 관리
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    crawled_at TIMESTAMP WITH TIME ZONE,
    
    -- 제약조건
    CONSTRAINT valid_price_type CHECK (price_type IN ('transaction', 'listing')),
    CONSTRAINT valid_deal_type CHECK (deal_type IN ('sale', 'rent', 'lease')),
    CONSTRAINT positive_price CHECK (price_amount > 0),
    CONSTRAINT valid_area CHECK (exclusive_area > 0 AND exclusive_area < 1000),
    CONSTRAINT valid_floor CHECK (floor_number > 0 AND floor_number <= total_floors)
);

-- =============================================
-- 3. 데이터 매핑 관리 테이블
-- =============================================
CREATE TABLE data_source_mapping (
    mapping_id SERIAL PRIMARY KEY,
    unified_complex_id INTEGER NOT NULL REFERENCES unified_complexes(complex_id),
    
    -- 원본 데이터 식별자
    source_system VARCHAR(20) NOT NULL,      -- 'naver', 'molit', 'supabase1', 'supabase2'
    source_id VARCHAR(100) NOT NULL,         -- 원본 시스템의 ID
    source_table VARCHAR(50),                -- 원본 테이블명
    
    -- 매핑 품질 정보
    match_confidence DECIMAL(3, 2),          -- 매핑 신뢰도 (0.0-1.0)
    match_method VARCHAR(50),                -- 매핑 방법 ('exact', 'fuzzy', 'manual')
    
    -- 매핑 검증
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by VARCHAR(50),
    verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(source_system, source_id)
);

-- =============================================
-- 4. 지역 코드 관리 테이블
-- =============================================
CREATE TABLE region_codes (
    region_id SERIAL PRIMARY KEY,
    
    -- 행정구역 코드
    sido_code VARCHAR(2) NOT NULL,
    sigungu_code VARCHAR(5),
    dong_code VARCHAR(8),
    
    -- 행정구역명
    sido_name VARCHAR(50) NOT NULL,
    sigungu_name VARCHAR(50),
    dong_name VARCHAR(50),
    
    -- 계층 관계
    parent_region_id INTEGER REFERENCES region_codes(region_id),
    region_level INTEGER NOT NULL,           -- 1:시도, 2:시군구, 3:동
    
    -- 지리 정보
    boundary_geom GEOMETRY(MULTIPOLYGON, 4326), -- 행정구역 경계
    center_point GEOMETRY(POINT, 4326),      -- 중심점
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_region_level CHECK (region_level BETWEEN 1 AND 3)
);

-- =============================================
-- 5. 인덱스 생성 (성능 최적화)
-- =============================================

-- 공간 인덱스 (지도 서비스 최적화)
CREATE INDEX idx_complexes_geom ON unified_complexes USING GIST (geom);
CREATE INDEX idx_complexes_geom_tm ON unified_complexes USING GIST (geom_tm);

-- 위치 기반 검색 인덱스
CREATE INDEX idx_complexes_location ON unified_complexes (sido, sigungu, dong);
CREATE INDEX idx_complexes_coordinates ON unified_complexes (latitude, longitude);

-- 가격 테이블 인덱스
CREATE INDEX idx_prices_complex_id ON unified_prices (complex_id);
CREATE INDEX idx_prices_deal_date ON unified_prices (deal_date DESC);
CREATE INDEX idx_prices_price_type ON unified_prices (price_type, deal_type);
CREATE INDEX idx_prices_area ON unified_prices (exclusive_area);

-- 복합 인덱스 (자주 사용되는 쿼리 패턴)
CREATE INDEX idx_prices_complex_date ON unified_prices (complex_id, deal_date DESC);
CREATE INDEX idx_prices_location_price ON unified_prices (complex_id, price_type, deal_type, deal_date DESC);

-- 데이터 소스 매핑 인덱스
CREATE INDEX idx_mapping_source ON data_source_mapping (source_system, source_id);
CREATE INDEX idx_mapping_complex ON data_source_mapping (unified_complex_id);

-- 지역 코드 인덱스
CREATE INDEX idx_regions_codes ON region_codes (sido_code, sigungu_code, dong_code);
CREATE INDEX idx_regions_boundary ON region_codes USING GIST (boundary_geom);

-- =============================================
-- 6. 트리거 및 함수 생성
-- =============================================

-- 업데이트 시간 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE TRIGGER update_complexes_updated_at BEFORE UPDATE ON unified_complexes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prices_updated_at BEFORE UPDATE ON unified_prices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 좌표 자동 동기화 함수 (위도/경도 ↔ PostGIS geom)
CREATE OR REPLACE FUNCTION sync_coordinates()
RETURNS TRIGGER AS $$
BEGIN
    -- 위도/경도가 변경되면 geom 업데이트
    IF (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL) THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
        NEW.geom_tm = ST_Transform(NEW.geom, 5179);
    END IF;
    
    -- geom이 변경되면 위도/경도 업데이트
    IF (NEW.geom IS NOT NULL AND (OLD.geom IS NULL OR NOT ST_Equals(NEW.geom, OLD.geom))) THEN
        NEW.latitude = ST_Y(NEW.geom);
        NEW.longitude = ST_X(NEW.geom);
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER sync_complex_coordinates BEFORE INSERT OR UPDATE ON unified_complexes FOR EACH ROW EXECUTE FUNCTION sync_coordinates();

-- =============================================
-- 7. 뷰 생성 (자주 사용되는 쿼리 최적화)
-- =============================================

-- 최신 거래가 조회 뷰
CREATE VIEW latest_transaction_prices AS
SELECT DISTINCT ON (complex_id, exclusive_area_pyeong)
    complex_id,
    price_amount,
    exclusive_area_pyeong,
    deal_date,
    floor_number,
    data_source
FROM unified_prices 
WHERE price_type = 'transaction' AND deal_type = 'sale'
ORDER BY complex_id, exclusive_area_pyeong, deal_date DESC;

-- 단지별 평균 가격 뷰
CREATE VIEW complex_average_prices AS
SELECT 
    p.complex_id,
    c.complex_name,
    c.sido,
    c.sigungu,
    c.dong,
    COUNT(*) as transaction_count,
    AVG(p.price_amount) as avg_price,
    AVG(p.price_amount / p.exclusive_area_pyeong) as avg_price_per_pyeong,
    MIN(p.deal_date) as first_transaction,
    MAX(p.deal_date) as latest_transaction
FROM unified_prices p
JOIN unified_complexes c ON p.complex_id = c.complex_id
WHERE p.price_type = 'transaction' AND p.deal_type = 'sale'
GROUP BY p.complex_id, c.complex_name, c.sido, c.sigungu, c.dong;

-- 반경 기반 검색용 함수
CREATE OR REPLACE FUNCTION get_complexes_within_radius(
    center_lat DECIMAL,
    center_lng DECIMAL,
    radius_meters INTEGER
)
RETURNS TABLE (
    complex_id INTEGER,
    complex_name VARCHAR,
    distance_meters DECIMAL,
    latitude DECIMAL,
    longitude DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.complex_id,
        c.complex_name,
        ST_Distance(
            ST_GeogFromText('POINT(' || center_lng || ' ' || center_lat || ')'),
            ST_GeogFromText('POINT(' || c.longitude || ' ' || c.latitude || ')')
        )::DECIMAL as distance_meters,
        c.latitude,
        c.longitude
    FROM unified_complexes c
    WHERE ST_DWithin(
        ST_GeogFromText('POINT(' || center_lng || ' ' || center_lat || ')'),
        ST_GeogFromText('POINT(' || c.longitude || ' ' || c.latitude || ')'),
        radius_meters
    )
    ORDER BY distance_meters;
END;
$$ LANGUAGE plpgsql;