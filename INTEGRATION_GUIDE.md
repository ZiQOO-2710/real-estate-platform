# 부동산 데이터 통합 시스템 가이드

## 📋 개요

이 시스템은 분산되어 있는 '단지정보', '매물호가', '실거래가' 세 종류의 부동산 데이터를 하나의 정규화된 데이터베이스로 통합합니다.

## 🏗️ 아키텍처

```
[네이버 크롤링 DB] ─┐
                   ├── [데이터 통합 파이프라인] ──> [통합 DB] ──> [통합 API]
[국토부 실거래 DB] ─┘
```

### 핵심 구성 요소

1. **DataIntegrationService**: 핵심 통합 로직
2. **DataValidationService**: 데이터 품질 검증
3. **통합 스키마**: 정규화된 테이블 구조
4. **통합 API**: 단일 엔드포인트로 모든 데이터 접근

## 🚀 빠른 시작

### 1. 의존성 설치

```bash
cd api
npm install sqlite3
```

### 2. 데이터 통합 실행

```bash
# 스크립트 실행 권한 부여
chmod +x src/scripts/integrateRealEstateData.js

# 데이터 통합 실행
node src/scripts/integrateRealEstateData.js
```

### 3. API 서버에 통합 라우터 추가

`api/src/server.js`에 추가:

```javascript
const integratedRoutes = require('./routes/integrated')
app.use('/api/integrated', integratedRoutes)
```

## 📊 데이터 매칭 전략

### 우선순위별 매칭 방법

1. **1순위: 좌표 매칭** (±11m 오차 허용)
   - Haversine 거리 계산
   - 신뢰도: 100%

2. **2순위: 지번 주소 매칭**
   - 주소 정규화 후 비교
   - 신뢰도: 90%

3. **3순위: 도로명 주소 매칭**
   - 표준화된 도로명 비교
   - 신뢰도: 85%

4. **4순위: 단지명 유사도 매칭**
   - Jaro-Winkler 알고리즘 (85% 이상)
   - 신뢰도: 80%

### 매칭 결과 예시

```sql
-- 매칭 성공 사례
SELECT 
  ac.complex_code,
  ac.name,
  COUNT(cl.id) as listings,
  COUNT(tr.id) as transactions
FROM apartment_complexes ac
LEFT JOIN current_listings cl ON ac.id = cl.apartment_complex_id
LEFT JOIN transaction_records tr ON ac.id = tr.apartment_complex_id
GROUP BY ac.id
HAVING listings > 0 OR transactions > 0;
```

## 🗄️ 통합 데이터베이스 스키마

### 핵심 테이블

```sql
-- 마스터 단지 테이블
apartment_complexes (1,430개 예상)
├── 기본정보: 단지명, 주소, 좌표
├── 상세정보: 준공년도, 세대수, 동수
└── 메타데이터: 데이터 출처, 신뢰도

-- 매물 호가 테이블  
current_listings (43,631개 예상)
├── 거래정보: 매매/전세/월세, 가격
├── 물리정보: 면적, 층수, 방향
└── 상태정보: 활성/완료/만료

-- 실거래가 테이블
transaction_records (977,388개 예상)
├── 거래정보: 거래일, 거래가격
├── 물리정보: 면적, 층수
└── 출처정보: 국토부/네이버/수동입력
```

### 관계 구조

```
apartment_complexes (1)
├── current_listings (N)
├── transaction_records (N)  
├── source_complex_mapping (N)
└── complex_name_history (N)
```

## 🔍 데이터 품질 보장

### 검증 단계

1. **필수 필드 검증**
   - 단지 ID, 좌표, 거래유형 등

2. **범위 검증**
   - 한국 영토 내 좌표
   - 합리적 가격 범위
   - 유효한 날짜 범위

3. **일관성 검증**
   - 매물-단지 연결성
   - 가격 이상치 탐지
   - 지역 정보 일치

4. **중복 제거**
   - 좌표 기반 중복 단지
   - 동일 매물 중복 등록

### 품질 점수 계산

```javascript
qualityScore = {
  overall: 85.2,        // 전체 점수
  validity: 92.1,       // 유효성 점수  
  issues: 78.3,         // 이슈 점수
  totalRecords: 1052049,
  validRecords: 968234,
  issueCount: 127
}
```

## 🔧 API 엔드포인트

### 통합 단지 검색

```http
GET /api/integrated/complexes?keyword=강남&dealType=매매&priceMin=30000&priceMax=100000
```

