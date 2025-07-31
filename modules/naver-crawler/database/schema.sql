-- 네이버 부동산 크롤링 데이터베이스 스키마
-- 2025-07-17 개인용 부동산 분석 시스템

-- 1. 아파트 단지 기본 정보 테이블
CREATE TABLE IF NOT EXISTS apartment_complexes (
    id SERIAL PRIMARY KEY,
    complex_id VARCHAR(20) UNIQUE NOT NULL,
    complex_name VARCHAR(200),
    address VARCHAR(500),
    completion_year VARCHAR(20),
    total_households INTEGER,
    total_buildings INTEGER,
    area_range VARCHAR(100), -- 면적 범위 (예: 59㎡~112㎡)
    source_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 현재 매물 정보 테이블
CREATE TABLE IF NOT EXISTS current_listings (
    id SERIAL PRIMARY KEY,
    complex_id VARCHAR(20) NOT NULL,
    listing_index INTEGER,
    selector_type VARCHAR(50),
    deal_type VARCHAR(20), -- 매매, 전세, 월세
    price_text VARCHAR(50), -- 원본 가격 텍스트 (예: 6억, 5억/125)
    price_amount BIGINT, -- 만원 단위 변환된 가격
    monthly_rent INTEGER, -- 월세 (만원)
    deposit_amount BIGINT, -- 보증금 (만원)
    area_sqm DECIMAL(8,2), -- 전용면적 (㎡)
    area_pyeong DECIMAL(8,2), -- 전용면적 (평)
    floor_info VARCHAR(20), -- 층 정보
    direction VARCHAR(20), -- 방향 정보
    room_structure VARCHAR(50), -- 방 구조
    description TEXT, -- 매물 설명
    raw_text TEXT, -- 원본 텍스트
    extracted_at TIMESTAMP,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
);

-- 3. 실거래가 정보 테이블 (국토부 데이터로 대체 예정 - 현재 사용 안함)
-- CREATE TABLE IF NOT EXISTS transaction_history (
--     id SERIAL PRIMARY KEY,
--     complex_id VARCHAR(20) NOT NULL,
--     transaction_date DATE,
--     deal_type VARCHAR(20), -- 매매, 전세
--     price_amount BIGINT, -- 거래가격 (만원)
--     area_sqm DECIMAL(8,2), -- 거래 면적 (㎡)
--     floor_info VARCHAR(20), -- 층 정보
--     pattern_type INTEGER, -- 추출 패턴 유형
--     match_text VARCHAR(200), -- 매칭된 텍스트
--     context_text TEXT, -- 주변 컨텍스트
--     extracted_at TIMESTAMP,
--     crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
-- );

-- 4. 가격 분석 결과 테이블
CREATE TABLE IF NOT EXISTS price_analysis (
    id SERIAL PRIMARY KEY,
    complex_id VARCHAR(20) NOT NULL,
    analysis_date DATE DEFAULT CURRENT_DATE,
    deal_type VARCHAR(20),
    total_listings INTEGER DEFAULT 0,
    price_min BIGINT,
    price_max BIGINT,
    price_avg BIGINT,
    price_median BIGINT,
    area_avg DECIMAL(8,2),
    sqm_price_avg INTEGER, -- 평방미터당 평균 가격
    pyeong_price_avg INTEGER, -- 평당 평균 가격
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
);

-- 5. 크롤링 메타데이터 테이블
CREATE TABLE IF NOT EXISTS crawling_metadata (
    id SERIAL PRIMARY KEY,
    complex_id VARCHAR(20) NOT NULL,
    crawler_version VARCHAR(50),
    crawl_method VARCHAR(50),
    success BOOLEAN DEFAULT TRUE,
    listings_count INTEGER DEFAULT 0,
    transactions_count INTEGER DEFAULT 0,
    screenshot_path TEXT,
    json_file_path TEXT,
    csv_file_path TEXT,
    error_message TEXT,
    execution_time_seconds INTEGER,
    crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
);

-- 6. 크롤링 통계 뷰
CREATE OR REPLACE VIEW crawling_stats AS
SELECT 
    ac.complex_id,
    ac.complex_name,
    ac.address,
    COUNT(DISTINCT cl.id) as current_listings_count,
    COUNT(DISTINCT th.id) as transaction_count,
    MAX(cm.crawled_at) as last_crawled,
    cm.crawler_version,
    cm.crawl_method
FROM apartment_complexes ac
LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
LEFT JOIN transaction_history th ON ac.complex_id = th.complex_id
LEFT JOIN crawling_metadata cm ON ac.complex_id = cm.complex_id
GROUP BY ac.complex_id, ac.complex_name, ac.address, cm.crawler_version, cm.crawl_method;

-- 7. 매물 가격 분석 뷰
CREATE OR REPLACE VIEW listing_price_analysis AS
SELECT 
    cl.complex_id,
    cl.deal_type,
    COUNT(*) as listing_count,
    MIN(cl.price_amount) as min_price,
    MAX(cl.price_amount) as max_price,
    AVG(cl.price_amount) as avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cl.price_amount) as median_price,
    AVG(cl.area_sqm) as avg_area_sqm,
    AVG(cl.price_amount / NULLIF(cl.area_sqm, 0)) as avg_price_per_sqm
FROM current_listings cl
WHERE cl.price_amount IS NOT NULL AND cl.price_amount > 0
GROUP BY cl.complex_id, cl.deal_type;

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_complex_id ON apartment_complexes(complex_id);
CREATE INDEX IF NOT EXISTS idx_listings_complex_id ON current_listings(complex_id);
CREATE INDEX IF NOT EXISTS idx_listings_deal_type ON current_listings(deal_type);
CREATE INDEX IF NOT EXISTS idx_listings_price ON current_listings(price_amount);
CREATE INDEX IF NOT EXISTS idx_transactions_complex_id ON transaction_history(complex_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transaction_history(transaction_date);
CREATE INDEX IF NOT EXISTS idx_metadata_complex_id ON crawling_metadata(complex_id);
CREATE INDEX IF NOT EXISTS idx_metadata_crawled_at ON crawling_metadata(crawled_at);

-- 코멘트 추가
COMMENT ON TABLE apartment_complexes IS '아파트 단지 기본 정보';
COMMENT ON TABLE current_listings IS '현재 매물 정보 (호가)';
COMMENT ON TABLE transaction_history IS '실거래가 정보';
COMMENT ON TABLE price_analysis IS '가격 분석 결과';
COMMENT ON TABLE crawling_metadata IS '크롤링 메타데이터';

COMMENT ON COLUMN current_listings.price_amount IS '만원 단위 가격 (6억 = 600,000)';
COMMENT ON COLUMN transaction_history.price_amount IS '만원 단위 거래가격';
COMMENT ON COLUMN current_listings.area_sqm IS '전용면적 (제곱미터)';
COMMENT ON COLUMN current_listings.area_pyeong IS '전용면적 (평)';
