# 📚 부동산 플랫폼 가이드

## 🎯 프로젝트 가이드 통합 문서

이 문서는 부동산 시장 분석 플랫폼의 모든 가이드를 통합하여 제공합니다.

---

## 🚀 빠른 시작 가이드

### 1. 시스템 요구사항
```bash
# 필수 환경
- Python 3.11+
- Node.js 18.x+ (계획)
- Git 2.x+
- 8GB+ RAM 권장
- 2GB+ 디스크 여유공간

# 추천 환경
- macOS/Linux (Windows WSL 지원)
- Visual Studio Code
- Docker Desktop
```

### 2. 프로젝트 설치
```bash
# 1. 저장소 클론
git clone <repository-url>
cd real-estate-platform

# 2. 크롤링 환경 설정
cd modules/naver-crawler
pip install -r requirements.txt
playwright install chromium

# 3. 데이터 확인
ls -la data/
sqlite3 data/naver_real_estate.db ".schema"
```

### 3. 첫 번째 크롤링 실행
```python
# 단일 단지 크롤링 테스트
import asyncio
from core.enhanced_naver_crawler import crawl_enhanced_single

async def test_crawl():
    url = "https://new.land.naver.com/complexes/2592"
    result = await crawl_enhanced_single(url, "정든한진6차")
    print(f"크롤링 성공: {result['success']}")
    print(f"매물 수: {result['data_summary']['listings_count']}")

asyncio.run(test_crawl())
```

---

## 🗄️ 데이터베이스 가이드

### SQLite 데이터베이스 사용법

#### 1. 기본 연결
```bash
# 데이터베이스 접속
sqlite3 modules/naver-crawler/data/naver_real_estate.db

# 테이블 목록 확인
.tables

# 스키마 확인
.schema apartment_complexes
```

#### 2. 주요 쿼리 예시
```sql
-- 전체 단지 수 확인
SELECT COUNT(*) FROM apartment_complexes;

-- 지역별 단지 분포
SELECT 
    SUBSTR(address, 1, 6) as region,
    COUNT(*) as count
FROM apartment_complexes 
WHERE address IS NOT NULL
GROUP BY region
ORDER BY count DESC;

-- 매물 데이터 확인
SELECT 
    complex_id,
    COUNT(*) as listing_count
FROM current_listings
GROUP BY complex_id
ORDER BY listing_count DESC
LIMIT 10;

-- 가격 범위 분석
SELECT 
    MIN(CAST(price_info AS INTEGER)) as min_price,
    MAX(CAST(price_info AS INTEGER)) as max_price,
    AVG(CAST(price_info AS INTEGER)) as avg_price
FROM current_listings
WHERE price_info IS NOT NULL
AND price_info REGEXP '^[0-9]+$';
```

#### 3. 데이터 내보내기
```bash
# CSV 형태로 내보내기
sqlite3 -header -csv data/naver_real_estate.db \
  "SELECT * FROM apartment_complexes LIMIT 100;" \
  > apartment_complexes.csv

# 특정 조건 데이터 내보내기
sqlite3 -header -csv data/naver_real_estate.db \
  "SELECT ac.complex_name, ac.address, COUNT(cl.id) as listing_count
   FROM apartment_complexes ac
   LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
   GROUP BY ac.complex_id
   ORDER BY listing_count DESC;" \
  > complex_summary.csv
```

---

## 🔧 개발 환경 구성 가이드

### 1. Python 개발 환경
```bash
# 가상환경 생성 (권장)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows

# 의존성 설치
pip install -r requirements.txt

# 개발 의존성 추가 설치
pip install pytest black flake8 mypy
```

### 2. 개발 도구 설정
```bash
# VS Code 설정 (.vscode/settings.json)
{
    "python.defaultInterpreterPath": "./venv/bin/python",
    "python.linting.enabled": true,
    "python.linting.flake8Enabled": true,
    "python.formatting.provider": "black",
    "python.formatting.blackArgs": ["--line-length", "88"]
}

# Git 설정
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 3. 디버깅 설정
```json
// .vscode/launch.json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python: Crawler Debug",
            "type": "python",
            "request": "launch",
            "program": "${workspaceFolder}/modules/naver-crawler/core/enhanced_naver_crawler.py",
            "console": "integratedTerminal",
            "cwd": "${workspaceFolder}/modules/naver-crawler",
            "env": {
                "PYTHONPATH": "${workspaceFolder}/modules/naver-crawler"
            }
        }
    ]
}
```

---

## 🕷️ 크롤링 시스템 가이드

### 1. Enhanced Naver Crawler 사용법

#### 기본 사용 방법
```python
from core.enhanced_naver_crawler import EnhancedNaverCrawler

