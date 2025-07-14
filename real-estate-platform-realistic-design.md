# 부동산 시장 분석 플랫폼 - 현실적 설계서 v2.0

## 📋 프로젝트 개요

### 🎯 프로젝트 목적
부동산 개발자들이 잠재적 개발 부지를 효율적으로 조사하고 분석할 수 있도록 지원하는 **데이터 중심 분석 플랫폼** 구축

### 🏗️ 현재 진행 상황 (2025년 7월 14일 기준)
- ✅ **네이버 부동산 크롤링 시스템** 완성 (서울/부산/인천 지원)
- ✅ **SQLite 기반 데이터 저장** 시스템 구축
- ✅ **Supabase 데이터베이스** 연동 완료
- 🔄 **전국 크롤링** 진행 중 (127/229 지역 처리)
- 🔄 **로컬 데이터 수집** 진행 중 (237KB 저장)

### 🎯 핵심 가치 (현실 버전)
- **데이터 우선**: 크롤링 가능한 지역부터 점진적 확장
- **실용성**: 완벽한 전국 커버리지보다 활용 가능한 데이터 집중
- **안정성**: 크롤링 차단 방지 및 데이터 품질 보장

---

## 🏗️ 실제 시스템 아키텍처

### 현재 구현된 아키텍처
```
┌─────────────────────────────────────────────────┐
│                Data Collection Layer             │
│         (Python + AsyncIO + SQLite)             │
├─────────────────────────────────────────────────┤
│  • Naver Crawler (서울/부산/인천)               │
│  • IP 차단 방지 (10-15초 랜덤 딜레이)           │
│  • 실시간 로그 및 진행상황 추적                  │
│  • 중복 방지 및 데이터 품질 검증               │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│                Storage Layer                     │
│         (SQLite + Supabase Hybrid)              │
├─────────────────────────────────────────────────┤
│  • 로컬 SQLite (실시간 수집)                    │
│  • Supabase PostgreSQL (최종 저장)              │
│  • 진행상황 JSON 파일 (crawling_progress.json)  │
└─────────────────────────────────────────────────┘
```

### 향후 확장 계획
```
┌─────────────────────────────────────────────────┐
│                Frontend Layer                    │
│         (React.js + TypeScript)                 │
└─────────────────────┬───────────────────────────┘
                      │ REST API
┌─────────────────────┴───────────────────────────┐
│                Backend Layer                     │
│         (Node.js + Express.js)                  │
├─────────────────────────────────────────────────┤
│  • 크롤링 데이터 API 서빙                      │
│  • 검색 및 필터링 기능                          │
│  • 지역별/가격대별 분석                         │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│                Database Layer                    │
│         (Supabase PostgreSQL)                   │
├─────────────────────────────────────────────────┤
│  • 아파트 단지 정보                            │
│  • 실거래가 데이터                              │
│  • 가격 트렌드 분석                            │
└─────────────────────────────────────────────────┘
```

---

## 🔧 현실적 기술 스택

### 데이터 수집 레이어 (현재 구현)
```python
# 핵심 기술 스택
- Python 3.11+
- AsyncIO (비동기 크롤링)
- SQLite (로컬 데이터 저장)
- Supabase Python SDK
- JSON (설정 및 진행상황)
- Logging (실시간 모니터링)
```

### 백엔드 레이어 (계획)
```javascript
// 기술 스택
- Node.js 18.x LTS
- Express.js + TypeScript
- Supabase 클라이언트
- Redis (캐싱)
- JWT 인증
```

### 프론트엔드 레이어 (계획)
```javascript
// 기술 스택
- React.js 18.x + TypeScript
- Material-UI v5
- Kakao Maps API
- Recharts (차트)
- Axios (HTTP 클라이언트)
```

### 배포 및 인프라 (계획)
```yaml
# 배포 스택
- Docker Compose
- Nginx (리버스 프록시)
- GitHub Actions (CI/CD)
- Supabase (데이터베이스)
```

---

## 📊 현재 데이터 현황

### 크롤링 지원 지역
```
✅ 완전 지원 (각 지역 500개 아파트 수집)
├── 서울특별시: 25개 구 (100% 완료)
├── 부산광역시: 16개 구 (100% 완료)
└── 인천광역시: 10개 구 (100% 완료)

❌ 현재 미지원 (크롤러 확장 필요)
├── 대구광역시: 8개 구
├── 광주광역시: 5개 구
├── 대전광역시: 5개 구
├── 울산광역시: 5개 구
├── 세종특별자치시: 1개 시
├── 경기도: 31개 시군
├── 강원도: 18개 시군
├── 충청북도: 11개 시군
├── 충청남도: 15개 시군
├── 전라북도: 14개 시군
├── 전라남도: 22개 시군
├── 경상북도: 23개 시군
├── 경상남도: 18개 시군
└── 제주특별자치도: 2개 시
```

