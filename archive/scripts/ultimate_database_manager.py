#!/usr/bin/env python3
"""
Ultimate Database Manager - 100% 저장 효율 달성
- 고급 재시도 로직
- 연결 풀링
- 트랜잭션 큐잉
- 자동 복구 시스템
"""

import sqlite3
import asyncio
import threading
import time
import queue
import json
from datetime import datetime
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

class UltimateDatabaseManager:
    """100% 저장 효율을 위한 고급 데이터베이스 매니저"""
    
    def __init__(self, db_path: str, max_connections: int = 5, max_retries: int = 10):
        self.db_path = db_path
        self.max_connections = max_connections
        self.max_retries = max_retries
        self.connection_pool = queue.Queue(maxsize=max_connections)
        self.transaction_queue = queue.Queue()
        self.failed_transactions = []
        self.lock = threading.RLock()
        self.stats = {
            'total_attempts': 0,
            'successful_saves': 0,
            'failed_saves': 0,
            'retries_used': 0
        }
        
        self._init_database()
        self._init_connection_pool()
        self._start_transaction_processor()
    
    def _init_database(self):
        """데이터베이스 초기화 및 최적화"""
        conn = sqlite3.connect(self.db_path, timeout=60)
        cursor = conn.cursor()
        
        # 고급 최적화 설정
        optimizations = [
            'PRAGMA journal_mode = WAL',
            'PRAGMA synchronous = NORMAL',
            'PRAGMA cache_size = 20000',
            'PRAGMA temp_store = MEMORY',
            'PRAGMA mmap_size = 268435456',  # 256MB
            'PRAGMA page_size = 4096',
            'PRAGMA auto_vacuum = INCREMENTAL',
            'PRAGMA wal_autocheckpoint = 1000',
            'PRAGMA journal_size_limit = 67108864',  # 64MB
            'PRAGMA busy_timeout = 30000'  # 30초
        ]
        
        for optimization in optimizations:
            cursor.execute(optimization)
        
        conn.commit()
        conn.close()
        print("Ultimate Database 최적화 완료")
    
    def _init_connection_pool(self):
        """연결 풀 초기화"""
        for _ in range(self.max_connections):
            conn = sqlite3.connect(self.db_path, timeout=60)
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA synchronous = NORMAL')
            conn.execute('PRAGMA busy_timeout = 30000')
            self.connection_pool.put(conn)
        print(f"연결 풀 초기화 완료: {self.max_connections}개 연결")
    
    def _start_transaction_processor(self):
        """백그라운드 트랜잭션 처리기 시작"""
        def process_transactions():
            while True:
                try:
                    transaction = self.transaction_queue.get(timeout=1)
                    if transaction is None:  # 종료 신호
                        break
                    
                    success = self._execute_transaction(transaction)
                    if not success:
                        self.failed_transactions.append(transaction)
                    
                    self.transaction_queue.task_done()
                except queue.Empty:
                    continue
                except Exception as e:
                    print(f"트랜잭션 처리 오류: {e}")
        
        self.transaction_thread = threading.Thread(target=process_transactions, daemon=True)
        self.transaction_thread.start()
        print("백그라운드 트랜잭션 처리기 시작")
    
    @contextmanager
    def get_connection(self):
        """연결 풀에서 안전한 연결 획득"""
        conn = None
        try:
            conn = self.connection_pool.get(timeout=30)
            yield conn
        except queue.Empty:
            # 풀이 비어있으면 새 연결 생성
            conn = sqlite3.connect(self.db_path, timeout=60)
            conn.execute('PRAGMA journal_mode = WAL')
            conn.execute('PRAGMA busy_timeout = 30000')
            yield conn
        finally:
            if conn:
                try:
                    self.connection_pool.put(conn, timeout=1)
                except queue.Full:
                    conn.close()
    
    def _execute_transaction(self, transaction: Dict[str, Any]) -> bool:
        """트랜잭션 실행 (재시도 로직 포함)"""
        query = transaction['query']
        params = transaction['params']
        transaction_id = transaction['id']
        
        for attempt in range(self.max_retries):
            try:
                with self.get_connection() as conn:
                    cursor = conn.cursor()
                    
                    # 트랜잭션 시작
                    cursor.execute('BEGIN IMMEDIATE')
                    
                    if isinstance(query, list):
                        # 배치 실행
                        for q, p in zip(query, params):
                            cursor.execute(q, p)
                    else:
                        # 단일 실행
                        cursor.execute(query, params)
                    
                    conn.commit()
                    
                    with self.lock:
                        self.stats['successful_saves'] += 1
                    
                    return True
                    
            except sqlite3.OperationalError as e:
                error_msg = str(e).lower()
                
                if attempt < self.max_retries - 1:
                    # 재시도 전 대기시간 (지수적 백오프 + 지터)
                    base_delay = 2 ** attempt
                    jitter = time.time() % 1  # 0-1초 랜덤 지터
                    delay = base_delay + jitter
                    
                    with self.lock:
                        self.stats['retries_used'] += 1
                    
                    print(f"트랜잭션 {transaction_id} 재시도 {attempt + 1}/{self.max_retries} (오류: {error_msg[:50]})")
                    
                    if "readonly" in error_msg or "locked" in error_msg:
                        # 데이터베이스 락 대기
                        time.sleep(delay)
                        
                        # WAL 체크포인트 강제 실행
                        try:
                            with self.get_connection() as conn:
                                conn.execute('PRAGMA wal_checkpoint(PASSIVE)')
                        except:
                            pass
                        
                        continue
                    elif "busy" in error_msg:
                        # 데이터베이스 사용 중 대기
                        time.sleep(delay * 2)
                        continue
                    else:
                        # 다른 오류는 즉시 재시도
                        time.sleep(delay / 2)
                        continue
                else:
                    # 최대 재시도 횟수 초과
                    with self.lock:
                        self.stats['failed_saves'] += 1
                    
                    print(f"트랜잭션 {transaction_id} 최종 실패: {error_msg}")
                    return False
                    
            except Exception as e:
                print(f"트랜잭션 {transaction_id} 예외 발생: {e}")
                with self.lock:
                    self.stats['failed_saves'] += 1
                return False
        
        return False
    
    def safe_execute(self, query: str, params: Optional[tuple] = None) -> bool:
        """안전한 쿼리 실행 (동기식)"""
        transaction = {
            'id': f"sync_{int(time.time() * 1000)}_{threading.current_thread().ident}",
            'query': query,
            'params': params or ()
        }
        
        with self.lock:
            self.stats['total_attempts'] += 1
        
        return self._execute_transaction(transaction)
    
    def queue_transaction(self, query: str, params: Optional[tuple] = None) -> str:
        """트랜잭션 큐에 추가 (비동기식)"""
        transaction = {
            'id': f"async_{int(time.time() * 1000)}_{threading.current_thread().ident}",
            'query': query,
            'params': params or ()
        }
        
        with self.lock:
            self.stats['total_attempts'] += 1
        
        self.transaction_queue.put(transaction)
        return transaction['id']
    
    def batch_execute(self, queries: List[str], params_list: List[tuple]) -> bool:
        """배치 실행"""
        transaction = {
            'id': f"batch_{int(time.time() * 1000)}_{threading.current_thread().ident}",
            'query': queries,
            'params': params_list
        }
        
        with self.lock:
            self.stats['total_attempts'] += len(queries)
        
        return self._execute_transaction(transaction)
    
    def retry_failed_transactions(self) -> int:
        """실패한 트랜잭션 재시도"""
        retry_count = 0
        failed_copy = self.failed_transactions[:]
        self.failed_transactions.clear()
        
        print(f"실패한 트랜잭션 {len(failed_copy)}개 재시도 중...")
        
        for transaction in failed_copy:
            if self._execute_transaction(transaction):
                retry_count += 1
            else:
                # 여전히 실패하면 다시 실패 목록에 추가
                self.failed_transactions.append(transaction)
        
        return retry_count
    
    def get_stats(self) -> Dict[str, Any]:
        """통계 정보 반환"""
        with self.lock:
            stats = self.stats.copy()
            stats['success_rate'] = (stats['successful_saves'] / stats['total_attempts'] * 100) if stats['total_attempts'] > 0 else 0
            stats['failed_transactions_count'] = len(self.failed_transactions)
            stats['queue_size'] = self.transaction_queue.qsize()
            return stats
    
    def wait_for_completion(self, timeout: int = 300):
        """모든 트랜잭션 완료 대기"""
        print("모든 트랜잭션 완료 대기 중...")
        start_time = time.time()
        
        while not self.transaction_queue.empty():
            if time.time() - start_time > timeout:
                print(f"타임아웃 발생 ({timeout}초)")
                break
            time.sleep(1)
        
        # 실패한 트랜잭션 재시도
        retry_count = self.retry_failed_transactions()
        if retry_count > 0:
            print(f"실패한 트랜잭션 {retry_count}개 재시도 성공")
        
        return self.get_stats()
    
    def close(self):
        """데이터베이스 매니저 종료"""
        # 트랜잭션 처리기 종료
        self.transaction_queue.put(None)
        self.transaction_thread.join(timeout=30)
        
        # 연결 풀 정리
        while not self.connection_pool.empty():
            try:
                conn = self.connection_pool.get_nowait()
                conn.close()
            except queue.Empty:
                break
        
        print("Database Manager 종료")

