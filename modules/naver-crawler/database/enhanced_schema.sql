-- 네이버 부동산 크롤링 데이터베이스 스키마 (완전 재설계)
-- 2025-07-17 크롤링 데이터 구조 분석 결과 기반
-- 모든 크롤링 데이터를 누락 없이 저장하는 스키마

-- 1. 크롤러 정보 테이블
CREATE TABLE IF NOT EXISTS crawler_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id VARCHAR(20) NOT NULL,
    version VARCHAR(50) NOT NULL,
    crawl_method VARCHAR(50) NOT NULL,
    crawled_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 아파트 단지 기본 정보 테이블
CREATE TABLE IF NOT EXISTS apartment_complexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id VARCHAR(20) UNIQUE NOT NULL,
    complex_name VARCHAR(200),
    source_url TEXT NOT NULL,
    full_url TEXT,
    page_title VARCHAR(200),
    extracted_at TIMESTAMP,
    page_timestamp TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 매물 정보 테이블 (완전 재설계)
CREATE TABLE IF NOT EXISTS current_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id VARCHAR(20) NOT NULL,
    listing_index INTEGER NOT NULL,
    selector_type VARCHAR(50) NOT NULL,
    
    -- 원본 데이터
    raw_text TEXT NOT NULL,
    
    -- 파싱된 데이터
    deal_type VARCHAR(20), -- 매매, 전세, 월세
    price_text VARCHAR(100), -- 원본 가격 텍스트
    price_amount BIGINT, -- 만원 단위 변환된 가격
    monthly_rent INTEGER, -- 월세 (만원)
    deposit_amount BIGINT, -- 보증금 (만원)
    
    -- 면적 정보
    area_text VARCHAR(50), -- 원본 면적 텍스트
    area_sqm_exclusive DECIMAL(8,2), -- 전용면적 (㎡)
    area_sqm_supply DECIMAL(8,2), -- 공급면적 (㎡)
    area_pyeong DECIMAL(8,2), -- 평수
    
    -- 층수 정보
    floor_text VARCHAR(50), -- 원본 층수 텍스트
    floor_current INTEGER, -- 해당 층
    floor_total INTEGER, -- 총 층수
    
    -- 기타 정보
    direction VARCHAR(20), -- 방향 (남향, 동향 등)
    building_info VARCHAR(100), -- 동 정보 (601동 등)
    room_structure VARCHAR(50), -- 방 구조
    description TEXT, -- 상세 설명
    
    -- 중개사 정보
    broker_name VARCHAR(100), -- 중개사 이름
    broker_type VARCHAR(50), -- 중개사 유형
    listing_date DATE, -- 매물 등록일
    
    -- 메타 정보
    extracted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id),
    INDEX idx_complex_id (complex_id),
    INDEX idx_deal_type (deal_type),
    INDEX idx_price_amount (price_amount),
    INDEX idx_extracted_at (extracted_at)
);

-- 4. 가격 파싱 로그 테이블
CREATE TABLE IF NOT EXISTS price_parsing_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    original_text TEXT NOT NULL,
    parsed_price BIGINT,
    parsing_method VARCHAR(50),
    parsing_confidence DECIMAL(3,2), -- 0.00~1.00
    parsing_errors TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (listing_id) REFERENCES current_listings(id)
);

-- 5. 단지별 통계 뷰
CREATE VIEW IF NOT EXISTS complex_statistics AS
SELECT 
    ac.complex_id,
    ac.complex_name,
    COUNT(DISTINCT cl.id) as total_listings,
    COUNT(DISTINCT CASE WHEN cl.deal_type = '매매' THEN cl.id END) as sale_listings,
    COUNT(DISTINCT CASE WHEN cl.deal_type = '전세' THEN cl.id END) as jeonse_listings,
    COUNT(DISTINCT CASE WHEN cl.deal_type = '월세' THEN cl.id END) as monthly_rent_listings,
    
    -- 매매 가격 통계
    MIN(CASE WHEN cl.deal_type = '매매' THEN cl.price_amount END) as sale_price_min,
    MAX(CASE WHEN cl.deal_type = '매매' THEN cl.price_amount END) as sale_price_max,
    AVG(CASE WHEN cl.deal_type = '매매' THEN cl.price_amount END) as sale_price_avg,
    
    -- 전세 가격 통계
    MIN(CASE WHEN cl.deal_type = '전세' THEN cl.price_amount END) as jeonse_price_min,
    MAX(CASE WHEN cl.deal_type = '전세' THEN cl.price_amount END) as jeonse_price_max,
    AVG(CASE WHEN cl.deal_type = '전세' THEN cl.price_amount END) as jeonse_price_avg,
    
    -- 면적 통계
    MIN(cl.area_sqm_exclusive) as area_min,
    MAX(cl.area_sqm_exclusive) as area_max,
    AVG(cl.area_sqm_exclusive) as area_avg,
    
    -- 크롤링 정보
    MAX(cl.extracted_at) as last_crawled,
    COUNT(DISTINCT DATE(cl.extracted_at)) as crawl_dates
    
