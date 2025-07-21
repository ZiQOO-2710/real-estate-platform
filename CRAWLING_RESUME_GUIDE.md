# 🚀 크롤링 재개 상세 가이드

## 📊 현재 상태 점검

### MacBook에서 완료된 성과
- **수집 완료**: 204개 단지 (2025-07-21)
- **데이터베이스**: 40MB+ 확장
- **출력 형식**: JSON + PNG 스크린샷
- **품질**: Enhanced 2.0 검증 완료

## 🎯 데스크탑에서 재개할 작업

### 1. 즉시 실행 가능한 크롤러들

#### Enhanced Single Crawler
```python
import asyncio
from core.enhanced_naver_crawler import crawl_enhanced_single

# 단일 단지 크롤링
async def crawl_single():
    result = await crawl_enhanced_single('https://new.land.naver.com/complexes/1026')
    print(f"수집 완료: {result}")

asyncio.run(crawl_single())
```

#### Batch Crawler 
```python
from core.full_scale_crawler import FullScaleCrawler

# 배치 크롤링 (10개씩)
crawler = FullScaleCrawler()
crawler.crawl_batch(start_id=1026, end_id=1035)
```

### 2. 데이터베이스 기반 크롤링

#### 진행 상황 확인
```python
import sqlite3

def check_progress():
    conn = sqlite3.connect('modules/naver-crawler/data/full_scale_progress.db')
    cursor = conn.execute('''
        SELECT status, COUNT(*) as count 
        FROM crawling_progress 
        GROUP BY status
    ''')
    for row in cursor:
        print(f"{row[0]}: {row[1]}개")
    conn.close()

check_progress()
```

#### 미완료 단지 재개
```python
def resume_incomplete():
    conn = sqlite3.connect('modules/naver-crawler/data/full_scale_progress.db')
    cursor = conn.execute('''
        SELECT complex_id 
        FROM crawling_progress 
        WHERE status IN ('pending', 'failed')
        LIMIT 50
    ''')
    
    incomplete_ids = [row[0] for row in cursor]
    conn.close()
    
    print(f"재개할 단지: {len(incomplete_ids)}개")
    return incomplete_ids

resume_incomplete()
```

## ⚙️ 고급 크롤링 설정

### 성능 최적화 설정
```python
CRAWLING_CONFIG = {
    'concurrent_browsers': 3,        # 동시 브라우저 수
    'delay_range': (2, 5),          # 지연 시간 (초)
    'retry_attempts': 3,             # 재시도 횟수
    'timeout': 30,                   # 타임아웃 (초)
    'headless': True,               # 헤드리스 모드
    'user_agent_rotation': True,     # User-Agent 로테이션
    'proxy_rotation': False,         # 프록시 로테이션 (필요시)
}
```

### 스텔스 모드 강화
```python
STEALTH_CONFIG = {
    'viewport_size': (1920, 1080),
    'user_agents': [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
    ],
    'random_delays': True,
    'mouse_movements': True,
    'scroll_behavior': 'human-like'
}
```

## 📋 우선순위 크롤링 계획

### Phase 1: 기존 데이터 검증 (1-2일)
```python
# 기존 204개 단지 품질 검증
validation_ids = list(range(1, 26))  # 오늘 수집된 25개 단지
for complex_id in validation_ids:
    # JSON 파일 무결성 검사
    # 스크린샷 존재 여부 확인
    # 데이터베이스 일관성 검증
```

### Phase 2: 신규 단지 발굴 (3-5일)
```python
# 범위 확장: 1026-2000
discovery_range = range(1026, 2001)
for complex_id in discovery_range:
    # 단지 존재 여부 확인
    # 메타데이터 수집
    # 발견된 단지 DB 저장
```

### Phase 3: 대량 수집 (1-2주)
```python
# 발견된 모든 단지 데이터 수집
bulk_crawling_config = {
    'batch_size': 50,
    'parallel_workers': 5,
    'quality_threshold': 0.95,
    'auto_retry': True
}
```

## 🔍 실시간 모니터링