# 크롤러 초기화
crawler = EnhancedNaverCrawler(
    headless=True,      # 백그라운드 실행
    stealth_mode=True   # 스텔스 모드 활성화
)

# 단일 단지 크롤링
result = await crawler.crawl_complex_enhanced(
    url="https://new.land.naver.com/complexes/2592",
    name="정든한진6차"
)

print(f"크롤링 성공: {result['success']}")
print(f"수집 매물: {result['data_summary']['listings_count']}개")
```

#### 대규모 크롤링
```python
from core.full_scale_crawler import FullScaleCrawler

# 대규모 크롤러 초기화
crawler = FullScaleCrawler()

# 복수 단지 크롤링
complex_ids = [2592, 1234, 5678]
await crawler.crawl_all_complexes(complex_ids, batch_size=10)
```

### 2. 중복 제거 시스템
```python
from core.duplicate_detector import DuplicateDetector, remove_duplicates_from_listings

# 중복 제거 시스템 초기화
detector = DuplicateDetector()

# 매물 데이터 중복 제거
listings = [...]  # 크롤링된 매물 데이터
unique_listings, report = remove_duplicates_from_listings(listings)

print(f"원본: {len(listings)}개")
print(f"중복 제거 후: {len(unique_listings)}개")
print(f"중복 제거율: {report['duplicate_rate']:.1f}%")
```

### 3. 스텔스 모드 설정
```python
# 스텔스 모드 고급 설정
crawler = EnhancedNaverCrawler(
    headless=True,
    stealth_mode=True
)

# 수동 스텔스 설정
await crawler.init_stealth_browser()
await crawler.human_like_delay(3, 7)  # 3-7초 랜덤 대기
await crawler.simulate_human_behavior()  # 마우스 이동, 스크롤 등
```

---

## 📊 데이터 분석 가이드

### 1. 기본 데이터 분석
```python
import sqlite3
import pandas as pd

# 데이터베이스 연결
conn = sqlite3.connect('data/naver_real_estate.db')

# 단지별 매물 수 분석
df = pd.read_sql_query("""
    SELECT 
        ac.complex_name,
        ac.address,
        COUNT(cl.id) as listing_count,
        AVG(CAST(cl.price_info AS INTEGER)) as avg_price
    FROM apartment_complexes ac
    LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
    WHERE cl.price_info IS NOT NULL
    GROUP BY ac.complex_id
    ORDER BY listing_count DESC
""", conn)

print(df.head())
```

### 2. 가격 분석
```python
# 가격 분포 분석
price_analysis = pd.read_sql_query("""
    SELECT 
        CASE 
            WHEN CAST(price_info AS INTEGER) < 50000 THEN '5억 미만'
            WHEN CAST(price_info AS INTEGER) < 100000 THEN '5억-10억'
            WHEN CAST(price_info AS INTEGER) < 200000 THEN '10억-20억'
            ELSE '20억 이상'
        END as price_range,
        COUNT(*) as count
    FROM current_listings
    WHERE price_info IS NOT NULL
    AND price_info REGEXP '^[0-9]+$'
    GROUP BY price_range
""", conn)

print(price_analysis)
```

### 3. 지역별 분석
```python
# 지역별 평균 가격 분석
regional_analysis = pd.read_sql_query("""
    SELECT 
        SUBSTR(ac.address, 1, 6) as region,
        COUNT(DISTINCT ac.complex_id) as complex_count,
        COUNT(cl.id) as listing_count,
        AVG(CAST(cl.price_info AS INTEGER)) as avg_price
    FROM apartment_complexes ac
    LEFT JOIN current_listings cl ON ac.complex_id = cl.complex_id
    WHERE ac.address IS NOT NULL
    AND cl.price_info IS NOT NULL
    GROUP BY region
    ORDER BY avg_price DESC
""", conn)

print(regional_analysis)
```

---

## 🚀 배포 가이드

### 1. Docker 컨테이너 배포
```dockerfile
# Dockerfile 예시
FROM python:3.11-slim

WORKDIR /app

# 시스템 의존성 설치
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

# Python 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 코드 복사
COPY . .

# Playwright 브라우저 설치
RUN playwright install chromium

# 실행 명령
CMD ["python", "main.py"]
```

### 2. Docker Compose 설정
```yaml
version: '3.8'

services:
  crawler:
    build: .
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - PYTHONPATH=/app
      - HEADLESS=true
    restart: unless-stopped

  database:
    image: postgres:14
    environment:
      - POSTGRES_DB=real_estate
      - POSTGRES_USER=admin
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

