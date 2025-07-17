# Ultimate Real Estate Crawler 사용 가이드

## 🎯 개요

Ultimate Real Estate Crawler는 **국토부 실거래가**와 **네이버 부동산 매매호가**를 동시에 수집하는 최고 수준의 부동산 크롤러입니다.

### 🌟 주요 특징

- ✅ **이중 데이터 소스**: 국토부 실거래가 + 네이버 매매호가
- ✅ **UltimateDatabaseManager**: 100% 데이터 저장 보장
- ✅ **지능형 IP 차단 방지**: 스마트 딜레이 시스템
- ✅ **자동 재시도**: 실패한 요청 자동 복구
- ✅ **실시간 모니터링**: 진행률 및 통계 실시간 확인
- ✅ **안전한 동시 처리**: 서버 부하 최소화

## 🚀 빠른 시작

### 1. 필수 준비사항

```bash
# 필수 라이브러리 설치
pip install aiohttp requests

# 파일 확인
ls -la ultimate_*.py
```

### 2. 국토부 API 키 발급 (권장)

1. [공공데이터포털](https://www.data.go.kr) 접속
2. 회원가입 및 로그인
3. "국토교통부 아파트 매매 실거래가 자료" 검색
4. 활용신청 클릭 (승인까지 1-2시간 소요)
5. 마이페이지 > 개발계정 > 인증키 확인

### 3. 크롤러 실행

```bash
# 대화형 실행 (권장)
python start_ultimate_crawler.py

# 또는 직접 실행
python ultimate_real_estate_crawler.py
```

## 📊 수집 데이터 구조

### 아파트 단지 정보 (네이버 매매호가)
```sql
CREATE TABLE apartment_complexes (
    complex_id TEXT,          -- 단지 ID
    complex_name TEXT,        -- 단지명
    city TEXT,                -- 시/도
    gu TEXT,                  -- 구/군
    dong TEXT,                -- 동
    latitude REAL,            -- 위도
    longitude REAL,           -- 경도
    construction_year INTEGER, -- 건축년도
    total_units INTEGER,      -- 총 세대수
    deal_min_price INTEGER,   -- 매매 최저가
    deal_max_price INTEGER,   -- 매매 최고가
    lease_min_price INTEGER,  -- 전세 최저가
    lease_max_price INTEGER,  -- 전세 최고가
    rent_min_price INTEGER,   -- 월세 최저가
    rent_max_price INTEGER,   -- 월세 최고가
    trade_type TEXT,          -- 거래 유형
    address_road TEXT,        -- 도로명 주소
    address_jibun TEXT,       -- 지번 주소
    data_source TEXT,         -- 데이터 소스 (naver)
    updated_at DATETIME       -- 업데이트 시간
);
```

### 실거래가 정보 (국토부)
```sql
CREATE TABLE apartment_transactions (
    sgg_cd TEXT,              -- 시군구 코드
    umd_nm TEXT,              -- 읍면동명
    apt_nm TEXT,              -- 아파트명
    deal_amount TEXT,         -- 거래금액 (만원)
    deal_year TEXT,           -- 거래년도
    deal_month TEXT,          -- 거래월
    deal_day TEXT,            -- 거래일
    exclu_use_ar TEXT,        -- 전용면적 (㎡)
    floor TEXT,               -- 층
    build_year TEXT,          -- 건축년도
    dong TEXT,                -- 동
    jibun TEXT,               -- 지번
    deal_date TEXT,           -- 거래일자 (YYYY-MM-DD)
    data_source TEXT,         -- 데이터 소스 (molit)
    region_code TEXT,         -- 지역코드
    year_month TEXT,          -- 년월
    created_at DATETIME       -- 생성시간
);
```

## ⚙️ 설정 옵션

### 크롤링 규모
- **소규모**: 네이버 100개 지역, 국토부 20개 지역 (테스트용)
- **중규모**: 네이버 500개 지역, 국토부 100개 지역 (권장)
- **대규모**: 네이버 1000개 지역, 국토부 200개 지역 (고성능)

### IP 차단 방지 딜레이
- **안전모드**: 3-7초 딜레이 (IP 차단 위험 최소)
- **일반모드**: 2-5초 딜레이 (균형, 권장)
- **빠른모드**: 1-3초 딜레이 (속도 우선, 위험 있음)

### 동시 처리 수
- **보수적**: 네이버 2개, 국토부 1개 (매우 안전)
- **균형**: 네이버 3개, 국토부 2개 (권장)
- **적극적**: 네이버 5개, 국토부 3개 (빠르지만 위험)

## 🔧 고급 사용법

### 1. 프로그래밍 방식 실행

```python
import asyncio
from ultimate_real_estate_crawler import UltimateRealEstateCrawler, CrawlingConfig

async def custom_crawling():
    # 커스텀 설정
    config = CrawlingConfig(
        molit_service_key="YOUR_API_KEY",
        min_delay=2.0,
        max_delay=5.0,
        error_delay=15.0,
        max_concurrent_naver=3,
        max_concurrent_molit=2
    )
    
    # 크롤러 생성
    crawler = UltimateRealEstateCrawler(config)
    
    # 크롤링 실행
    stats = await crawler.run_ultimate_crawling(
        max_naver_regions=100,
        max_molit_regions=50
    )
    
    print(f"저장 효율: {stats['success_rate']:.1f}%")

# 실행
asyncio.run(custom_crawling())
```

### 2. 데이터베이스 직접 조회

```python
import sqlite3

# 데이터베이스 연결
conn = sqlite3.connect("real_estate_crawling.db")
cursor = conn.cursor()

# 아파트 단지 조회
cursor.execute("""
    SELECT complex_name, city, gu, dong, deal_min_price, deal_max_price 
    FROM apartment_complexes 
    WHERE city = '서울특별시' AND gu = '강남구'
    ORDER BY deal_max_price DESC
    LIMIT 10
""")

results = cursor.fetchall()
for row in results:
    print(f"{row[0]}: {row[4]:,}만원 ~ {row[5]:,}만원")

conn.close()
```

### 3. 실거래가 분석

```python
import sqlite3
import pandas as pd

# 데이터베이스 연결
conn = sqlite3.connect("real_estate_crawling.db")

# 실거래가 데이터 읽기
df = pd.read_sql_query("""
    SELECT apt_nm, deal_amount, deal_date, exclu_use_ar, floor
    FROM apartment_transactions
    WHERE umd_nm = '삼성동'
    ORDER BY deal_date DESC
""", conn)

# 평균 실거래가 계산
df['deal_amount_int'] = df['deal_amount'].str.replace(',', '').astype(int)
average_price = df['deal_amount_int'].mean()

print(f"삼성동 평균 실거래가: {average_price:,.0f}만원")

conn.close()
```

## 📈 모니터링 및 통계

### 실시간 진행률 확인
크롤링 중 로그 파일을 통해 실시간 진행률을 확인할 수 있습니다:

```bash
# 실시간 로그 확인
tail -f ultimate_crawling.log

# 통계 확인
grep "완료:" ultimate_crawling.log | tail -10
```

### 최종 통계 정보
```
=== Ultimate Real Estate Crawler 완료 ===
총 소요 시간: 1:23:45
네이버 처리: 성공 450, 실패 50
국토부 처리: 성공 95, 실패 5
데이터베이스 저장 효율: 99.2%
```

## 🛠️ 문제 해결

### 1. IP 차단 발생시
```python
# 딜레이 시간 증가
config.min_delay = 5.0
config.max_delay = 10.0
config.error_delay = 30.0

# 동시 처리 수 감소
config.max_concurrent_naver = 1
config.max_concurrent_molit = 1
```

### 2. 데이터베이스 오류시
```python
# 데이터베이스 연결 수 조정
config.db_max_connections = 10
config.db_max_retries = 100
```

### 3. 메모리 부족시
```python
# 배치 크기 조정
await crawler.run_ultimate_crawling(
    max_naver_regions=50,  # 줄이기
    max_molit_regions=20   # 줄이기
)
```

## 📝 로그 파일 구조

### ultimate_crawling.log
```
2024-01-15 10:30:15 - INFO - Ultimate Real Estate Crawler 시작
2024-01-15 10:30:16 - INFO - 네이버 세션 생성 완료
2024-01-15 10:30:17 - INFO - 네이버 완료: 서울특별시_강남구_삼성동_매매 - 25/30
2024-01-15 10:30:20 - INFO - 국토부 완료: 11680, 202401 - 150/150
2024-01-15 10:30:25 - INFO - 데이터베이스 저장 효율: 99.5%
```

## 🎯 성능 최적화 팁

### 1. 하드웨어 최적화
- **CPU**: 멀티코어 활용 (동시 처리 수 증가)
- **메모리**: 최소 8GB 권장
- **저장소**: SSD 권장 (데이터베이스 성능)

### 2. 네트워크 최적화
- **안정적인 인터넷 연결** 필수
- **VPN 사용시** 성능 저하 가능성
- **모바일 핫스팟 비권장**

### 3. 시간대 최적화
- **평일 오전 9-11시**: 서버 부하 낮음
- **주말 오후**: 서버 부하 높음
- **새벽 시간**: 가장 안정적

## 🔒 주의사항

### 1. 법적 주의사항
- 개인적 용도로만 사용
- 상업적 이용 금지
- 데이터 재배포 금지

### 2. 기술적 주의사항
- 과도한 요청으로 인한 IP 차단 가능
- 서버 정책 변경시 동작 불안정 가능
- 데이터 정확성 보장 불가

### 3. 권장 사항
- 테스트는 소규모로 시작
- 정기적인 데이터베이스 백업
- 로그 파일 정기적 확인

## 📞 지원 및 문의

### 로그 파일 위치
- `ultimate_crawling.log`: 전체 크롤링 로그
- `real_estate_crawling.db`: 수집된 데이터

### 문제 보고시 필요 정보
1. 사용한 설정 (크롤링 규모, 딜레이 등)
2. 오류 메시지
3. 로그 파일 일부
4. 시스템 환경 (OS, Python 버전)

---

**Happy Crawling! 🏠📊**