### 진행 상황 대시보드
```python
def show_dashboard():
    import time
    from datetime import datetime
    
    while True:
        os.system('clear')
        print(f"📊 크롤링 대시보드 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)
        
        # 오늘 수집 현황
        today = datetime.now().strftime('%Y%m%d')
        today_files = len([f for f in os.listdir('modules/naver-crawler/data/output/') 
                          if today in f and f.endswith('.json')])
        print(f"🔥 오늘 수집: {today_files}개")
        
        # 데이터베이스 크기
        db_size = os.path.getsize('modules/naver-crawler/data/naver_real_estate.db') / (1024*1024)
        print(f"💾 DB 크기: {db_size:.1f} MB")
        
        # 최근 수집 파일
        recent_files = sorted([f for f in os.listdir('modules/naver-crawler/data/output/') 
                             if f.endswith('.json')], reverse=True)[:3]
        print("📁 최근 파일:")
        for f in recent_files:
            print(f"   {f}")
        
        time.sleep(30)  # 30초마다 업데이트

# 백그라운드에서 실행
# show_dashboard()
```

### 오류 추적 시스템
```python
import logging
from datetime import datetime

# 로그 설정
logging.basicConfig(
    filename=f'modules/naver-crawler/logs/crawling_{datetime.now().strftime("%Y%m%d")}.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def log_crawler_status(complex_id, status, details=""):
    timestamp = datetime.now().isoformat()
    message = f"Complex {complex_id}: {status}"
    if details:
        message += f" - {details}"
    
    logging.info(message)
    print(f"[{timestamp}] {message}")
```

## 🎯 품질 관리

### 자동 품질 검증
```python
def quality_check(json_file_path):
    """JSON 파일 품질 검증"""
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 필수 필드 검증
        required_fields = ['crawler_info', 'basic_info', 'current_listings', 'statistics']
        score = 0
        
        for field in required_fields:
            if field in data:
                score += 0.25
        
        # 매물 데이터 품질 검증
        if data.get('current_listings'):
            if len(data['current_listings']) > 0:
                score += 0.25
                
        # 스크린샷 존재 여부
        screenshot_path = json_file_path.replace('.json', '.png').replace('enhanced_complex_', 'enhanced_screenshot_')
        if os.path.exists(screenshot_path):
            score += 0.25
            
        return score >= 0.75  # 75% 이상 품질
        
    except Exception as e:
        logging.error(f"Quality check failed for {json_file_path}: {e}")
        return False
```

## 🚨 장애 대응

### 자동 복구 시스템
```python
def auto_recovery():
    """크롤링 장애 시 자동 복구"""
    try:
        # 1. 브라우저 프로세스 정리
        os.system("pkill -f chromium")
        
        # 2. 데이터베이스 연결 재설정
        reconnect_database()
        
        # 3. 실패한 작업 재큐잉
        requeue_failed_tasks()
        
        # 4. 크롤러 재시작
        restart_crawler()
        
        logging.info("Auto recovery completed successfully")
        return True
        
    except Exception as e:
        logging.error(f"Auto recovery failed: {e}")
        return False
```

### 수동 복구 절차
1. **브라우저 정리**: `pkill -f chromium`
2. **데이터베이스 백업**: `cp naver_real_estate.db backup_$(date +%Y%m%d_%H%M).db`
3. **로그 분석**: `tail -f logs/crawling_$(date +%Y%m%d).log`
4. **재시작**: `python core/full_scale_crawler.py --resume --safe-mode`

## 📈 성능 목표

### 일일 목표
- **신규 수집**: 100-200개 단지/일
- **품질 점검**: 기존 데이터 10% 재검증
- **오류율**: <5%
- **가동시간**: >20시간/일

### 주간 목표
- **총 수집**: 500-1000개 단지
- **데이터베이스**: 100MB+ 확장
- **시스템 안정성**: 99%+ 가동률
- **품질 검증**: 전체 데이터 점검 완료

---
*🎯 Generated with [Claude Code](https://claude.ai/code)*