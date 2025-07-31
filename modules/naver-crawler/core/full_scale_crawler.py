"""
발견된 4,873개 전국 단지 대규모 크롤링 시스템
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Dict
import sqlite3
from pathlib import Path
import random
import time

from .enhanced_naver_crawler import crawl_enhanced_single
from database.simple_data_processor import process_json_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FullScaleCrawler:
    """전국 4,873개 단지 대규모 크롤링"""
    
    def __init__(self, max_concurrent=3, batch_size=20):
        self.max_concurrent = max_concurrent
        self.batch_size = batch_size
        self.progress_db = 'data/full_scale_progress.db'
        self.real_complexes_db = 'data/real_complexes.db'
        self.init_progress_db()
        
    def init_progress_db(self):
        """진행률 데이터베이스 초기화"""
        Path(self.progress_db).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS full_scale_progress (
                complex_id TEXT PRIMARY KEY,
                complex_name TEXT,
                status TEXT DEFAULT 'pending',
                listings_count INTEGER DEFAULT 0,
                error_message TEXT,
                attempt_count INTEGER DEFAULT 0,
                last_attempt TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"전국 크롤링 진행률 DB 초기화: {self.progress_db}")
        
    def load_discovered_complexes(self) -> List[str]:
        """발견된 모든 단지 ID 로드"""
        try:
            conn = sqlite3.connect(self.real_complexes_db)
            cursor = conn.cursor()
            
            cursor.execute('SELECT complex_id FROM real_complexes ORDER BY complex_id')
            complex_ids = [row[0] for row in cursor.fetchall()]
            
            conn.close()
            
            logger.info(f"발견된 단지 로드 완료: {len(complex_ids)}개")
            return complex_ids
            
        except Exception as e:
            logger.error(f"발견된 단지 로드 실패: {e}")
            return []
            
    def get_pending_complexes(self) -> List[str]:
        """미처리 단지 목록 반환"""
        all_complexes = self.load_discovered_complexes()
        
        if not all_complexes:
            logger.error("발견된 단지가 없습니다.")
            return []
            
        # 이미 완료된 단지 확인
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        cursor.execute("SELECT complex_id FROM full_scale_progress WHERE status = 'completed'")
        completed_ids = {row[0] for row in cursor.fetchall()}
        
        conn.close()
        
        # 미처리 단지 필터링
        pending = [cid for cid in all_complexes if cid not in completed_ids]
        
        logger.info(f"미처리 단지: {len(pending)}개, 완료: {len(completed_ids)}개")
        return pending
        
    def update_progress(self, complex_id: str, status: str, listings_count: int = 0, 
                       error_message: str = None):
        """진행률 업데이트"""
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        now = datetime.now().isoformat()
        
        cursor.execute('''
            INSERT OR REPLACE INTO full_scale_progress
            (complex_id, status, listings_count, error_message, last_attempt, completed_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            complex_id,
            status,
            listings_count,
            error_message,
            now,
            now if status == 'completed' else None
        ))
        
        conn.commit()
        conn.close()
        
    async def crawl_single_complex(self, complex_id: str) -> bool:
        """단일 단지 크롤링"""
        try:
            url = f"https://new.land.naver.com/complexes/{complex_id}"
            complex_name = f"단지_{complex_id}"
            
            logger.info(f"🏢 크롤링 시작: {complex_name} ({complex_id})")
            
            # 크롤링 실행
            result = await crawl_enhanced_single(url, complex_name, headless=True)
            
            if result['success']:
                # DB 저장
                json_file = result['files']['json_file']
                db_success = process_json_file(json_file, {'database': 'data/naver_real_estate.db'})
                
                if db_success:
                    listings_count = result['data_summary']['listings_count']
                    self.update_progress(complex_id, 'completed', listings_count)
                    logger.info(f"✅ 성공: {complex_name} - 매물 {listings_count}개")
                    return True
                else:
                    self.update_progress(complex_id, 'failed', error_message="DB 저장 실패")
                    logger.error(f"❌ DB 저장 실패: {complex_name}")
                    return False
            else:
                error_msg = result.get('error', 'Unknown error')
                self.update_progress(complex_id, 'failed', error_message=error_msg)
                logger.error(f"❌ 크롤링 실패: {complex_name} - {error_msg}")
                return False
                
        except Exception as e:
            self.update_progress(complex_id, 'failed', error_message=str(e))
            logger.error(f"❌ 예외 발생: {complex_id} - {e}")
            return False
            
    async def crawl_batch(self, batch: List[str]):
        """배치 단위 병렬 크롤링"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def crawl_with_semaphore(complex_id):
            async with semaphore:
                success = await self.crawl_single_complex(complex_id)
                # 요청 간격 조절 (더 긴 간격)
                await asyncio.sleep(random.uniform(8, 15))
                return success
                
        tasks = [crawl_with_semaphore(complex_id) for complex_id in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        success_count = sum(1 for r in results if r is True)
        return success_count, len(results)
        
    async def run_full_scale_crawling(self):
        """전국 대규모 크롤링 실행"""
        logger.info("🚀 전국 4,873개 단지 대규모 크롤링 시작")
        
        # 미처리 단지 로드
        pending_complexes = self.get_pending_complexes()
        
        if not pending_complexes:
            logger.info("🎉 모든 단지 크롤링이 완료되었습니다!")
            return
            
        logger.info(f"📊 크롤링 대상: {len(pending_complexes)}개 단지")
        
        # 배치 단위로 처리
        total_batches = (len(pending_complexes) + self.batch_size - 1) // self.batch_size
        start_time = time.time()
        total_success = 0
        total_failed = 0
        
        for i in range(0, len(pending_complexes), self.batch_size):
            batch_num = i // self.batch_size + 1
            batch = pending_complexes[i:i + self.batch_size]
            
            logger.info(f"🔄 배치 {batch_num}/{total_batches} 처리 중 ({len(batch)}개 단지)")
            
            try:
                success_count, total_count = await self.crawl_batch(batch)
                failed_count = total_count - success_count
                
                total_success += success_count
                total_failed += failed_count
                
                # 진행률 리포트
                elapsed_time = time.time() - start_time
                processed_count = total_success + total_failed
                remaining_count = len(pending_complexes) - processed_count
                
                if processed_count > 0:
                    avg_time_per_complex = elapsed_time / processed_count
                    estimated_remaining_time = avg_time_per_complex * remaining_count
                    
                    logger.info(f"📈 진행률: {processed_count}/{len(pending_complexes)} ({processed_count/len(pending_complexes)*100:.1f}%)")
                    logger.info(f"📊 성공: {total_success}, 실패: {total_failed}")
                    logger.info(f"⏰ 예상 남은 시간: {estimated_remaining_time/3600:.1f}시간")
                    
                    # 현재 데이터베이스 상태 확인
                    self.print_current_stats()
                    
                # 배치 간 대기 (더 긴 간격)
                if i + self.batch_size < len(pending_complexes):
                    wait_time = random.uniform(30, 60)
                    logger.info(f"⏳ 다음 배치까지 {wait_time:.1f}초 대기...")
                    await asyncio.sleep(wait_time)
                    
            except Exception as e:
                logger.error(f"❌ 배치 {batch_num} 처리 오류: {e}")
                total_failed += len(batch)
                
        # 최종 결과
        total_time = time.time() - start_time
        success_rate = (total_success / (total_success + total_failed)) * 100 if (total_success + total_failed) > 0 else 0
        
        logger.info(f"\\n🎉 전국 대규모 크롤링 완료!")
        logger.info(f"⏰ 총 소요시간: {total_time/3600:.2f}시간")
        logger.info(f"📊 총 단지수: {len(pending_complexes)}개")
        logger.info(f"✅ 성공: {total_success}개")
        logger.info(f"❌ 실패: {total_failed}개")
        logger.info(f"📈 성공률: {success_rate:.1f}%")
        
        return {
            'total_complexes': len(pending_complexes),
            'successful': total_success,
            'failed': total_failed,
            'total_time': total_time,
            'success_rate': success_rate
        }
        
    def print_current_stats(self):
        """현재 데이터베이스 통계 출력"""
        try:
            import sys
            sys.path.append('.')
            from database.simple_data_processor import get_database_statistics
            
            stats = get_database_statistics('data/naver_real_estate.db')
            logger.info(f"🏠 현재 DB: 단지 {stats['complexes_count']}개, 매물 {stats['listings_count']:,}개")
            
        except Exception as e:
            logger.error(f"통계 조회 실패: {e}")

# 실행 함수
async def run_full_scale_crawling():
    """전국 대규모 크롤링 실행"""
    crawler = FullScaleCrawler(max_concurrent=2, batch_size=10)
    result = await crawler.run_full_scale_crawling()
    return result

if __name__ == "__main__":
    asyncio.run(run_full_scale_crawling())