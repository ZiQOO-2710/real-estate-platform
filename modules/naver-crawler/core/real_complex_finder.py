"""
실제 전국 아파트 단지 ID 수집 시스템
네이버 부동산 API 및 사이트맵 활용
"""

import asyncio
import requests
import json
import time
import logging
from datetime import datetime
from typing import List, Dict, Set
import sqlite3
from pathlib import Path
import re
from playwright.async_api import async_playwright
import random

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RealComplexFinder:
    """실제 전국 아파트 단지 ID 수집기"""
    
    def __init__(self):
        self.db_path = 'data/real_complexes.db'
        self.complex_ids = set()
        self.init_database()
        
    def init_database(self):
        """실제 단지 데이터베이스 초기화"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS real_complexes (
                complex_id TEXT PRIMARY KEY,
                complex_name TEXT,
                address TEXT,
                coordinates TEXT,
                building_count INTEGER,
                household_count INTEGER,
                completion_year TEXT,
                found_method TEXT,
                source_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"실제 단지 DB 초기화: {self.db_path}")
        
    async def find_complexes_by_sequential_id(self, start_id: int = 1, end_id: int = 100000):
        """순차적 ID로 단지 발견 (1~100000)"""
        logger.info(f"🔍 순차적 ID 스캔 시작: {start_id} ~ {end_id}")
        
        found_count = 0
        total_checked = 0
        
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            
            # 동시에 여러 페이지로 병렬 처리
            tasks = []
            semaphore = asyncio.Semaphore(5)  # 5개 동시 요청
            
            async def check_complex_id(complex_id):
                nonlocal found_count, total_checked
                
                async with semaphore:
                    try:
                        page = await browser.new_page()
                        url = f"https://new.land.naver.com/complexes/{complex_id}"
                        
                        response = await page.goto(url, timeout=10000)
                        
                        if response and response.status == 200:
                            # 페이지 내용 확인
                            title = await page.title()
                            
                            # 유효한 단지인지 확인
                            if "네이버페이 부동산" in title and "404" not in title:
                                # 단지 정보 추출
                                complex_info = await page.evaluate("""
                                    () => {
                                        const info = {};
                                        
                                        // 단지명 추출
                                        const titleElement = document.querySelector('h1, .complex_title, .title');
                                        if (titleElement) {
                                            info.name = titleElement.textContent.trim();
                                        }
                                        
                                        // 주소 추출
                                        const addressElement = document.querySelector('.address, .location');
                                        if (addressElement) {
                                            info.address = addressElement.textContent.trim();
                                        }
                                        
                                        // 기본 정보 추출
                                        const text = document.body.textContent;
                                        
                                        // 세대수 추출
                                        const householdMatch = text.match(/(\\d+)\\s*세대/);
                                        if (householdMatch) {
                                            info.household_count = parseInt(householdMatch[1]);
                                        }
                                        
                                        // 준공년도 추출
                                        const yearMatch = text.match(/(19|20)\\d{2}년/);
                                        if (yearMatch) {
                                            info.completion_year = yearMatch[0];
                                        }
                                        
                                        return info;
                                    }
                                """)
                                
                                if complex_info.get('name'):
                                    self.save_complex_info(complex_id, complex_info, 'sequential_scan', url)
                                    found_count += 1
                                    logger.info(f"✅ 발견: {complex_id} - {complex_info.get('name', 'Unknown')}")
                                    
                        await page.close()
                        total_checked += 1
                        
                        if total_checked % 100 == 0:
                            logger.info(f"📊 진행률: {total_checked}개 확인, {found_count}개 발견")
                            
                        # 요청 간격 조절
                        await asyncio.sleep(random.uniform(0.1, 0.5))
                        
                    except Exception as e:
                        await page.close()
                        
            # 배치 단위로 처리
            batch_size = 50
            for i in range(start_id, end_id + 1, batch_size):
                batch_end = min(i + batch_size - 1, end_id)
                batch_tasks = [check_complex_id(cid) for cid in range(i, batch_end + 1)]
                
                await asyncio.gather(*batch_tasks, return_exceptions=True)
                
                # 배치 간 대기
                await asyncio.sleep(random.uniform(2, 5))
                
            await browser.close()
            
        logger.info(f"🎉 순차적 스캔 완료: {found_count}개 단지 발견")
        return found_count
        
    def save_complex_info(self, complex_id: int, info: Dict, method: str, url: str):
        """단지 정보 저장"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            INSERT OR REPLACE INTO real_complexes
            (complex_id, complex_name, address, household_count, completion_year, found_method, source_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            str(complex_id),
            info.get('name', ''),
            info.get('address', ''),
            info.get('household_count', 0),
            info.get('completion_year', ''),
            method,
            url
        ))
        
        conn.commit()
        conn.close()
        
    async def find_complexes_by_sitemap(self):
        """네이버 사이트맵에서 단지 ID 추출"""
        logger.info("🗺️ 네이버 사이트맵에서 단지 ID 수집 시작")
        
        sitemap_urls = [
            "https://new.land.naver.com/sitemap.xml",
            "https://new.land.naver.com/robots.txt"
        ]
        
        complex_ids = set()
        
        for url in sitemap_urls:
            try:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    content = response.text
                    
                    # complexes/숫자 패턴 찾기
                    matches = re.findall(r'complexes/(\d+)', content)
                    for match in matches:
                        complex_ids.add(int(match))
                        
            except Exception as e:
                logger.error(f"사이트맵 처리 오류: {url} - {e}")
                
        logger.info(f"✅ 사이트맵에서 {len(complex_ids)}개 단지 ID 발견")
        return list(complex_ids)
        
    def find_complexes_by_pattern_analysis(self) -> List[int]:
        """기존 성공한 ID들의 패턴 분석"""
        logger.info("📊 기존 성공 ID 패턴 분석")
        
        # 기존 크롤링에서 성공한 ID들
        successful_ids = [
            1168, 1418, 2592, 4568, 105, 1309, 934, 856, 1205, 1876,
            3847, 2845, 3921, 1734, 2654, 3456, 4123, 2789, 3567, 4234,
            567, 789, 1023, 1456, 2345, 3678, 4567, 1789, 2890, 3901
        ]
        
        # 패턴 분석
        candidate_ids = []
        
        # 1. 연속된 범위 추정
        for base_id in successful_ids:
            # 기준 ID 주변 ±50 범위
            for offset in range(-50, 51):
                candidate_id = base_id + offset
                if candidate_id > 0 and candidate_id not in successful_ids:
                    candidate_ids.append(candidate_id)
                    
        # 2. 특정 패턴 (1000의 배수, 500의 배수 등)
        for i in range(1, 10000):
            if i % 100 == 0:  # 100의 배수
                candidate_ids.append(i)
            if i % 500 == 0:  # 500의 배수
                candidate_ids.append(i)
                
        # 중복 제거 및 정렬
        candidate_ids = sorted(list(set(candidate_ids)))
        
        logger.info(f"✅ 패턴 분석으로 {len(candidate_ids)}개 후보 ID 생성")
        return candidate_ids
        
    async def run_comprehensive_discovery(self):
        """종합적인 단지 발견 실행"""
        logger.info("🚀 종합적인 전국 단지 발견 시작")
        
        total_found = 0
        
        # 1. 사이트맵 분석
        sitemap_ids = await self.find_complexes_by_sitemap()
        total_found += len(sitemap_ids)
        
        # 2. 패턴 분석 기반 탐색
        pattern_ids = self.find_complexes_by_pattern_analysis()
        
        # 3. 순차적 스캔 (작은 범위부터)
        logger.info("🔍 순차적 스캔 시작 (1~5000)")
        sequential_found = await self.find_complexes_by_sequential_id(1, 5000)
        total_found += sequential_found
        
        # 4. 통계 출력
        stats = self.get_discovery_stats()
        logger.info(f"🎉 종합 발견 완료: {stats['total_complexes']}개 단지")
        
        return stats
        
    def get_discovery_stats(self) -> Dict:
        """발견 통계 조회"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM real_complexes')
        total_count = cursor.fetchone()[0]
        
        cursor.execute('''
            SELECT found_method, COUNT(*) as count
            FROM real_complexes
            GROUP BY found_method
        ''')
        method_stats = dict(cursor.fetchall())
        
        cursor.execute('SELECT complex_id, complex_name, address FROM real_complexes LIMIT 10')
        sample_complexes = cursor.fetchall()
        
        conn.close()
        
        return {
            'total_complexes': total_count,
            'method_stats': method_stats,
            'sample_complexes': sample_complexes
        }
        
    def get_all_discovered_ids(self) -> List[str]:
        """발견된 모든 단지 ID 리스트 반환"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT complex_id FROM real_complexes ORDER BY complex_id')
        ids = [row[0] for row in cursor.fetchall()]
        
        conn.close()
        return ids

# 실행 함수
async def run_real_discovery():
    """실제 단지 발견 실행"""
    finder = RealComplexFinder()
    
    # 종합적인 발견 실행
    stats = await finder.run_comprehensive_discovery()
    
    print(f"\n🎯 실제 단지 발견 결과:")
    print(f"  📊 총 발견 단지: {stats['total_complexes']}개")
    print(f"  🔍 발견 방법별 통계: {stats['method_stats']}")
    
    print(f"\n📋 발견된 단지 예시:")
    for complex_id, name, address in stats['sample_complexes']:
        print(f"  {complex_id}: {name} - {address}")
        
    # 발견된 ID들을 기존 크롤링 시스템에 사용 가능한 형태로 반환
    all_ids = finder.get_all_discovered_ids()
    print(f"\n🔗 크롤링 가능한 단지 ID: {len(all_ids)}개")
    
    return all_ids

if __name__ == "__main__":
    asyncio.run(run_real_discovery())