### 3. 프로덕션 배포 체크리스트
```bash
# 1. 환경 변수 설정
export PYTHONPATH=/app
export HEADLESS=true
export DATABASE_URL=sqlite:///data/naver_real_estate.db

# 2. 의존성 확인
pip check

# 3. 테스트 실행
python -m pytest tests/

# 4. 백업 설정
tar -czf backup_$(date +%Y%m%d).tar.gz data/

# 5. 모니터링 설정
# 로그 파일 위치: logs/crawler.log
# 크롤링 진행 상황: data/progress.json
```

---

## 🔧 문제 해결 가이드

### 1. 일반적인 문제들

#### 크롤링 실패 문제
```python
# 문제: IP 차단 또는 네트워크 오류
# 해결: 대기 시간 증가, 재시도 로직 활성화

crawler = EnhancedNaverCrawler(
    headless=True,
    stealth_mode=True
)

# 더 안전한 크롤링
await crawler.human_like_delay(5, 10)  # 대기 시간 증가
```

#### 데이터베이스 락 문제
```python
# 문제: SQLite 데이터베이스 락 발생
# 해결: 트랜잭션 최적화, 연결 풀 사용

import sqlite3
import threading

# 스레드 안전한 연결
conn = sqlite3.connect('data/naver_real_estate.db', check_same_thread=False)
conn.execute('PRAGMA journal_mode=WAL')  # WAL 모드 활성화
```

#### 메모리 부족 문제
```python
# 문제: 대규모 크롤링 시 메모리 부족
# 해결: 배치 처리, 메모리 해제

from core.full_scale_crawler import FullScaleCrawler

crawler = FullScaleCrawler()
await crawler.crawl_all_complexes(
    complex_ids, 
    batch_size=5  # 배치 크기 줄이기
)
```

### 2. 디버깅 방법

#### 로그 확인
```python
import logging

# 디버그 로그 활성화
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# 크롤러 실행
crawler = EnhancedNaverCrawler()
```

#### 스크린샷 디버깅
```python
# 크롤링 과정 스크린샷 저장
await crawler.page.screenshot(path='debug_screenshot.png')

# 페이지 HTML 저장
html = await crawler.page.content()
with open('debug_page.html', 'w', encoding='utf-8') as f:
    f.write(html)
```

---

## 📈 성능 최적화 가이드

### 1. 크롤링 성능 향상
```python
# 병렬 크롤링 (주의: IP 차단 위험)
import asyncio
from concurrent.futures import ThreadPoolExecutor

async def parallel_crawl(urls, max_workers=3):
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        tasks = [
            loop.run_in_executor(executor, crawl_single_complex, url)
            for url in urls
        ]
        return await asyncio.gather(*tasks)
```

### 2. 데이터베이스 성능 향상
```sql
-- 인덱스 생성
CREATE INDEX idx_complex_id ON current_listings(complex_id);
CREATE INDEX idx_address ON apartment_complexes(address);
CREATE INDEX idx_created_at ON current_listings(created_at);

-- 분석 쿼리
ANALYZE;
```

### 3. 메모리 최적화
```python
# 메모리 효율적인 데이터 처리
import gc

async def process_large_dataset():
    for batch in get_batches(data, batch_size=100):
        process_batch(batch)
        gc.collect()  # 가비지 컬렉션 강제 실행
```

---

## 🔒 보안 가이드

### 1. 안전한 크롤링
```python
# 요청 제한
import time
import random

async def safe_crawl(url):
    # 랜덤 대기
    await asyncio.sleep(random.uniform(2, 5))
    
    # User-Agent 로테이션
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        # ... 더 많은 User-Agent
    ]
    
    ua = random.choice(user_agents)
    await page.set_extra_http_headers({'User-Agent': ua})
```

### 2. 데이터 보안
```python
# 민감한 데이터 암호화
import hashlib

def hash_sensitive_data(data):
    return hashlib.sha256(data.encode()).hexdigest()

# 환경 변수 사용
import os
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///data/default.db')
```

---

## 📚 추가 리소스

### 1. 유용한 명령어
```bash
# 데이터 백업
tar -czf backup_$(date +%Y%m%d).tar.gz data/

# 로그 모니터링
tail -f logs/crawler.log

# 디스크 사용량 확인
du -sh data/

# 프로세스 모니터링
ps aux | grep python
```

### 2. 개발 도구
- **VS Code Extensions**: Python, SQLite Viewer
- **Chrome DevTools**: 네트워크 분석, 요소 검사
- **Postman**: API 테스트
- **DBeaver**: 데이터베이스 GUI

### 3. 참고 문서
- [Playwright 공식 문서](https://playwright.dev/)
- [SQLite 공식 문서](https://sqlite.org/docs.html)
- [Python AsyncIO 가이드](https://docs.python.org/3/library/asyncio.html)

---

*📅 최종 업데이트: 2025년 7월 18일*  
*🔄 버전: v1.0*  
*📧 문의: GitHub Issues 활용*