#!/usr/bin/env python3
"""
개선된 크롤러 테스트 - readonly 오류 해결
"""

import sqlite3
import asyncio
import time
import threading
from contextlib import contextmanager
from datetime import datetime

class ImprovedDatabaseManager:
    """개선된 데이터베이스 매니저 - readonly 오류 해결"""
    
    def __init__(self, db_path):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_database()
    
    def _init_database(self):
        """데이터베이스 초기화"""
        with self.lock:
            conn = sqlite3.connect(self.db_path, timeout=30)
            cursor = conn.cursor()
            
            # WAL 모드 활성화
            cursor.execute('PRAGMA journal_mode = WAL')
            cursor.execute('PRAGMA synchronous = NORMAL')
            cursor.execute('PRAGMA cache_size = 10000')
            cursor.execute('PRAGMA temp_store = MEMORY')
            
            conn.commit()
            conn.close()
    
    @contextmanager
    def get_connection(self):
        """안전한 데이터베이스 연결"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=30)
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA synchronous = NORMAL')
            yield conn
        except sqlite3.OperationalError as e:
            if "readonly" in str(e).lower():
                print(f"Readonly 오류 발생, 재시도 중...")
                time.sleep(1)
                conn = sqlite3.connect(self.db_path, timeout=30)
                conn.execute('PRAGMA journal_mode = WAL')
                yield conn
            else:
                raise
        finally:
            if conn:
                conn.close()
    
    def safe_execute(self, query, params=None, retries=3):
        """안전한 쿼리 실행"""
        for attempt in range(retries):
            try:
                with self.get_connection() as conn:
                    cursor = conn.cursor()
                    if params:
                        cursor.execute(query, params)
                    else:
                        cursor.execute(query)
                    conn.commit()
                    return cursor.fetchall()
            except sqlite3.OperationalError as e:
                if "readonly" in str(e).lower() and attempt < retries - 1:
                    print(f"Readonly 오류 재시도 {attempt + 1}/{retries}")
                    time.sleep(2 ** attempt)
                    continue
                else:
                    raise

async def test_improved_crawler():
    """개선된 크롤러 테스트"""
    print("개선된 크롤러 테스트 시작...")
    
    db_manager = ImprovedDatabaseManager("real_estate_crawling.db")
    
    # 동시 크롤링 시뮬레이션
    async def simulate_crawling(region_id):
        """크롤링 시뮬레이션"""
        try:
            # 크롤링 시작 기록
            start_time = datetime.now()
            db_manager.safe_execute(
                "INSERT INTO crawling_progress (city, gu, dong, trade_type, status, crawl_start_time) VALUES (?, ?, ?, ?, ?, ?)",
                ("테스트", "테스트", f"동{region_id}", "매매", "processing", start_time)
            )
            
            # 크롤링 시뮬레이션 (짧은 대기)
            await asyncio.sleep(0.1)
            
            # 아파트 데이터 저장 시뮬레이션
            for i in range(5):  # 5개 아파트 시뮬레이션
                db_manager.safe_execute(
                    "INSERT OR REPLACE INTO apartment_complexes (complex_id, complex_name, city, gu, dong, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (f"TEST_{region_id}_{i}", f"테스트아파트{region_id}_{i}", "테스트", "테스트", f"동{region_id}", 37.5 + region_id * 0.01, 127.0 + region_id * 0.01, datetime.now())
                )
            
            # 크롤링 완료 기록
            end_time = datetime.now()
            db_manager.safe_execute(
                "UPDATE crawling_progress SET status = ?, crawl_end_time = ?, apartment_count = ? WHERE city = ? AND gu = ? AND dong = ? AND trade_type = ?",
                ("completed", end_time, 5, "테스트", "테스트", f"동{region_id}", "매매")
            )
            
            print(f"지역 {region_id} 크롤링 완료")
            return True
            
        except Exception as e:
            print(f"지역 {region_id} 크롤링 실패: {e}")
            
            # 실패 기록
            db_manager.safe_execute(
                "UPDATE crawling_progress SET status = ?, error_message = ? WHERE city = ? AND gu = ? AND dong = ? AND trade_type = ?",
                ("failed", str(e), "테스트", "테스트", f"동{region_id}", "매매")
            )
            return False
    
    # 10개 지역 동시 크롤링 테스트
    print("10개 지역 동시 크롤링 테스트...")
    tasks = []
    for i in range(10):
        task = asyncio.create_task(simulate_crawling(i))
        tasks.append(task)
    
    start_time = time.time()
    results = await asyncio.gather(*tasks)
    end_time = time.time()
    
    success_count = sum(1 for r in results if r)
    print(f"테스트 결과: {success_count}/10 성공")
    print(f"소요 시간: {end_time - start_time:.2f}초")
    
    # 결과 확인
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes WHERE city = '테스트'")
        apt_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM crawling_progress WHERE city = '테스트'")
        progress_count = cursor.fetchone()[0]
        
        print(f"저장된 아파트: {apt_count}개")
        print(f"진행 기록: {progress_count}개")
    
    # 테스트 데이터 정리
    db_manager.safe_execute("DELETE FROM apartment_complexes WHERE city = '테스트'")
    db_manager.safe_execute("DELETE FROM crawling_progress WHERE city = '테스트'")
    
    print("테스트 완료 및 데이터 정리됨")
    
    return success_count == 10

if __name__ == "__main__":
    result = asyncio.run(test_improved_crawler())
    if result:
        print("\n✅ 개선된 크롤러 테스트 성공!")
        print("readonly 오류 해결됨")
    else:
        print("\n❌ 테스트 실패")