### 데이터 품질 현황
```
📈 수집 통계 (2025년 7월 14일 기준)
├── 처리 완료: 127/229 지역 (55.5%)
├── 성공적 수집: 51개 지역 (서울/부산/인천)
├── 실패 지역: 76개 지역 (크롤러 미지원)
├── 총 수집 데이터: 약 25,500개 아파트 (51 × 500)
└── 데이터 크기: 237KB (SQLite)
```

---

## 🎯 현실적 개발 단계

### Phase 1: 데이터 수집 완성 (현재-2주)
```
🔄 현재 진행 중
├── 1.1 전국 크롤링 완료 (내일 오전 완료 예정)
├── 1.2 크롤러 지역 확장 개발
│   ├── 대구/광주/대전/울산 지원 추가
│   └── 경기도 주요 시 (수원/성남/고양/용인) 지원
├── 1.3 데이터 정리 및 품질 검증
│   ├── 중복 제거 및 데이터 정제
│   └── 건축년도, 가격 정보 검증
└── 1.4 Supabase 마이그레이션
    ├── SQLite → PostgreSQL 이전
    └── 데이터 스키마 최적화
```

### Phase 2: 백엔드 API 개발 (2-4주)
```
🎯 주요 목표
├── 2.1 Express.js 서버 구축
│   ├── 기본 REST API 설정
│   ├── Supabase 데이터베이스 연결
│   └── 인증 및 보안 미들웨어
├── 2.2 핵심 API 엔드포인트
│   ├── 아파트 검색 API
│   ├── 지역별 가격 분석 API
│   ├── 단지 상세 정보 API
│   └── 데이터 내보내기 API
└── 2.3 데이터 처리 서비스
    ├── 가격 트렌드 분석
    ├── 지역별 시장 분석
    └── 재건축 후보 분석
```

### Phase 3: 프론트엔드 개발 (4-6주)
```
🎯 주요 목표
├── 3.1 React.js 앱 초기화
│   ├── TypeScript + Material-UI 설정
│   ├── 라우팅 구조 설정
│   └── 상태 관리 (Redux Toolkit)
├── 3.2 핵심 UI 컴포넌트
│   ├── 아파트 검색 및 필터
│   ├── 데이터 테이블 및 차트
│   ├── 지역별 가격 비교
│   └── 재건축 분석 대시보드
└── 3.3 지도 연동 (선택사항)
    ├── Kakao Maps API 연동
    ├── 아파트 위치 시각화
    └── 지역별 클러스터링
```

### Phase 4: 배포 및 최적화 (1-2주)
```
🎯 주요 목표
├── 4.1 Docker 컨테이너화
│   ├── 프론트엔드/백엔드 Docker 이미지
│   └── Docker Compose 설정
├── 4.2 CI/CD 파이프라인
│   ├── GitHub Actions 설정
│   └── 자동 배포 스크립트
└── 4.3 모니터링 및 로깅
    ├── 에러 추적 시스템
    └── 성능 모니터링
```

---

## 🗄️ 데이터베이스 설계 (현실 버전)

### 현재 SQLite 스키마
```sql
-- 아파트 단지 정보
CREATE TABLE apartment_complexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id TEXT UNIQUE NOT NULL,
    complex_name TEXT NOT NULL,
    address_road TEXT,
    city TEXT,
    gu TEXT,
    latitude REAL,
    longitude REAL,
    total_units INTEGER,
    construction_year INTEGER,
    last_transaction_price INTEGER,
    source_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 향후 Supabase 스키마 확장
```sql
-- 기본 아파트 정보
CREATE TABLE apartments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complex_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address JSONB NOT NULL,
    city TEXT NOT NULL,
    gu TEXT NOT NULL,
    coordinates POINT,
    total_units INTEGER,
    construction_year INTEGER,
    parking_ratio DECIMAL(3,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 가격 데이터
CREATE TABLE price_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id UUID REFERENCES apartments(id),
    transaction_price BIGINT,
    transaction_date DATE,
    area_sqm DECIMAL(6,2),
    floor_number INTEGER,
    deal_type TEXT CHECK (deal_type IN ('매매', '전세', '월세')),
    data_source TEXT DEFAULT 'naver',
    created_at TIMESTAMP DEFAULT NOW()
);

