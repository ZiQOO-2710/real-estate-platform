# 🖥️ 데스크탑 환경 이관 가이드

## 📋 개요
MacBook Air에서 완료된 대규모 크롤링 프로젝트를 데스크탑 환경으로 이관하여 24/7 크롤링 작업을 재개하는 가이드입니다.

## 🏆 MacBook 완료 성과
- **204개 아파트 단지** 크롤링 완료 (2025-07-21)
- **40MB+ 데이터베이스** 구축
- **Enhanced 2.0 스텔스 모드** 안정화
- **JSON + 스크린샷** 자동 저장 시스템

## 🚀 데스크탑 설정 단계

### 1. 프로젝트 다운로드
```bash
git clone https://github.com/ZiQOO-2710/real-estate-platform.git
cd real-estate-platform
git checkout macbookair  # MacBook 브랜치 사용
```

### 2. Python 환경 설정
```bash
# Python 3.11+ 필요
cd modules/naver-crawler
pip install -r requirements.txt
playwright install chromium
```

### 3. Node.js 환경 설정
```bash
# 루트 디렉토리에서
npm install
cd api && npm install
cd ../dashboard && npm install
```

### 4. 데이터베이스 확인
```bash
cd modules/naver-crawler/data
ls -la *.db
# naver_real_estate.db (40MB+) - 메인 데이터베이스
# full_scale_progress.db - 진행 상황 추적
# discovered_complexes.db - 발견된 단지 목록
```

## 🔧 크롤링 재개 방법

### Enhanced Crawler 실행
```bash
cd modules/naver-crawler
python -c "
import asyncio
from core.enhanced_naver_crawler import crawl_enhanced_single
asyncio.run(crawl_enhanced_single('https://new.land.naver.com/complexes/TARGET_ID'))
"
```

### 대량 크롤링 실행
```bash
# 진행 상황 확인
python -c "
import sqlite3
conn = sqlite3.connect('data/full_scale_progress.db')
cursor = conn.execute('SELECT status, COUNT(*) FROM crawling_progress GROUP BY status')
for row in cursor: print(row)
conn.close()
"

# 대량 크롤링 재개
python -c "
from core.full_scale_crawler import resume_crawling
resume_crawling()
"
```

## 📊 데이터 구조
```
modules/naver-crawler/data/
├── naver_real_estate.db      # 메인 데이터베이스 (40MB+)
├── full_scale_progress.db    # 크롤링 진행 상황
├── discovered_complexes.db   # 발견된 단지 목록
└── output/
    ├── enhanced_complex_*.json    # 수집된 단지 데이터
    └── enhanced_screenshot_*.png  # 스크린샷
```

## 🎯 크롤링 전략

### 우선순위 단지
1. **신규 발견 단지**: `discovered_complexes.db`에서 확인
2. **업데이트 필요**: 7일 이상 된 데이터
3. **고가치 지역**: 강남, 서초, 송파 등

### 성능 최적화
- **동시 실행**: 3-5개 브라우저 인스턴스
- **지연 시간**: 2-5초 랜덤 지연
- **재시도 로직**: 실패 시 3회 자동 재시도
- **리소스 모니터링**: CPU/메모리 사용량 추적

## 🔍 모니터링

### 실시간 진행 상황
```bash
# 오늘 수집 현황
ls -la modules/naver-crawler/data/output/ | grep $(date +%Y%m%d) | wc -l

# 데이터베이스 크기 확인
du -h modules/naver-crawler/data/*.db

# 최신 수집 데이터
ls -lat modules/naver-crawler/data/output/ | head -10
```

### 품질 검증
```bash
# JSON 파일 무결성 검사
python -c "
import json
import os
output_dir = 'modules/naver-crawler/data/output'
valid_files = 0
for f in os.listdir(output_dir):
    if f.endswith('.json'):
        try:
            with open(os.path.join(output_dir, f)) as file:
                json.load(file)
            valid_files += 1
        except: pass
print(f'Valid JSON files: {valid_files}')
"
```

## 🚨 트러블슈팅

### 일반적인 문제
1. **브라우저 감지**: User-Agent 교체, 창 크기 변경
2. **네트워크 오류**: 자동 재시도, IP 로테이션 검토
3. **메모리 부족**: 배치 크기 축소, 정기적 재시작
4. **데이터베이스 락**: 동시 접근 제한, 트랜잭션 최적화

### 복구 방법
```bash
# 데이터베이스 백업
cp modules/naver-crawler/data/naver_real_estate.db backup_$(date +%Y%m%d).db

# 손상된 데이터 복구
python core/json_to_db_converter.py

# 크롤링 재시작
python core/full_scale_crawler.py --resume --safe-mode
```

## 🎯 목표

### 단기 목표 (1주일)
- [ ] 데스크탑 환경 완전 설정
- [ ] 기존 204개 단지 데이터 검증
- [ ] 신규 100개 단지 발굴
- [ ] API/Dashboard 연동 테스트

### 중기 목표 (1개월)
- [ ] 1,000개 단지 데이터베이스 구축
- [ ] 실시간 매물 업데이트 시스템
- [ ] 자동화된 품질 검증
- [ ] 성능 최적화 완료

## 📞 지원

문제 발생 시:
1. GitHub Issues: https://github.com/ZiQOO-2710/real-estate-platform/issues
2. 로그 파일 확인: `modules/naver-crawler/logs/`
3. 데이터베이스 상태 검증: `check_database_status.py`

---
*🎯 Generated with [Claude Code](https://claude.ai/code)*