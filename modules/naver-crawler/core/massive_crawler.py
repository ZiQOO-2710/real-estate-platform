"""
전국 모든 아파트 단지 대규모 크롤링 시스템
발견된 모든 단지를 체계적으로 크롤링
"""

import asyncio
import time
import logging
from datetime import datetime
from typing import List, Dict
import sqlite3
from pathlib import Path
import random

from .complex_discovery import ComplexDiscovery
from .enhanced_naver_crawler import crawl_enhanced_single
from database.simple_data_processor import process_json_file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MassiveCrawler:
    """전국 대규모 크롤링 시스템"""
    
    def __init__(self, max_concurrent=3, batch_size=10):
        self.max_concurrent = max_concurrent
        self.batch_size = batch_size
        self.discovery = ComplexDiscovery()
        self.progress_db = 'data/massive_crawling_progress.db'
        self.init_progress_db()
        
    def init_progress_db(self):
        """크롤링 진행률 데이터베이스 초기화"""
        Path(self.progress_db).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS massive_crawling_progress (
                complex_id TEXT PRIMARY KEY,
                complex_name TEXT,
                region_name TEXT,
                url TEXT,
                status TEXT DEFAULT 'pending',
                listings_count INTEGER DEFAULT 0,
                error_message TEXT,
                crawled_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"대규모 크롤링 진행률 DB 초기화: {self.progress_db}")
        
    def load_all_complexes(self) -> List[Dict]:
        """발견된 모든 단지 목록 로드"""
        # 먼저 발견된 단지가 있는지 확인
        stats = self.discovery.get_discovery_stats()
        
        if stats['total_complexes'] == 0:
            logger.warning("발견된 단지가 없습니다. 먼저 단지 발견을 실행하세요.")
            return []
            
        return self.discovery.get_all_discovered_complexes()
        
    def get_pending_complexes(self, all_complexes: List[Dict]) -> List[Dict]:
        """미처리 단지 목록 반환"""
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        # 이미 완료된 단지 ID 조회
        cursor.execute("SELECT complex_id FROM massive_crawling_progress WHERE status = 'completed'")
        completed_ids = {row[0] for row in cursor.fetchall()}
        
        conn.close()
        
        # 미처리 단지 필터링
        pending = [complex_info for complex_info in all_complexes 
                  if complex_info['complex_id'] not in completed_ids]
        
        return pending
        
    def update_progress(self, complex_id: str, status: str, listings_count: int = 0, error_message: str = None):
        """크롤링 진행률 업데이트"""
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO massive_crawling_progress
            (complex_id, status, listings_count, error_message, crawled_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            complex_id,
            status,
            listings_count,
            error_message,
            datetime.now().isoformat() if status == 'completed' else None,
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
    async def crawl_single_complex(self, complex_info: Dict) -> bool:
        """단일 단지 크롤링"""
        complex_id = complex_info['complex_id']
        complex_name = complex_info['complex_name']
        url = complex_info['url']
        
        try:
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
            logger.error(f"❌ 예외 발생: {complex_name} - {e}")
            return False
            
    async def crawl_batch(self, batch: List[Dict]):
        """배치 단위 병렬 크롤링"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def crawl_with_semaphore(complex_info):
            async with semaphore:
                success = await self.crawl_single_complex(complex_info)
                # 요청 간격 조절
                await asyncio.sleep(random.uniform(5, 10))
                return success
                
        tasks = [crawl_with_semaphore(complex_info) for complex_info in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        success_count = sum(1 for r in results if r is True)
        return success_count, len(results)
        
    async def run_massive_crawling(self):
        """전국 대규모 크롤링 실행"""
        logger.info("🚀 전국 대규모 아파트 크롤링 시작")
        
        # 1. 모든 단지 목록 로드
        all_complexes = self.load_all_complexes()
        
        if not all_complexes:
            logger.error("크롤링할 단지가 없습니다. 먼저 단지 발견을 실행하세요.")
            return
            
        # 2. 미처리 단지 필터링
        pending_complexes = self.get_pending_complexes(all_complexes)
        
        logger.info(f"📊 크롤링 대상: {len(pending_complexes)}개 단지")
        logger.info(f"📊 이미 완료: {len(all_complexes) - len(pending_complexes)}개 단지")
        
        if not pending_complexes:
            logger.info("🎉 모든 단지 크롤링이 이미 완료되었습니다!")
            return
            
        # 3. 배치 단위로 크롤링 실행
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
                    
                    logger.info(f"📈 진행률: {processed_count}/{len(pending_complexes)} 완료")
                    logger.info(f"📊 성공: {total_success}, 실패: {total_failed}")
                    logger.info(f"⏰ 예상 남은 시간: {estimated_remaining_time/3600:.1f}시간")
                    
                # 배치 간 대기
                if i + self.batch_size < len(pending_complexes):
                    wait_time = random.uniform(15, 30)
                    logger.info(f"⏳ 다음 배치까지 {wait_time:.1f}초 대기...")
                    await asyncio.sleep(wait_time)
                    
            except Exception as e:
                logger.error(f"❌ 배치 {batch_num} 처리 오류: {e}")
                total_failed += len(batch)
                
        # 4. 최종 결과 리포트
        total_time = time.time() - start_time
        success_rate = (total_success / (total_success + total_failed)) * 100 if (total_success + total_failed) > 0 else 0
        
        logger.info(f"\n🎉 전국 대규모 크롤링 완료!")
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
        
    def get_crawling_stats(self) -> Dict:
        """크롤링 통계 조회"""
        conn = sqlite3.connect(self.progress_db)
        cursor = conn.cursor()
        
        # 전체 통계
        cursor.execute('''
            SELECT status, COUNT(*) as count
            FROM massive_crawling_progress
            GROUP BY status
        ''')
        status_stats = dict(cursor.fetchall())
        
        # 지역별 통계
        cursor.execute('''
            SELECT region_name, status, COUNT(*) as count
            FROM massive_crawling_progress p
            JOIN discovered_complexes d ON p.complex_id = d.complex_id
            GROUP BY region_name, status
            ORDER BY region_name
        ''', )
        region_stats = cursor.fetchall()
        
        # 총 매물 수
        cursor.execute('SELECT SUM(listings_count) FROM massive_crawling_progress WHERE status = "completed"')
        total_listings = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            'status_summary': status_stats,
            'region_stats': region_stats,
            'total_listings': total_listings
        }

# 실행 함수
async def run_complete_nationwide_crawling():
    """완전한 전국 크롤링 실행"""
    logger.info("🎯 완전한 전국 아파트 크롤링 시작")
    
    # 1. 단지 발견
    discovery = ComplexDiscovery()
    stats = discovery.get_discovery_stats()
    
    if stats['total_complexes'] == 0:
        logger.info("📍 먼저 전국 단지 발견 실행...")
        await discovery.discover_all_complexes()
        
    # 2. 대규모 크롤링
    crawler = MassiveCrawler(max_concurrent=2, batch_size=5)
    result = await crawler.run_massive_crawling()
    
    # 3. 최종 통계
    crawling_stats = crawler.get_crawling_stats()
    
    print(f"\n🎊 전국 크롤링 최종 결과:")
    print(f"  📊 총 매물: {crawling_stats['total_listings']:,}개")
    print(f"  🏢 완료 단지: {crawling_stats['status_summary'].get('completed', 0)}개")
    print(f"  ❌ 실패 단지: {crawling_stats['status_summary'].get('failed', 0)}개")
    
    return result

if __name__ == "__main__":
    asyncio.run(run_complete_nationwide_crawling())