#!/usr/bin/env python3
"""
SQLite readonly database 오류 해결 스크립트
- WAL 모드 활성화
- 동시성 개선
- 데이터베이스 최적화
"""

import sqlite3
import os
import threading
import time
from contextlib import contextmanager

class DatabaseManager:
    def __init__(self, db_path):
        self.db_path = db_path
        self.lock = threading.Lock()
        self._init_database()
    
    def _init_database(self):
        """데이터베이스 초기화 및 최적화"""
        with self.lock:
            conn = sqlite3.connect(self.db_path, timeout=30)
            cursor = conn.cursor()
            
            # WAL 모드 활성화 (동시성 개선)
            cursor.execute('PRAGMA journal_mode = WAL')
            
            # 동기화 모드 설정 (성능 향상)
            cursor.execute('PRAGMA synchronous = NORMAL')
            
            # 캐시 크기 증가
            cursor.execute('PRAGMA cache_size = 10000')
            
            # 임시 저장소 메모리 사용
            cursor.execute('PRAGMA temp_store = MEMORY')
            
            # 페이지 크기 최적화
            cursor.execute('PRAGMA page_size = 4096')
            
            # 자동 VACUUM 활성화
            cursor.execute('PRAGMA auto_vacuum = INCREMENTAL')
            
            conn.commit()
            conn.close()
            
            print("데이터베이스 최적화 완료")
            print("- WAL 모드 활성화")
            print("- 동시성 개선")
            print("- 캐시 크기 증가")
            print("- 성능 최적화")
    
    @contextmanager
    def get_connection(self):
        """안전한 데이터베이스 연결 컨텍스트 매니저"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=30)
            # WAL 모드에서도 추가 안전성 보장
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA synchronous = NORMAL')
            yield conn
        except sqlite3.OperationalError as e:
            if "readonly" in str(e).lower():
                print(f"Readonly 오류 발생, 재시도 중...")
                time.sleep(1)
                # 재시도
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
                    print(f"Readonly 오류 (시도 {attempt + 1}/{retries}), 재시도 중...")
                    time.sleep(2 ** attempt)  # 지수적 백오프
                    continue
                else:
                    raise
    
    def batch_insert(self, table, data_list, batch_size=100):
        """배치 삽입으로 성능 개선"""
        for i in range(0, len(data_list), batch_size):
            batch = data_list[i:i + batch_size]
            try:
                with self.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.executemany(f"INSERT OR REPLACE INTO {table} VALUES ({','.join(['?' for _ in batch[0]])})", batch)
                    conn.commit()
            except sqlite3.OperationalError as e:
                if "readonly" in str(e).lower():
                    print(f"배치 삽입 readonly 오류, 개별 삽입으로 전환...")
                    for item in batch:
                        self.safe_execute(f"INSERT OR REPLACE INTO {table} VALUES ({','.join(['?' for _ in item])})", item)
                else:
                    raise

def fix_database():
    """데이터베이스 오류 수정"""
    db_path = "real_estate_crawling.db"
    
    print("SQLite readonly database 오류 수정 시작...")
    
    # 1. 파일 권한 확인
    if not os.path.exists(db_path):
        print(f"데이터베이스 파일이 없습니다: {db_path}")
        return False
    
    print(f"파일 크기: {os.path.getsize(db_path)} bytes")
    print(f"읽기 권한: {os.access(db_path, os.R_OK)}")
    print(f"쓰기 권한: {os.access(db_path, os.W_OK)}")
    
    # 2. 데이터베이스 최적화
    db_manager = DatabaseManager(db_path)
    
    # 3. 설정 확인
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute('PRAGMA journal_mode')
        journal_mode = cursor.fetchone()[0]
        
        cursor.execute('PRAGMA synchronous')
        synchronous = cursor.fetchone()[0]
        
        print(f"저널 모드: {journal_mode}")
        print(f"동기화 모드: {synchronous}")
    
    # 4. 동시성 테스트
    print("\n동시성 테스트 실행...")
    
    def test_write(thread_id):
        try:
            db_manager.safe_execute(
                "INSERT INTO crawling_progress (city, gu, dong, trade_type, status, crawl_start_time) VALUES (?, ?, ?, ?, ?, ?)",
                ("테스트", "테스트", f"테스트{thread_id}", "매매", "test", "2025-01-01 00:00:00")
            )
            return True
        except Exception as e:
            print(f"Thread {thread_id} 실패: {e}")
            return False
    
    # 동시 쓰기 테스트
    threads = []
    results = []
    
    for i in range(5):
        t = threading.Thread(target=lambda i=i: results.append(test_write(i)))
        threads.append(t)
        t.start()
    
    for t in threads:
        t.join()
    
    success_count = sum(1 for r in results if r)
    print(f"동시성 테스트: {success_count}/5 성공")
    
    # 5. 테스트 데이터 정리
    db_manager.safe_execute("DELETE FROM crawling_progress WHERE city = '테스트'")
    
    print("\n데이터베이스 수정 완료!")
    print("이제 크롤링 스크립트에서 DatabaseManager 클래스를 사용하세요.")
    
    return True

if __name__ == "__main__":
    fix_database()