**응답 예시:**
```json
{
  "data": [
    {
      "id": 1,
      "complex_code": "강남구_A7F2B81E_1642384920",
      "name": "래미안강남팰리스",
      "latitude": 37.5172,
      "longitude": 127.0473,
      "listing_count": 24,
      "avg_listing_price": 85000,
      "avg_transaction_price": 82000
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "has_more": true }
}
```

### 단지 상세 정보

```http
GET /api/integrated/complexes/1
```

**응답 예시:**
```json
{
  "complex": {
    "id": 1,
    "name": "래미안강남팰리스",
    "total_households": 856,
    "completion_year": 2019
  },
  "current_listings": [
    {
      "deal_type": "매매",
      "price_sale": 85000,
      "area_exclusive": 84.5,
      "floor_current": 15
    }
  ],
  "recent_transactions": [
    {
      "deal_date": "2025-01-15",
      "deal_amount": 82000,
      "area_exclusive": 84.5
    }
  ],
  "price_analysis": {
    "avg_listing_price": 85000,
    "avg_transaction_price": 82000,
    "price_gap": 3000,
    "trend": "rising"
  }
}
```

### 가격 비교 분석

```http
GET /api/integrated/price-comparison?region=강남구&dealType=매매&months=12
```

### 시장 동향 분석

```http
GET /api/integrated/market-analysis?region=서울&period=12months
```

## ⚡ 성능 최적화

### 인덱스 설계

```sql
-- 지리적 검색 최적화
CREATE INDEX idx_complex_location ON apartment_complexes(latitude, longitude);

-- 가격별 검색 최적화  
CREATE INDEX idx_listing_price ON current_listings(deal_type, price_sale);

-- 날짜별 검색 최적화
CREATE INDEX idx_transaction_date ON transaction_records(deal_date);

-- 전문 검색 최적화
CREATE VIRTUAL TABLE complex_search USING fts5(complex_code, name, address_normalized);
```

### 쿼리 최적화 팁

1. **배치 처리 사용**
   ```javascript
   // 한 번에 1000개씩 처리
   for (let i = 0; i < data.length; i += 1000) {
     const batch = data.slice(i, i + 1000)
     await processBatch(batch)
   }
   ```

2. **트랜잭션 활용**
   ```javascript
   db.run('BEGIN TRANSACTION')
   // 여러 INSERT 작업
   db.run('COMMIT')
   ```

3. **메모리 관리**
   ```javascript
   // 대용량 데이터 스트리밍 처리
   const stream = db.each(query, [], (err, row) => {
     processRow(row)
   })
   ```

## 🔄 운영 및 유지보수

### 정기 데이터 동기화

```bash
# 크론탭 설정 (매일 새벽 2시)
0 2 * * * /usr/local/bin/node /path/to/integrateRealEstateData.js >> /var/log/data-integration.log 2>&1
```

### 모니터링 지표

1. **통합 성공률**: 매칭된 데이터 비율
2. **데이터 품질 점수**: 검증 통과율
3. **처리 속도**: 초당 레코드 처리 수
4. **오류율**: 실패한 레코드 비율

### 백업 및 복구

```bash
# 데이터베이스 백업
sqlite3 integrated_real_estate.db ".backup backup_$(date +%Y%m%d).db"

# 스키마만 백업
sqlite3 integrated_real_estate.db ".schema" > schema_backup.sql
```

## 🚨 문제 해결

### 일반적인 오류

1. **좌표 매칭 실패**
   ```
   원인: 잘못된 좌표 데이터
   해결: 지오코딩 API로 주소 → 좌표 변환
   ```

2. **가격 이상치**
   ```
   원인: 잘못 파싱된 가격 데이터
   해결: 가격 파싱 로직 개선
   ```

3. **메모리 부족**
   ```
   원인: 대용량 데이터 일괄 처리
   해결: 배치 크기 줄이기, 스트리밍 처리
   ```

### 디버깅 팁

```javascript
// 상세 로깅 활성화
const DEBUG = process.env.NODE_ENV === 'development'
if (DEBUG) {
  console.log('매칭 시도:', complex.complex_id, coordinates)
}

// 중간 결과 저장
await saveIntermediateResults(partialData)
```

## 📈 확장 방안

### 추가 데이터 소스 통합

1. **KB부동산**: 시세 정보
2. **다방/직방**: 임대 매물
3. **공공데이터**: 개발계획, 학군정보

### 고도화 기능

1. **AI 기반 가격 예측**
2. **실시간 시세 알림**
3. **투자 수익률 분석**
4. **지역별 상권 분석**

---

## 📞 지원

문제가 발생하거나 개선 제안이 있으시면 이슈를 등록해주세요.

**개발팀**: 지쿠 & 클로디 (Claude Code)  
**버전**: 1.0.0  
**최종 업데이트**: 2025-07-19