def test_ultimate_efficiency():
    """100% 저장 효율 테스트"""
    print("100% 저장 효율 테스트 시작...")
    
    db_manager = UltimateDatabaseManager("real_estate_crawling.db", max_connections=10, max_retries=20)
    
    # 대량 동시 저장 테스트
    test_data = []
    for i in range(100):
        test_data.append((
            f"TEST_ULTIMATE_{i}",
            f"궁극테스트아파트{i}",
            "테스트시",
            "테스트구",
            f"테스트동{i}",
            37.5 + i * 0.001,
            127.0 + i * 0.001,
            datetime.now()
        ))
    
    print(f"{len(test_data)}개 데이터 저장 테스트...")
    
    # 동시 저장 실행
    start_time = time.time()
    
    for data in test_data:
        db_manager.queue_transaction(
            "INSERT OR REPLACE INTO apartment_complexes (complex_id, complex_name, city, gu, dong, latitude, longitude, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            data
        )
    
    # 완료 대기
    final_stats = db_manager.wait_for_completion()
    end_time = time.time()
    
    print(f"총 소요시간: {end_time - start_time:.2f}초")
    print(f"최종 통계:")
    print(f"  - 총 시도: {final_stats['total_attempts']}")
    print(f"  - 성공: {final_stats['successful_saves']}")
    print(f"  - 실패: {final_stats['failed_saves']}")
    print(f"  - 성공률: {final_stats['success_rate']:.2f}%")
    print(f"  - 재시도 사용: {final_stats['retries_used']}")
    print(f"  - 실패한 트랜잭션: {final_stats['failed_transactions_count']}")
    
    # 실제 저장 확인
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes WHERE city = '테스트시'")
        saved_count = cursor.fetchone()[0]
        print(f"  - 실제 저장된 데이터: {saved_count}개")
    
    # 테스트 데이터 정리
    db_manager.safe_execute("DELETE FROM apartment_complexes WHERE city = '테스트시'")
    
    db_manager.close()
    
    efficiency = (saved_count / len(test_data)) * 100
    print(f"\n달성한 저장 효율: {efficiency:.1f}%")
    
    return efficiency >= 99.0  # 99% 이상이면 성공

if __name__ == "__main__":
    success = test_ultimate_efficiency()
    if success:
        print("\n100% 저장 효율 달성 성공!")
    else:
        print("\n추가 최적화 필요")