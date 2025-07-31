-- 통합 부동산 데이터베이스 스키마
-- 단지정보, 매물호가, 실거래가를 통합한 정규화된 구조

-- 1. 마스터 단지 테이블 (통합된 단지 정보)
CREATE TABLE IF NOT EXISTS apartment_complexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_code VARCHAR(50) UNIQUE NOT NULL, -- 통합 단지 코드 (auto-generated)
    
    -- 기본 정보
    name VARCHAR(200) NOT NULL,
    name_variations TEXT, -- JSON array of alternative names
    
    -- 위치 정보 (핵심 매칭 키)
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    
    -- 주소 정보 (매칭 보조 키)
    address_jibun VARCHAR(300), -- 지번 주소
    address_road VARCHAR(300),  -- 도로명 주소
    address_normalized VARCHAR(300), -- 정규화된 주소
    
    -- 행정구역
    sido VARCHAR(50),
    sigungu VARCHAR(50),
    eup_myeon_dong VARCHAR(50),
    
    -- 단지 상세 정보
    completion_year INTEGER,
    total_households INTEGER,
    total_buildings INTEGER,
    area_range VARCHAR(100),
    
    -- 메타데이터
    data_sources TEXT, -- JSON array of source identifiers
    confidence_score DECIMAL(3, 2) DEFAULT 1.0, -- 데이터 신뢰도 (0-1)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- 지리적 검색을 위한 인덱스
    UNIQUE(latitude, longitude)
);

-- 2. 소스 단지 매핑 테이블 (원본 데이터 추적)
CREATE TABLE IF NOT EXISTS source_complex_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apartment_complex_id INTEGER NOT NULL,
    
    source_type TEXT NOT NULL CHECK(source_type IN ('naver', 'molit', 'manual')),
    source_id VARCHAR(100) NOT NULL, -- 원본 시스템의 ID
    source_url VARCHAR(500),
    
    matching_method TEXT NOT NULL CHECK(matching_method IN ('coordinate', 'jibun_address', 'road_address', 'name_similarity', 'manual')),
    matching_confidence DECIMAL(3, 2) NOT NULL,
    
    original_data TEXT, -- JSON format of original data
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id),
    UNIQUE(source_type, source_id)
);

-- 3. 매물 호가 테이블 (현재 시장 매물)
CREATE TABLE IF NOT EXISTS current_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apartment_complex_id INTEGER NOT NULL,
    
    -- 매물 식별
    listing_id VARCHAR(100), -- 원본 시스템 ID
    listing_url VARCHAR(500),
    
    -- 거래 정보
    deal_type TEXT NOT NULL CHECK(deal_type IN ('매매', '전세', '월세', '단기임대')),
    price_sale INTEGER, -- 매매가 (만원)
    price_jeonse INTEGER, -- 전세가 (만원)
    price_monthly INTEGER, -- 월세 (만원)
    deposit INTEGER, -- 보증금 (만원)
    
    -- 물리적 정보
    area_exclusive DECIMAL(6, 2), -- 전용면적 (㎡)
    area_supply DECIMAL(6, 2),    -- 공급면적 (㎡)
    floor_current INTEGER,        -- 현재층
    floor_total INTEGER,          -- 총층수
    direction VARCHAR(20),        -- 향
    room_structure VARCHAR(50),   -- 방구조 (예: 3방2욕실)
    
    -- 추가 정보
    description TEXT,
    raw_text TEXT, -- 원본 텍스트
    
    -- 상태 정보
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'sold', 'expired', 'inactive')),
    
    -- 메타데이터
    crawled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
);

-- 4. 실거래가 테이블 (과거 거래 이력)
CREATE TABLE IF NOT EXISTS transaction_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apartment_complex_id INTEGER NOT NULL,
    
    -- 거래 정보
    deal_type TEXT NOT NULL CHECK(deal_type IN ('매매', '전세', '월세')),
    deal_date DATE NOT NULL,
    deal_amount INTEGER NOT NULL, -- 거래가격 (만원)
    monthly_rent INTEGER,         -- 월세 (만원, 월세거래시)
    
    -- 물리적 정보
    area_exclusive DECIMAL(6, 2), -- 전용면적 (㎡)
    floor_current INTEGER,        -- 거래층
    
    -- 위치 상세 (동/호수 정보)
    building_name VARCHAR(50),
    unit_number VARCHAR(20),
    
    -- 메타데이터
    data_source TEXT DEFAULT 'molit' CHECK(data_source IN ('molit', 'naver', 'manual')),
    original_record_id VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
);

-- 5. 단지명 변경 이력 테이블
CREATE TABLE IF NOT EXISTS complex_name_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    apartment_complex_id INTEGER NOT NULL,
    
    old_name VARCHAR(200),
    new_name VARCHAR(200),
    change_date DATE,
    change_reason VARCHAR(100),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (apartment_complex_id) REFERENCES apartment_complexes(id)
);

-- 6. 데이터 품질 로그 테이블
CREATE TABLE IF NOT EXISTS data_quality_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    process_type TEXT NOT NULL CHECK(process_type IN ('integration', 'validation', 'cleanup')),
    source_table VARCHAR(50),
    record_id INTEGER,
    
    issue_type TEXT NOT NULL CHECK(issue_type IN ('duplicate', 'missing_data', 'invalid_format', 'inconsistent')),
    issue_description TEXT,
    resolution_action TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 성능 최적화를 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_complex_location ON apartment_complexes(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_complex_address ON apartment_complexes(address_normalized);
CREATE INDEX IF NOT EXISTS idx_complex_area ON apartment_complexes(sido, sigungu, eup_myeon_dong);

CREATE INDEX IF NOT EXISTS idx_listing_complex ON current_listings(apartment_complex_id);
CREATE INDEX IF NOT EXISTS idx_listing_status ON current_listings(status, created_at);
CREATE INDEX IF NOT EXISTS idx_listing_price ON current_listings(deal_type, price_sale);

CREATE INDEX IF NOT EXISTS idx_transaction_complex ON transaction_records(apartment_complex_id);
CREATE INDEX IF NOT EXISTS idx_transaction_date ON transaction_records(deal_date);
CREATE INDEX IF NOT EXISTS idx_transaction_price ON transaction_records(deal_type, deal_amount);

CREATE INDEX IF NOT EXISTS idx_source_mapping ON source_complex_mapping(source_type, source_id);

-- Full-Text Search 인덱스 (SQLite FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS complex_search USING fts5(
    complex_code,
    name,
    address_normalized,
    content='apartment_complexes',
    content_rowid='id'
);

-- FTS5 테이블 자동 동기화 트리거
CREATE TRIGGER IF NOT EXISTS complex_search_insert AFTER INSERT ON apartment_complexes BEGIN
    INSERT INTO complex_search(rowid, complex_code, name, address_normalized) 
    VALUES (new.id, new.complex_code, new.name, new.address_normalized);
END;

CREATE TRIGGER IF NOT EXISTS complex_search_delete AFTER DELETE ON apartment_complexes BEGIN
    DELETE FROM complex_search WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS complex_search_update AFTER UPDATE ON apartment_complexes BEGIN
    DELETE FROM complex_search WHERE rowid = old.id;
    INSERT INTO complex_search(rowid, complex_code, name, address_normalized) 
    VALUES (new.id, new.complex_code, new.name, new.address_normalized);
END;