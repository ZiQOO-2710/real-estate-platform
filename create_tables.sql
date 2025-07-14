-- Supabase 데이터베이스 테이블 생성 SQL
-- 이 SQL을 Supabase 대시보드의 SQL Editor에서 실행하세요

-- 1. 아파트 단지 기본 테이블
CREATE TABLE IF NOT EXISTS apartment_complexes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id VARCHAR(50) UNIQUE NOT NULL,
    complex_name VARCHAR(200) NOT NULL,
    address_road TEXT,
    address_jibun TEXT,
    dong VARCHAR(100),
    gu VARCHAR(100), 
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    total_units INTEGER,
    construction_year INTEGER,
    floors INTEGER,
    parking_ratio INTEGER,
    last_transaction_price INTEGER,
    last_transaction_date DATE,
    current_asking_price INTEGER,
    price_per_pyeong INTEGER,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 현재 매물 테이블
CREATE TABLE IF NOT EXISTS current_listings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id VARCHAR(50) NOT NULL,
    deal_type VARCHAR(20) NOT NULL,
    price_amount INTEGER,
    deposit_amount INTEGER,
    monthly_rent INTEGER,
    area_sqm DECIMAL(7, 2),
    area_pyeong DECIMAL(7, 2),
    floor_info VARCHAR(50),
    direction VARCHAR(20),
    description TEXT,
    listing_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
);

-- 3. 실거래가 테이블  
CREATE TABLE IF NOT EXISTS transaction_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    complex_id VARCHAR(50) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    price_amount INTEGER NOT NULL,
    area_sqm DECIMAL(7, 2),
    area_pyeong DECIMAL(7, 2),
    floor_info VARCHAR(50),
    transaction_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
);

-- 4. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_apartment_complexes_location 
ON apartment_complexes(latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_apartment_complexes_region 
ON apartment_complexes(city, gu, dong);

CREATE INDEX IF NOT EXISTS idx_current_listings_complex 
ON current_listings(complex_id);

CREATE INDEX IF NOT EXISTS idx_transaction_history_complex 
ON transaction_history(complex_id);

CREATE INDEX IF NOT EXISTS idx_transaction_history_date 
ON transaction_history(transaction_date);

-- 5. 샘플 데이터 삽입
INSERT INTO apartment_complexes (
    complex_id, complex_name, address_road, city, gu, dong,
    latitude, longitude, last_transaction_price
) VALUES 
('sample_001', '정든한진6차', '경기도 성남시 분당구 정자일로 95', '경기도', '성남시', '분당구', 37.36286, 127.115578, 145000),
('sample_002', '분당주공아파트', '경기도 성남시 분당구 분당로 50', '경기도', '성남시', '분당구', 37.3838, 127.1230, 89000),
('sample_003', '삼성래미안', '경기도 성남시 분당구 판교역로 235', '경기도', '성남시', '분당구', 37.3940, 127.1110, 180000),
('sample_004', '서울 강남 아파트', '서울특별시 강남구 테헤란로 123', '서울특별시', '강남구', '역삼동', 37.5044, 127.0384, 200000),
('sample_005', '부산 해운대 마린시티', '부산광역시 해운대구 우동', '부산광역시', '해운대구', '우동', 35.1595, 129.1786, 95000)
ON CONFLICT (complex_id) DO NOTHING;