-- 가격 트렌드 (월별 집계)
CREATE TABLE price_trends (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id UUID REFERENCES apartments(id),
    month DATE NOT NULL,
    avg_price BIGINT,
    median_price BIGINT,
    transaction_count INTEGER,
    price_change_rate DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 재건축 후보 분석
CREATE TABLE redevelopment_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    apartment_id UUID REFERENCES apartments(id),
    age_years INTEGER,
    avg_price_per_sqm BIGINT,
    redevelopment_score DECIMAL(3,2),
    potential_profit BIGINT,
    analysis_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🚀 API 설계 (현실 버전)

### 핵심 엔드포인트
```typescript
// 아파트 검색 및 필터링
GET /api/v1/apartments
  Query: {
    city?: string;
    gu?: string;
    minPrice?: number;
    maxPrice?: number;
    constructionYear?: number;
    page?: number;
    limit?: number;
  }
  Response: {
    data: Apartment[];
    pagination: PaginationInfo;
  }

// 아파트 상세 정보
GET /api/v1/apartments/:id
  Response: {
    apartment: ApartmentDetail;
    priceHistory: PriceData[];
    nearbyApartments: Apartment[];
  }

// 지역별 시장 분석
GET /api/v1/analytics/region/:city/:gu
  Response: {
    averagePrice: number;
    medianPrice: number;
    priceRange: { min: number; max: number };
    totalUnits: number;
    apartmentCount: number;
  }

// 재건축 후보 분석
GET /api/v1/analytics/redevelopment
  Query: {
    city?: string;
    gu?: string;
    minAge?: number;
    maxPrice?: number;
  }
  Response: {
    candidates: RedevelopmentCandidate[];
    summary: RedevelopmentSummary;
  }

// 데이터 내보내기
POST /api/v1/export/csv
  Body: {
    filters: SearchFilters;
    fields: string[];
  }
  Response: {
    downloadUrl: string;
    expiresAt: string;
  }
```

---

## 🎨 UI/UX 설계 (현실 버전)

### 메인 대시보드
```
┌─────────────────────────────────────────────────┐
│  🏠 부동산 시장 분석 플랫폼                     │
├─────────────────────────────────────────────────┤
│  📊 전체 통계                                   │
│  ├── 총 아파트 수: 25,500개                     │
│  ├── 지원 지역: 51개 (서울/부산/인천)           │
│  └── 평균 가격: 14.2억원                        │
├─────────────────────────────────────────────────┤
│  🔍 검색 및 필터                                │
│  ├── 지역 선택: [서울] [부산] [인천]            │
│  ├── 가격 범위: [5억] ~ [50억]                  │
│  └── 건축년도: [1980] ~ [2025]                  │
├─────────────────────────────────────────────────┤
│  📈 인기 지역 TOP 10                            │
│  ├── 1. 서울 강남구 (평균 25.8억)               │
│  ├── 2. 서울 서초구 (평균 22.4억)               │
│  └── ...                                        │
└─────────────────────────────────────────────────┘
```

### 아파트 검색 결과
```
┌─────────────────────────────────────────────────┐
│  🏠 검색 결과 (1,234개 아파트)                  │
├─────────────────────────────────────────────────┤
│  📊 정렬: [가격순] [최신순] [거리순]             │
│  📝 필터: 재건축 후보만 [ ] 신축 5년 이내 [ ]   │
├─────────────────────────────────────────────────┤
│  🏢 래미안 강남 포레스트                        │
│  ├── 위치: 서울 강남구 도곡동                   │
│  ├── 가격: 15.8억 ~ 42.3억                      │
│  ├── 건축: 2018년 (7년)                         │
│  └── 세대: 1,234세대                            │
│  ────────────────────────────────────────────── │
│  🏢 정든마을 아파트                             │
│  ├── 위치: 서울 성남구 분당구                   │
│  ├── 가격: 8.5억 ~ 22.1억                       │
│  ├── 건축: 1995년 (30년) [재건축 후보]          │
│  └── 세대: 298세대                              │
└─────────────────────────────────────────────────┘
```

### 재건축 분석 대시보드
```
┌─────────────────────────────────────────────────┐
│  🏗️ 재건축 후보 분석                           │
├─────────────────────────────────────────────────┤
│  📊 분석 조건                                   │
│  ├── 건축년도: 30년 이상                        │
│  ├── 평균 가격: 시세 대비 70% 이하              │
│  └── 단지 규모: 200세대 이상                    │
├─────────────────────────────────────────────────┤
│  🎯 재건축 점수 TOP 10                          │
│  ├── 1. 정든마을 (95점) - 분당구               │
│  │   ├── 건축: 1995년 (30년)                   │
│  │   ├── 현재가: 평균 14.1억                   │
│  │   └── 예상수익: 8.5억 (60% 상승)            │
│  ├── 2. 한신아파트 (92점) - 강남구              │
│  └── ...                                        │
└─────────────────────────────────────────────────┘
```

---

## 🚀 배포 및 운영 (현실 버전)

### 개발 환경
```bash
# 로컬 개발 환경
├── Python 3.11+ (크롤링)
├── Node.js 18+ (백엔드)
├── React.js 18+ (프론트엔드)
├── SQLite (로컬 데이터)
├── Supabase (클라우드 데이터베이스)
└── Docker Compose (통합 개발환경)
```

### 배포 환경 (단계별)
```yaml
# docker-compose.yml
version: '3.8'
services:
  # 크롤링 서비스
  crawler:
    build: ./crawler
    volumes:
      - ./data:/app/data
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
    restart: unless-stopped
  
  # 백엔드 API
  backend:
    build: ./backend
    ports:
      - "4000:4000"
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_KEY=${SUPABASE_KEY}
    depends_on:
      - redis
  
  # 프론트엔드
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - REACT_APP_API_URL=http://backend:4000
  
  # 캐시
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

---

## 💡 현실적 고려사항 및 제약

### 기술적 제약
```
🚫 현재 제약사항
├── 크롤링 지역 제한 (서울/부산/인천만 지원)
├── 네이버 부동산 IP 차단 위험
├── 실시간 데이터 업데이트 불가
└── 지도 기반 검색 기능 부재 (PostGIS 미사용)

✅ 현실적 해결책
├── 지원 지역 점진적 확장
├── 안전한 크롤링 주기 설정 (일 1회)
├── 정적 데이터 분석 중심 접근
└── 주소 기반 검색으로 대체
```

### 리소스 제약
```
💰 비용 최적화
├── Supabase 무료 플랜 활용 (500MB 제한)
├── Vercel/Netlify 무료 호스팅
├── GitHub Actions 무료 CI/CD
└── 초기 운영비용 최소화 ($0-50/월)

⏰ 개발 시간
├── 1인 개발 기준 설계
├── 핵심 기능 우선 개발
├── 점진적 기능 확장
└── 총 개발 기간: 8-10주
```

---

## 📈 성공 지표 및 마일스톤

### Phase 1 성공 지표
```
✅ 데이터 수집 완성
├── 지원 지역 데이터 100% 수집
├── 데이터 품질 95% 이상
├── 크롤링 안정성 99% 이상
└── Supabase 마이그레이션 완료
```

### Phase 2 성공 지표
```
✅ 백엔드 API 완성
├── 핵심 API 엔드포인트 5개 이상
├── 응답 시간 500ms 이하
├── 동시 접속자 100명 지원
└── 데이터 정확도 99% 이상
```

### Phase 3 성공 지표
```
✅ 프론트엔드 완성
├── 반응형 UI 완성
├── 검색 성능 1초 이내
├── 사용자 경험 최적화
└── 모바일 호환성 100%
```

---

## 🎯 결론 및 다음 단계

### 현실적 목표
이 프로젝트는 **완벽한 전국 부동산 플랫폼**보다는 **실용적인 데이터 분석 도구**를 목표로 합니다.

### 즉시 실행 가능한 다음 단계
1. **현재 크롤링 완료** (내일 오전)
2. **데이터 정리 및 Supabase 이전** (2-3일)
3. **백엔드 API 기본 구조** 개발 시작 (1주)
4. **간단한 검색 UI** 프로토타입 (2주)

### 장기 비전
수집된 데이터를 기반으로 **재건축 후보 분석**, **지역별 시장 트렌드**, **투자 가치 평가** 등의 고급 분석 기능을 단계적으로 추가하여 실질적인 부동산 투자 의사결정 도구로 발전시킵니다.

---

*📅 작성일: 2025년 7월 14일*  
*🚀 버전: v2.0 (현실적 설계)*  
*👥 작성자: 지쿠 & 클로디*