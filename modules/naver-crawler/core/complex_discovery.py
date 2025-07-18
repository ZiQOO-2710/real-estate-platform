"""
네이버 부동산 전국 아파트 단지 자동 발견 시스템
모든 지역의 모든 단지를 자동으로 찾아서 목록화
"""

import asyncio
import json
import time
import requests
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Set
import logging
from playwright.async_api import async_playwright
import re
import sqlite3
import random

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ComplexDiscovery:
    """전국 아파트 단지 자동 발견 시스템"""
    
    def __init__(self):
        self.discovered_complexes = set()
        self.db_path = 'data/discovered_complexes.db'
        self.init_database()
        
    def init_database(self):
        """발견된 단지 데이터베이스 초기화"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS discovered_complexes (
                complex_id TEXT PRIMARY KEY,
                complex_name TEXT,
                address TEXT,
                region_code TEXT,
                region_name TEXT,
                url TEXT,
                discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'discovered'
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"단지 발견 DB 초기화: {self.db_path}")
        
    def get_all_regions(self) -> List[Dict]:
        """전국 모든 시군구 목록"""
        return [
            # 서울특별시
            {'code': '11110', 'name': '서울특별시 종로구'},
            {'code': '11140', 'name': '서울특별시 중구'},
            {'code': '11170', 'name': '서울특별시 용산구'},
            {'code': '11200', 'name': '서울특별시 성동구'},
            {'code': '11215', 'name': '서울특별시 광진구'},
            {'code': '11230', 'name': '서울특별시 동대문구'},
            {'code': '11260', 'name': '서울특별시 중랑구'},
            {'code': '11290', 'name': '서울특별시 성북구'},
            {'code': '11305', 'name': '서울특별시 강북구'},
            {'code': '11320', 'name': '서울특별시 도봉구'},
            {'code': '11350', 'name': '서울특별시 노원구'},
            {'code': '11380', 'name': '서울특별시 은평구'},
            {'code': '11410', 'name': '서울특별시 서대문구'},
            {'code': '11440', 'name': '서울특별시 마포구'},
            {'code': '11470', 'name': '서울특별시 양천구'},
            {'code': '11500', 'name': '서울특별시 강서구'},
            {'code': '11530', 'name': '서울특별시 구로구'},
            {'code': '11545', 'name': '서울특별시 금천구'},
            {'code': '11560', 'name': '서울특별시 영등포구'},
            {'code': '11590', 'name': '서울특별시 동작구'},
            {'code': '11620', 'name': '서울특별시 관악구'},
            {'code': '11650', 'name': '서울특별시 서초구'},
            {'code': '11680', 'name': '서울특별시 강남구'},
            {'code': '11710', 'name': '서울특별시 송파구'},
            {'code': '11740', 'name': '서울특별시 강동구'},
            
            # 부산광역시 주요 구
            {'code': '26110', 'name': '부산광역시 중구'},
            {'code': '26140', 'name': '부산광역시 서구'},
            {'code': '26170', 'name': '부산광역시 동구'},
            {'code': '26200', 'name': '부산광역시 영도구'},
            {'code': '26230', 'name': '부산광역시 부산진구'},
            {'code': '26260', 'name': '부산광역시 동래구'},
            {'code': '26290', 'name': '부산광역시 남구'},
            {'code': '26320', 'name': '부산광역시 북구'},
            {'code': '26350', 'name': '부산광역시 해운대구'},
            {'code': '26380', 'name': '부산광역시 사하구'},
            {'code': '26410', 'name': '부산광역시 금정구'},
            {'code': '26440', 'name': '부산광역시 강서구'},
            {'code': '26470', 'name': '부산광역시 연제구'},
            {'code': '26500', 'name': '부산광역시 수영구'},
            {'code': '26530', 'name': '부산광역시 사상구'},
            {'code': '26710', 'name': '부산광역시 기장군'},
            
            # 대구광역시
            {'code': '27110', 'name': '대구광역시 중구'},
            {'code': '27140', 'name': '대구광역시 동구'},
            {'code': '27170', 'name': '대구광역시 서구'},
            {'code': '27200', 'name': '대구광역시 남구'},
            {'code': '27230', 'name': '대구광역시 북구'},
            {'code': '27260', 'name': '대구광역시 수성구'},
            {'code': '27290', 'name': '대구광역시 달서구'},
            {'code': '27710', 'name': '대구광역시 달성군'},
            
            # 인천광역시
            {'code': '28110', 'name': '인천광역시 중구'},
            {'code': '28140', 'name': '인천광역시 동구'},
            {'code': '28177', 'name': '인천광역시 미추홀구'},
            {'code': '28185', 'name': '인천광역시 연수구'},
            {'code': '28200', 'name': '인천광역시 남동구'},
            {'code': '28237', 'name': '인천광역시 부평구'},
            {'code': '28245', 'name': '인천광역시 계양구'},
            {'code': '28260', 'name': '인천광역시 서구'},
            {'code': '28710', 'name': '인천광역시 강화군'},
            {'code': '28720', 'name': '인천광역시 옹진군'},
            
            # 광주광역시
            {'code': '29110', 'name': '광주광역시 동구'},
            {'code': '29140', 'name': '광주광역시 서구'},
            {'code': '29155', 'name': '광주광역시 남구'},
            {'code': '29170', 'name': '광주광역시 북구'},
            {'code': '29200', 'name': '광주광역시 광산구'},
            
            # 대전광역시
            {'code': '30110', 'name': '대전광역시 동구'},
            {'code': '30140', 'name': '대전광역시 중구'},
            {'code': '30170', 'name': '대전광역시 서구'},
            {'code': '30200', 'name': '대전광역시 유성구'},
            {'code': '30230', 'name': '대전광역시 대덕구'},
            
            # 울산광역시
            {'code': '31110', 'name': '울산광역시 중구'},
            {'code': '31140', 'name': '울산광역시 남구'},
            {'code': '31170', 'name': '울산광역시 동구'},
            {'code': '31200', 'name': '울산광역시 북구'},
            {'code': '31710', 'name': '울산광역시 울주군'},
            
            # 경기도 주요 시
            {'code': '41111', 'name': '경기도 수원시 장안구'},
            {'code': '41113', 'name': '경기도 수원시 영통구'},
            {'code': '41115', 'name': '경기도 수원시 팔달구'},
            {'code': '41117', 'name': '경기도 수원시 권선구'},
            {'code': '41131', 'name': '경기도 성남시 수정구'},
            {'code': '41133', 'name': '경기도 성남시 중원구'},
            {'code': '41135', 'name': '경기도 성남시 분당구'},
            {'code': '41150', 'name': '경기도 의정부시'},
            {'code': '41170', 'name': '경기도 안양시'},
            {'code': '41190', 'name': '경기도 부천시'},
            {'code': '41210', 'name': '경기도 광명시'},
            {'code': '41220', 'name': '경기도 평택시'},
            {'code': '41250', 'name': '경기도 동두천시'},
            {'code': '41270', 'name': '경기도 안산시'},
            {'code': '41290', 'name': '경기도 고양시'},
            {'code': '41310', 'name': '경기도 과천시'},
            {'code': '41360', 'name': '경기도 구리시'},
            {'code': '41370', 'name': '경기도 남양주시'},
            {'code': '41390', 'name': '경기도 오산시'},
            {'code': '41410', 'name': '경기도 시흥시'},
            {'code': '41430', 'name': '경기도 군포시'},
            {'code': '41450', 'name': '경기도 의왕시'},
            {'code': '41460', 'name': '경기도 하남시'},
            {'code': '41480', 'name': '경기도 용인시'},
            {'code': '41500', 'name': '경기도 파주시'},
            {'code': '41550', 'name': '경기도 이천시'},
            {'code': '41570', 'name': '경기도 안성시'},
            {'code': '41590', 'name': '경기도 김포시'},
            {'code': '41610', 'name': '경기도 화성시'},
            {'code': '41630', 'name': '경기도 광주시'},
            {'code': '41650', 'name': '경기도 양주시'},
            {'code': '41670', 'name': '경기도 포천시'},
            {'code': '41800', 'name': '경기도 연천군'},
            {'code': '41820', 'name': '경기도 가평군'},
            {'code': '41830', 'name': '경기도 양평군'},
        ]
        
    async def discover_complexes_by_region(self, region_code: str, region_name: str) -> List[Dict]:
        """특정 지역의 모든 아파트 단지 발견"""
        logger.info(f"🔍 {region_name} 단지 발견 시작")
        
        discovered = []
        
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            page = await browser.new_page()
            
            try:
                # 네이버 부동산 지역 검색 페이지
                search_url = f"https://new.land.naver.com/complexes?ms=37.5665,126.9780,15&a=APT&e=RETAIL"
                await page.goto(search_url, wait_until="networkidle")
                
                # 지역 설정 및 아파트 단지 목록 추출
                await page.wait_for_timeout(3000)
                
                # 단지 링크 추출
                complex_links = await page.evaluate("""
                    () => {
                        const links = [];
                        const elements = document.querySelectorAll('a[href*="/complexes/"]');
                        
                        elements.forEach(element => {
                            const href = element.href;
                            const match = href.match(/complexes\\/(\\d+)/);
                            if (match) {
                                const complexId = match[1];
                                const name = element.textContent.trim() || 'Unknown';
                                links.push({
                                    complex_id: complexId,
                                    complex_name: name,
                                    url: href
                                });
                            }
                        });
                        
                        return links;
                    }
                """)
                
                for link in complex_links:
                    discovered.append({
                        'complex_id': link['complex_id'],
                        'complex_name': link['complex_name'],
                        'address': region_name,
                        'region_code': region_code,
                        'region_name': region_name,
                        'url': link['url']
                    })
                    
                logger.info(f"✅ {region_name}: {len(discovered)}개 단지 발견")
                
            except Exception as e:
                logger.error(f"❌ {region_name} 발견 실패: {e}")
                
            finally:
                await browser.close()
                
        return discovered
        
    def save_discovered_complexes(self, complexes: List[Dict]):
        """발견된 단지들을 데이터베이스에 저장"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        for complex_info in complexes:
            cursor.execute('''
                INSERT OR REPLACE INTO discovered_complexes 
                (complex_id, complex_name, address, region_code, region_name, url)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (
                complex_info['complex_id'],
                complex_info['complex_name'],
                complex_info['address'],
                complex_info['region_code'],
                complex_info['region_name'],
                complex_info['url']
            ))
            
        conn.commit()
        conn.close()
        
    async def discover_all_complexes(self):
        """전국 모든 아파트 단지 발견"""
        logger.info("🚀 전국 아파트 단지 자동 발견 시작")
        
        all_regions = self.get_all_regions()
        total_discovered = 0
        
        for i, region in enumerate(all_regions):
            logger.info(f"📍 진행률: {i+1}/{len(all_regions)} - {region['name']}")
            
            try:
                discovered = await self.discover_complexes_by_region(
                    region['code'], 
                    region['name']
                )
                
                if discovered:
                    self.save_discovered_complexes(discovered)
                    total_discovered += len(discovered)
                    
                # 요청 간격 조절
                await asyncio.sleep(random.uniform(2, 5))
                
            except Exception as e:
                logger.error(f"❌ {region['name']} 처리 실패: {e}")
                continue
                
        logger.info(f"🎉 전국 단지 발견 완료: 총 {total_discovered}개 단지")
        return total_discovered
        
    def get_all_discovered_complexes(self) -> List[Dict]:
        """발견된 모든 단지 목록 반환"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT complex_id, complex_name, address, region_code, region_name, url
            FROM discovered_complexes
            ORDER BY region_name, complex_name
        ''')
        
        complexes = []
        for row in cursor.fetchall():
            complexes.append({
                'complex_id': row[0],
                'complex_name': row[1],
                'address': row[2],
                'region_code': row[3],
                'region_name': row[4],
                'url': row[5]
            })
            
        conn.close()
        return complexes
        
    def get_discovery_stats(self) -> Dict:
        """발견 통계 조회"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT COUNT(*) FROM discovered_complexes')
        total_count = cursor.fetchone()[0]
        
        cursor.execute('''
            SELECT region_name, COUNT(*) as count
            FROM discovered_complexes
            GROUP BY region_name
            ORDER BY count DESC
        ''')
        region_stats = cursor.fetchall()
        
        conn.close()
        
        return {
            'total_complexes': total_count,
            'region_stats': region_stats
        }

# 사용 예시
async def run_discovery():
    """단지 발견 실행"""
    discovery = ComplexDiscovery()
    
    # 전국 단지 발견
    total_discovered = await discovery.discover_all_complexes()
    
    # 통계 출력
    stats = discovery.get_discovery_stats()
    print(f"🎯 발견 완료: {stats['total_complexes']}개 단지")
    
    print("\n📊 지역별 통계:")
    for region, count in stats['region_stats'][:10]:
        print(f"  {region}: {count}개")
        
    return discovery

if __name__ == "__main__":
    asyncio.run(run_discovery())