FROM apartment_complexes ac
LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
GROUP BY ac.complex_id, ac.complex_name;

-- 6. 크롤링 메타데이터 테이블 (기존 유지하되 확장)
CREATE TABLE IF NOT EXISTS crawling_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id VARCHAR(20) NOT NULL,
    crawler_version VARCHAR(50),
    crawl_method VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    listings_count INTEGER DEFAULT 0,
    unique_listings_count INTEGER DEFAULT 0,
    duplicate_removal_rate DECIMAL(5,2),
    screenshot_path TEXT,
    json_file_path TEXT,
    csv_file_path TEXT,
    error_message TEXT,
    execution_time_seconds INTEGER,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id),
    INDEX idx_metadata_complex_id (complex_id),
    INDEX idx_metadata_crawled_at (crawled_at)
);

-- 7. 데이터 품질 체크 뷰
CREATE VIEW IF NOT EXISTS data_quality_check AS
SELECT 
    ac.complex_id,
    ac.complex_name,
    COUNT(cl.id) as total_listings,
    
    -- 필수 필드 누락 체크
    COUNT(CASE WHEN cl.deal_type IS NULL THEN 1 END) as missing_deal_type,
    COUNT(CASE WHEN cl.price_amount IS NULL AND cl.deal_type IN ('매매', '전세') THEN 1 END) as missing_price,
    COUNT(CASE WHEN cl.area_sqm_exclusive IS NULL THEN 1 END) as missing_area,
    COUNT(CASE WHEN cl.raw_text IS NULL OR cl.raw_text = '' THEN 1 END) as missing_raw_text,
    
    -- 데이터 품질 점수 (0-100)
    ROUND(
        (COUNT(cl.id) - 
         COUNT(CASE WHEN cl.deal_type IS NULL THEN 1 END) - 
         COUNT(CASE WHEN cl.price_amount IS NULL AND cl.deal_type IN ('매매', '전세') THEN 1 END) - 
         COUNT(CASE WHEN cl.area_sqm_exclusive IS NULL THEN 1 END)
        ) * 100.0 / NULLIF(COUNT(cl.id), 0), 2
    ) as quality_score
    
FROM apartment_complexes ac
LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
GROUP BY ac.complex_id, ac.complex_name;

-- 8. 인덱스 생성 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_listings_complex_deal ON current_listings(complex_id, deal_type);
CREATE INDEX IF NOT EXISTS idx_listings_price_range ON current_listings(price_amount);
CREATE INDEX IF NOT EXISTS idx_listings_area_range ON current_listings(area_sqm_exclusive);
CREATE INDEX IF NOT EXISTS idx_listings_extracted_date ON current_listings(extracted_at);

-- 9. 트리거 생성 (자동 업데이트)
CREATE TRIGGER IF NOT EXISTS update_complex_timestamp
    AFTER INSERT ON current_listings
    FOR EACH ROW
    BEGIN
        UPDATE apartment_complexes 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE complex_id = NEW.complex_id;
    END;

-- 10. 테이블 설명 (SQLite에서는 COMMENT 미지원)
-- apartment_complexes: 아파트 단지 기본 정보
-- current_listings: 현재 매물 정보 (호가) - 완전 재설계
-- price_parsing_log: 가격 파싱 로그 및 오류 추적
-- crawling_metadata: 크롤링 메타데이터 및 통계

-- 주요 컬럼 설명
-- current_listings.price_amount: 만원 단위 가격 (6억 = 600,000)
-- current_listings.area_sqm_exclusive: 전용면적 (제곱미터)
-- current_listings.raw_text: 원본 매물 텍스트 (파싱 실패 시 복구용)
-- current_listings.selector_type: 크롤링 셀렉터 타입 (.item_link, [class*="deal"] 등)