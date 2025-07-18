"""
전국 아파트 대규모 크롤링 시스템
네이버 부동산 전국 단지 매물호가 수집 시스템
"""

import asyncio
import json
import csv
import time
import requests
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Set, Optional
import logging
from dataclasses import dataclass, asdict
import sqlite3
from urllib.parse import quote
import random

from .enhanced_naver_crawler import crawl_enhanced_single
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database.data_processor import process_json_file

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@dataclass
class ComplexInfo:
    """아파트 단지 정보"""
    complex_id: str
    complex_name: str
    address: str
    region_code: str
    region_name: str
    url: str
    status: str = 'pending'  # pending, processing, completed, failed
    crawled_at: Optional[str] = None
    listings_count: int = 0
    transactions_count: int = 0
    error_message: Optional[str] = None

class NationwideCrawler:
    """전국 대규모 크롤링 시스템"""
    
    def __init__(self, db_path='data/nationwide_crawling.db', max_concurrent=3):
        self.db_path = db_path
        self.max_concurrent = max_concurrent
        self.progress_file = 'data/crawling_progress.json'
        self.complexes: List[ComplexInfo] = []
        self.completed_ids: Set[str] = set()
        self.failed_ids: Set[str] = set()
        
        # 데이터베이스 초기화
        self.init_database()
        
    def init_database(self):
        """진행률 추적용 데이터베이스 초기화"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crawling_progress (
                complex_id TEXT PRIMARY KEY,
                complex_name TEXT,
                address TEXT,
                region_code TEXT,
                region_name TEXT,
                url TEXT,
                status TEXT DEFAULT 'pending',
                crawled_at TEXT,
                listings_count INTEGER DEFAULT 0,
                transactions_count INTEGER DEFAULT 0,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"진행률 DB 초기화: {self.db_path}")
        
    def get_seoul_districts(self) -> List[Dict]:
        """서울 지역 대상 목록"""
        return [
            {'code': '11110', 'name': '종로구'},
            {'code': '11140', 'name': '중구'},
            {'code': '11170', 'name': '용산구'},
            {'code': '11200', 'name': '성동구'},
            {'code': '11215', 'name': '광진구'},
            {'code': '11230', 'name': '동대문구'},
            {'code': '11260', 'name': '중랑구'},
            {'code': '11290', 'name': '성북구'},
            {'code': '11305', 'name': '강북구'},
            {'code': '11320', 'name': '도봉구'},
            {'code': '11350', 'name': '노원구'},
            {'code': '11380', 'name': '은평구'},
            {'code': '11410', 'name': '서대문구'},
            {'code': '11440', 'name': '마포구'},
            {'code': '11470', 'name': '양천구'},
            {'code': '11500', 'name': '강서구'},
            {'code': '11530', 'name': '구로구'},
            {'code': '11545', 'name': '금천구'},
            {'code': '11560', 'name': '영등포구'},
            {'code': '11590', 'name': '동작구'},
            {'code': '11620', 'name': '관악구'},
            {'code': '11650', 'name': '서초구'},
            {'code': '11680', 'name': '강남구'},
            {'code': '11710', 'name': '송파구'},
            {'code': '11740', 'name': '강동구'}
        ]
        
    def get_major_cities(self) -> List[Dict]:
        """주요 대도시 목록"""
        return [
            {'code': '26', 'name': '부산광역시'},
            {'code': '27', 'name': '대구광역시'},
            {'code': '28', 'name': '인천광역시'},
            {'code': '29', 'name': '광주광역시'},
            {'code': '30', 'name': '대전광역시'},
            {'code': '31', 'name': '울산광역시'},
            {'code': '41', 'name': '경기도'},  # 주요 시만 선별 필요
            {'code': '51', 'name': '강원도'},
            {'code': '43', 'name': '충청북도'},
            {'code': '44', 'name': '충청남도'},
            {'code': '45', 'name': '전라북도'},
            {'code': '46', 'name': '전라남도'},
            {'code': '47', 'name': '경상북도'},
            {'code': '48', 'name': '경상남도'},
            {'code': '50', 'name': '제주특별자치도'}
        ]
        
    def generate_complex_urls_by_region(self, region_code: str, region_name: str) -> List[str]:
        """지역별 단지 URL 생성 (예시 방식)"""
        # 실제 구현에서는 다음 방법들을 사용:
        # 1. 공공데이터 API로 단지 목록 수집
        # 2. 네이버 부동산 지역 검색 크롤링
        # 3. 기존 DB에서 단지 ID 수집
        
        # 예시: 기존 단지 ID들 사용
        sample_complex_ids = [
            '1168', '1418', '2592', '4568',  # 기존 테스트된 단지들
            # 여기에 실제 단지 ID들을 추가
        ]
        
        urls = []
        for complex_id in sample_complex_ids:
            url = f"https://new.land.naver.com/complexes/{complex_id}"
            urls.append(url)
            
        return urls
        
    def collect_all_complex_urls(self) -> List[ComplexInfo]:
        """전국 단지 URL 수집"""
        logger.info("전국 아파트 단지 URL 수집 시작")
        
        all_complexes = []
        
        # 1. 서울 지역
        seoul_districts = self.get_seoul_districts()
        for district in seoul_districts:
            urls = self.generate_complex_urls_by_region(district['code'], district['name'])
            for i, url in enumerate(urls):
                complex_id = url.split('/')[-1]
                complex_info = ComplexInfo(
                    complex_id=complex_id,
                    complex_name=f"단지_{complex_id}",
                    address=district['name'],
                    region_code=district['code'],
                    region_name=district['name'],
                    url=url
                )
                all_complexes.append(complex_info)
                
        # 2. 주요 대도시 (추후 확장)
        # major_cities = self.get_major_cities()
        # for city in major_cities:
        #     urls = self.generate_complex_urls_by_region(city['code'], city['name'])
        #     for url in urls:
        #         ...
        
        logger.info(f"전체 단지 수: {len(all_complexes)}개")
        return all_complexes
        
    def load_progress(self) -> Dict:
        """진행률 로드"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT * FROM crawling_progress')
        rows = cursor.fetchall()
        
        progress = {
            'completed': set(),
            'failed': set(),
            'total_processed': len(rows)
        }
        
        for row in rows:
            complex_id, _, _, _, _, _, status, _, _, _, _, _, _ = row
            if status == 'completed':
                progress['completed'].add(complex_id)
            elif status == 'failed':
                progress['failed'].add(complex_id)
                
        conn.close()
        return progress
        
    def save_progress(self, complex_info: ComplexInfo):
        """진행률 저장"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO crawling_progress 
            (complex_id, complex_name, address, region_code, region_name, url, 
             status, crawled_at, listings_count, transactions_count, error_message, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            complex_info.complex_id,
            complex_info.complex_name,
            complex_info.address,
            complex_info.region_code,
            complex_info.region_name,
            complex_info.url,
            complex_info.status,
            complex_info.crawled_at,
            complex_info.listings_count,
            complex_info.transactions_count,
            complex_info.error_message,
            datetime.now().isoformat()
        ))
        
        conn.commit()
        conn.close()
        
    async def crawl_single_complex(self, complex_info: ComplexInfo) -> bool:
        """단일 단지 크롤링"""
        try:
            logger.info(f"크롤링 시작: {complex_info.complex_id} - {complex_info.complex_name}")
            
            # 상태 업데이트
            complex_info.status = 'processing'
            self.save_progress(complex_info)
            
            # 크롤링 실행
            result = await crawl_enhanced_single(
                complex_info.url, 
                complex_info.complex_name, 
                headless=True
            )
            
            if result['success']:
                # 성공 시 정보 업데이트
                complex_info.status = 'completed'
                complex_info.crawled_at = datetime.now().isoformat()
                complex_info.listings_count = result['data_summary']['listings_count']
                complex_info.transactions_count = result['data_summary']['transactions_count']
                
                # JSON 데이터를 데이터베이스에 저장
                json_file = result['files']['json_file']
                db_success = process_json_file(json_file, {'database': 'data/naver_real_estate.db'})
                
                if db_success:
                    logger.info(f"✅ 성공: {complex_info.complex_id} - 매물 {complex_info.listings_count}개")
                else:
                    logger.warning(f"⚠️ DB 저장 실패: {complex_info.complex_id}")
                    
                self.save_progress(complex_info)
                return True
                
            else:
                # 실패 시 오류 정보 저장
                complex_info.status = 'failed'
                complex_info.error_message = result.get('error', 'Unknown error')
                
                logger.error(f"❌ 실패: {complex_info.complex_id} - {complex_info.error_message}")
                self.save_progress(complex_info)
                return False
                
        except Exception as e:
            complex_info.status = 'failed'
            complex_info.error_message = str(e)
            logger.error(f"❌ 예외: {complex_info.complex_id} - {e}")
            self.save_progress(complex_info)
            return False
            
    async def crawl_batch(self, complex_batch: List[ComplexInfo]):
        """대량 단지 병렬 크롤링"""
        semaphore = asyncio.Semaphore(self.max_concurrent)
        
        async def crawl_with_semaphore(complex_info):
            async with semaphore:
                success = await self.crawl_single_complex(complex_info)
                # 요청 간격 조절
                await asyncio.sleep(random.uniform(3, 7))
                return success
                
        tasks = [crawl_with_semaphore(complex_info) for complex_info in complex_batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return results
        
    async def run_nationwide_crawling(self, start_from_index: int = 0):
        """전국 대규모 크롤링 실행"""
        logger.info("전국 아파트 대규모 크롤링 시작")
        
        # 1. 단지 목록 수집
        all_complexes = self.collect_all_complex_urls()
        
        # 2. 진행률 로드
        progress = self.load_progress()
        
        # 3. 미처리 단지 필터링
        pending_complexes = []
        for complex_info in all_complexes[start_from_index:]:
            if complex_info.complex_id not in progress['completed']:
                pending_complexes.append(complex_info)
                
        logger.info(f"처리대상 단지: {len(pending_complexes)}개")
        logger.info(f"완료된 단지: {len(progress['completed'])}개")
        logger.info(f"실패한 단지: {len(progress['failed'])}개")
        
        # 4. 배치 단위로 처리
        batch_size = 10
        total_batches = (len(pending_complexes) + batch_size - 1) // batch_size
        
        start_time = time.time()
        successful_count = 0
        failed_count = 0
        
        for i in range(0, len(pending_complexes), batch_size):
            batch_num = i // batch_size + 1
            batch = pending_complexes[i:i + batch_size]
            
            logger.info(f"크롤링 배치 {batch_num}/{total_batches} 시작 ({len(batch)}개 단지)")
            
            try:
                results = await self.crawl_batch(batch)
                
                batch_success = sum(1 for r in results if r is True)
                batch_failed = len(results) - batch_success
                
                successful_count += batch_success
                failed_count += batch_failed
                
                # 진행률 보고
                elapsed_time = time.time() - start_time
                processed_count = successful_count + failed_count
                remaining_count = len(pending_complexes) - processed_count
                
                if processed_count > 0:
                    avg_time_per_complex = elapsed_time / processed_count
                    estimated_remaining_time = avg_time_per_complex * remaining_count
                    
                    logger.info(f"현재 진행률: {processed_count}/{len(pending_complexes)} 단지 완료")
                    logger.info(f"성공: {successful_count}, 실패: {failed_count}")
                    logger.info(f"예상 남은 시간: {estimated_remaining_time/3600:.1f}시간")
                    
                # 배치 간 대기
                if i + batch_size < len(pending_complexes):
                    wait_time = random.uniform(10, 20)
                    logger.info(f"다음 배치까지 {wait_time:.1f}초 대기...")
                    await asyncio.sleep(wait_time)
                    
            except Exception as e:
                logger.error(f"배치 {batch_num} 처리 오류: {e}")
                failed_count += len(batch)
                
        # 5. 최종 결과 보고
        total_time = time.time() - start_time
        logger.info(f"전국 크롤링 완료!")
        logger.info(f"총 소요시간: {total_time/3600:.2f}시간")
        logger.info(f"총 단지수: {len(pending_complexes)}개")
        logger.info(f"성공: {successful_count}개")
        logger.info(f"실패: {failed_count}개")
        logger.info(f"성공률: {successful_count/(successful_count+failed_count)*100:.1f}%")
        
        return {
            'total': len(pending_complexes),
            'successful': successful_count,
            'failed': failed_count,
            'total_time': total_time
        }
        
    def get_progress_report(self) -> Dict:
        """진행률 리포트 생성"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 전체 통계
        cursor.execute('''
            SELECT status, COUNT(*) as count 
            FROM crawling_progress 
            GROUP BY status
        ''')
        status_counts = dict(cursor.fetchall())
        
        # 지역별 통계
        cursor.execute('''
            SELECT region_name, status, COUNT(*) as count
            FROM crawling_progress 
            GROUP BY region_name, status
            ORDER BY region_name, status
        ''')
        region_stats = cursor.fetchall()
        
        # 최근 성공 단지
        cursor.execute('''
            SELECT complex_id, complex_name, listings_count, transactions_count, crawled_at
            FROM crawling_progress 
            WHERE status = 'completed'
            ORDER BY updated_at DESC
            LIMIT 10
        ''')
        recent_success = cursor.fetchall()
        
        conn.close()
        
        return {
            'status_summary': status_counts,
            'region_stats': region_stats,
            'recent_success': recent_success
        }

# 사용 예시 함수
async def run_sample_crawling():
    """샘플 크롤링 실행"""
    crawler = NationwideCrawler(max_concurrent=2)  # 낮은 동시 접속수
    
    # 전국 크롤링 실행
    result = await crawler.run_nationwide_crawling()
    
    # 결과 보고
    print(f"크롤링 완료: {result['successful']}/{result['total']} 성공")
    
    # 진행률 리포트
    report = crawler.get_progress_report()
    print("\n진행률 리포트:")
    print(f"  전체 현황: {report['status_summary']}")
    
if __name__ == "__main__":
    # 전국 크롤링 실행
    asyncio.run(run_sample_crawling())
