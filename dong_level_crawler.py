#!/usr/bin/env python3
"""
동단위 세분화 크롤링 시스템
- 서초구 18개 동 전체 크롤링 (테스트)
- 모든 거래 타입 포함 (매매+전세+월세)
- IP 차단 방지 (VPN + 딜레이)
- 완전한 아파트 데이터 수집
"""

import asyncio
import aiohttp
import sqlite3
import json
import time
import random
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlencode
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('dong_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DongLevelCrawler:
    def __init__(self, db_path="dong_level_apartments.db"):
        self.db_path = db_path
        self.base_url = "https://new.land.naver.com/api/complexes/single-markers/2.0"
        self.session = None
        self.init_database()
        
    def init_database(self):
        """데이터베이스 초기화"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dong_apartments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT NOT NULL,
                city TEXT NOT NULL,
                gu TEXT NOT NULL,
                dong TEXT NOT NULL,
                address_road TEXT,
                address_jibun TEXT,
                latitude REAL,
                longitude REAL,
                total_units INTEGER,
                construction_year INTEGER,
                
                -- 매매 가격
                deal_min_price INTEGER,
                deal_max_price INTEGER,
                
                -- 전세 가격  
                lease_min_price INTEGER,
                lease_max_price INTEGER,
                
                -- 월세 가격
                rent_min_price INTEGER,
                rent_max_price INTEGER,
                rent_min_deposit INTEGER,
                rent_max_deposit INTEGER,
                
                -- 거래 건수
                deal_count INTEGER DEFAULT 0,
                lease_count INTEGER DEFAULT 0,
                rent_count INTEGER DEFAULT 0,
                
                -- 면적 정보
                min_area REAL,
                max_area REAL,
                representative_area REAL,
                
                -- 메타 정보
                real_estate_type TEXT,
                trade_types TEXT,  -- 매매,전세,월세 중 어떤 거래가 있는지
                source_url TEXT,
                crawl_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- 원본 데이터
                raw_data TEXT
            )
        ''')
        
        # 진행 상황 테이블
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crawling_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT,
                gu TEXT,  
                dong TEXT,
                trade_type TEXT,
                status TEXT,  -- pending, processing, completed, failed
                apartment_count INTEGER DEFAULT 0,
                crawl_start_time TIMESTAMP,
                crawl_end_time TIMESTAMP,
                error_message TEXT
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info("✅ 데이터베이스 초기화 완료")

    async def init_session(self):
        """HTTP 세션 초기화"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Referer': 'https://new.land.naver.com/',
            'Origin': 'https://new.land.naver.com',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
        }
        
        timeout = aiohttp.ClientTimeout(total=60)
        self.session = aiohttp.ClientSession(headers=headers, timeout=timeout)
        
    async def close_session(self):
        """HTTP 세션 종료"""
        if self.session:
            await self.session.close()

    def get_seocho_dong_coordinates(self) -> Dict[str, Tuple[float, float, float, float]]:
        """서초구 18개 동의 상세 좌표"""
        return {
            "방배동": (126.995, 127.015, 37.485, 37.475),
            "서초동": (127.015, 127.035, 37.495, 37.485),
            "반포동": (126.995, 127.015, 37.515, 37.505),
            "잠원동": (127.015, 127.035, 37.525, 37.515),
            "신반포동": (126.995, 127.015, 37.505, 37.495),
            "내곡동": (127.035, 127.055, 37.465, 37.455),
            "염곡동": (127.035, 127.055, 37.475, 37.465),
            "원지동": (127.055, 127.075, 37.465, 37.455),
            "우면동": (127.015, 127.035, 37.465, 37.455),
            "양재동": (127.035, 127.055, 37.485, 37.475),
            "가락동": (127.045, 127.065, 37.495, 37.485),
            "개포동": (127.055, 127.075, 37.495, 37.485),
            "도곡동": (127.035, 127.055, 37.495, 37.485),
            "대치동": (127.055, 127.075, 37.505, 37.495),
            "역삼동": (127.025, 127.045, 37.505, 37.495),
            "논현동": (127.025, 127.045, 37.515, 37.505),
            "반포본동": (127.005, 127.025, 37.515, 37.505),
            "서초중앙동": (127.015, 127.035, 37.485, 37.475)
        }

    def get_trade_types(self) -> List[str]:
        """거래 타입 목록 - 전체"""
        return ["매매", "전세", "월세"]

    def get_trade_type_code(self, trade_type: str) -> str:
        """거래 타입 코드 변환"""
        codes = {
            "매매": "A1",
            "전세": "B1", 
            "월세": "B2"
        }
        return codes.get(trade_type, "A1")

    async def build_api_params(self, dong: str, coords: Tuple[float, float, float, float], trade_type: str) -> Dict[str, str]:
        """API 파라미터 구성"""
        left_lon, right_lon, top_lat, bottom_lat = coords
        trade_code = self.get_trade_type_code(trade_type)
        
        params = {
            'cortarNo': '1168011900',  # 서초구 코드
            'zoom': '16',  # 높은 줌 레벨로 상세 데이터
            'priceType': 'RETAIL',
            'markerId': '',
            'markerType': '',
            'selectedComplexNo': '',
            'selectedComplexBuildingNo': '',
            'fakeComplexMarker': '',
            'realEstateType': 'APT:ABYG:JGC:PRE',  # 아파트 전체
            'tradeType': trade_code,  # 거래 타입별로 분리
            'tag': '::::::::',
            'rentPriceMin': '0',
            'rentPriceMax': '999999999',  # 무제한
            'priceMin': '0',
            'priceMax': '999999999',     # 무제한
            'areaMin': '0',
            'areaMax': '999999999',      # 무제한
            'oldBuildYears': '99',       # 모든 건축년도
            'recentlyBuildYears': '0',
            'minHouseHoldCount': '',     # 세대수 제한 없음
            'maxHouseHoldCount': '',
            'showArticle': 'false',
            'sameAddressGroup': 'false',
            'minMaintenanceCost': '',
            'maxMaintenanceCost': '',
            'directions': '',
            'leftLon': str(left_lon),
            'rightLon': str(right_lon),
            'topLat': str(top_lat),
            'bottomLat': str(bottom_lat),
            'isPresale': 'true'
        }
        
        return params

    async def call_api(self, dong: str, coords: Tuple[float, float, float, float], trade_type: str) -> Optional[List[Dict]]:
        """네이버 API 호출"""
        params = await self.build_api_params(dong, coords, trade_type)
        url = f"{self.base_url}?{urlencode(params)}"
        
        logger.info(f"🔍 API 호출: {dong} - {trade_type}")
        
        for attempt in range(3):
            try:
                async with self.session.get(url) as response:
                    if response.status == 200:
                        content_type = response.headers.get('content-type', '')
                        
                        if 'json' in content_type:
                            data = await response.json()
                            
                            if isinstance(data, list):
                                logger.info(f"✅ {dong} {trade_type}: {len(data)}개 데이터 수신")
                                return data
                            else:
                                logger.warning(f"⚠️ {dong} {trade_type}: 예상과 다른 응답 형식")
                                return []
                        else:
                            logger.warning(f"⚠️ {dong} {trade_type}: JSON이 아닌 응답")
                            return []
                    else:
                        logger.warning(f"⚠️ {dong} {trade_type}: HTTP {response.status}")
                        
            except Exception as e:
                logger.warning(f"⚠️ {dong} {trade_type}: API 호출 오류 - {e}")
            
            if attempt < 2:
                # IP 차단 방지 딜레이
                delay = random.uniform(10, 15)  # 10-15초 랜덤 딜레이
                logger.info(f"⏳ {delay:.1f}초 대기 중...")
                await asyncio.sleep(delay)
        
        logger.error(f"❌ {dong} {trade_type}: 모든 재시도 실패")
        return None

    def save_apartments(self, apartments_data: List[Dict], dong: str, trade_type: str):
        """아파트 데이터 저장"""
        if not apartments_data:
            return 0
            
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        saved_count = 0
        
        for item in apartments_data:
            try:
                complex_id = str(item.get('markerId', ''))
                if not complex_id:
                    continue
                
                # 중복 확인 및 업데이트
                cursor.execute("""
                    SELECT id, trade_types FROM dong_apartments WHERE complex_id = ?
                """, (complex_id,))
                
                existing = cursor.fetchone()
                
                if existing:
                    # 기존 데이터 업데이트 (거래 타입 추가)
                    existing_id, existing_trade_types = existing
                    trade_types_list = existing_trade_types.split(',') if existing_trade_types else []
                    
                    if trade_type not in trade_types_list:
                        trade_types_list.append(trade_type)
                    
                    # 거래 타입별 가격 정보 업데이트
                    update_fields = ['trade_types = ?']
                    update_values = [','.join(trade_types_list)]
                    
                    if trade_type == "매매":
                        update_fields.extend(['deal_min_price = ?', 'deal_max_price = ?', 'deal_count = ?'])
                        update_values.extend([
                            item.get('minDealPrice'),
                            item.get('maxDealPrice'), 
                            item.get('dealCount', 0)
                        ])
                    elif trade_type == "전세":
                        update_fields.extend(['lease_min_price = ?', 'lease_max_price = ?', 'lease_count = ?'])
                        update_values.extend([
                            item.get('minLeasePrice'),
                            item.get('maxLeasePrice'),
                            item.get('leaseCount', 0)
                        ])
                    elif trade_type == "월세":
                        update_fields.extend(['rent_min_price = ?', 'rent_max_price = ?', 'rent_count = ?'])
                        update_values.extend([
                            item.get('minRentPrice'),
                            item.get('maxRentPrice'),
                            item.get('rentCount', 0)
                        ])
                    
                    update_values.append(complex_id)
                    
                    cursor.execute(f"""
                        UPDATE dong_apartments 
                        SET {', '.join(update_fields)}
                        WHERE complex_id = ?
                    """, update_values)
                    
                else:
                    # 새 데이터 삽입
                    deal_min = deal_max = deal_count = None
                    lease_min = lease_max = lease_count = None  
                    rent_min = rent_max = rent_count = None
                    
                    if trade_type == "매매":
                        deal_min = item.get('minDealPrice')
                        deal_max = item.get('maxDealPrice')
                        deal_count = item.get('dealCount', 0)
                    elif trade_type == "전세":
                        lease_min = item.get('minLeasePrice')
                        lease_max = item.get('maxLeasePrice')
                        lease_count = item.get('leaseCount', 0)
                    elif trade_type == "월세":
                        rent_min = item.get('minRentPrice')
                        rent_max = item.get('maxRentPrice')
                        rent_count = item.get('rentCount', 0)
                    
                    cursor.execute("""
                        INSERT INTO dong_apartments (
                            complex_id, complex_name, city, gu, dong,
                            address_road, address_jibun, latitude, longitude,
                            total_units, construction_year,
                            deal_min_price, deal_max_price, deal_count,
                            lease_min_price, lease_max_price, lease_count,
                            rent_min_price, rent_max_price, rent_count,
                            min_area, max_area, representative_area,
                            real_estate_type, trade_types, raw_data
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        complex_id,
                        item.get('complexName'),
                        '서울',
                        '서초구', 
                        dong,
                        f"서울 서초구 {dong}",
                        f"서울 서초구 {dong}",
                        item.get('latitude'),
                        item.get('longitude'),
                        item.get('totalHouseholdCount'),
                        self.extract_construction_year(item.get('completionYearMonth')),
                        deal_min, deal_max, deal_count,
                        lease_min, lease_max, lease_count,
                        rent_min, rent_max, rent_count,
                        item.get('minArea'),
                        item.get('maxArea'),
                        item.get('representativeArea'),
                        item.get('realEstateTypeName'),
                        trade_type,
                        json.dumps(item, ensure_ascii=False)
                    ))
                
                saved_count += 1
                
            except Exception as e:
                logger.error(f"데이터 저장 오류: {e}")
                continue
        
        conn.commit()
        conn.close()
        
        logger.info(f"💾 {dong} {trade_type}: {saved_count}개 아파트 저장 완료")
        return saved_count

    def extract_construction_year(self, year_month: str) -> Optional[int]:
        """건축년월에서 년도 추출"""
        if not year_month:
            return None
        try:
            if len(str(year_month)) >= 4:
                return int(str(year_month)[:4])
        except:
            pass
        return None

    async def crawl_dong_all_trades(self, dong: str, coords: Tuple[float, float, float, float]):
        """특정 동의 모든 거래 타입 크롤링"""
        logger.info(f"🏘️ {dong} 크롤링 시작")
        
        total_apartments = 0
        trade_types = self.get_trade_types()
        
        for trade_type in trade_types:
            try:
                # 진행 상황 기록
                conn = sqlite3.connect(self.db_path)
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO crawling_progress (city, gu, dong, trade_type, status, crawl_start_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, ('서울', '서초구', dong, trade_type, 'processing', datetime.now()))
                conn.commit()
                progress_id = cursor.lastrowid
                conn.close()
                
                # API 호출
                data = await self.call_api(dong, coords, trade_type)
                
                if data is not None:
                    count = self.save_apartments(data, dong, trade_type)
                    total_apartments += count
                    
                    # 성공 기록
                    conn = sqlite3.connect(self.db_path)
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE crawling_progress 
                        SET status = ?, apartment_count = ?, crawl_end_time = ?
                        WHERE id = ?
                    """, ('completed', count, datetime.now(), progress_id))
                    conn.commit()
                    conn.close()
                    
                else:
                    # 실패 기록  
                    conn = sqlite3.connect(self.db_path)
                    cursor = conn.cursor()
                    cursor.execute("""
                        UPDATE crawling_progress
                        SET status = ?, error_message = ?, crawl_end_time = ?
                        WHERE id = ?
                    """, ('failed', 'API 호출 실패', datetime.now(), progress_id))
                    conn.commit()
                    conn.close()
                
                # 거래 타입 간 딜레이
                delay = random.uniform(8, 12)
                logger.info(f"⏳ 다음 거래 타입까지 {delay:.1f}초 대기...")
                await asyncio.sleep(delay)
                
            except Exception as e:
                logger.error(f"❌ {dong} {trade_type} 크롤링 오류: {e}")
                continue
        
        logger.info(f"🎯 {dong} 완료: 총 {total_apartments}개 아파트")
        return total_apartments

    async def test_seocho_crawling(self):
        """서초구 동단위 테스트 크롤링"""
        logger.info("🚀 서초구 동단위 크롤링 시작")
        
        await self.init_session()
        
        try:
            dong_coords = self.get_seocho_dong_coordinates()
            total_count = 0
            
            for dong, coords in dong_coords.items():
                logger.info(f"📍 {dong} 크롤링 시작...")
                
                count = await self.crawl_dong_all_trades(dong, coords)
                total_count += count
                
                # 동 간 딜레이 (IP 차단 방지)
                delay = random.uniform(15, 25)
                logger.info(f"⏳ 다음 동까지 {delay:.1f}초 대기...")
                await asyncio.sleep(delay)
                
            logger.info(f"🎉 서초구 크롤링 완료! 총 {total_count}개 아파트 수집")
            
        finally:
            await self.close_session()

    def generate_report(self):
        """크롤링 결과 리포트"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 전체 통계
        cursor.execute("SELECT COUNT(*) FROM dong_apartments")
        total_apartments = cursor.fetchone()[0]
        
        # 동별 통계
        cursor.execute("""
            SELECT dong, COUNT(*) as count,
                   COUNT(CASE WHEN deal_min_price IS NOT NULL THEN 1 END) as deal_count,
                   COUNT(CASE WHEN lease_min_price IS NOT NULL THEN 1 END) as lease_count,
                   COUNT(CASE WHEN rent_min_price IS NOT NULL THEN 1 END) as rent_count
            FROM dong_apartments 
            GROUP BY dong 
            ORDER BY count DESC
        """)
        dong_stats = cursor.fetchall()
        
        # 진행 상황
        cursor.execute("""
            SELECT status, COUNT(*) 
            FROM crawling_progress 
            GROUP BY status
        """)
        progress_stats = cursor.fetchall()
        
        conn.close()
        
        print("\n" + "="*60)
        print("📊 서초구 동단위 크롤링 결과 리포트")
        print("="*60)
        print(f"🏢 총 아파트 단지: {total_apartments}개")
        print(f"🏘️ 크롤링 완료 동: {len(dong_stats)}개")
        
        print("\n📍 동별 상세 현황:")
        for dong, count, deal, lease, rent in dong_stats:
            print(f"  {dong:12s}: {count:3d}개 (매매:{deal}, 전세:{lease}, 월세:{rent})")
        
        print("\n⚙️ 크롤링 진행 상황:")
        for status, count in progress_stats:
            print(f"  {status:12s}: {count}건")

async def main():
    """메인 실행 함수"""
    print("🚀 서초구 동단위 테스트 크롤링 시작!")
    print("📋 크롤링 조건:")
    print("  - 대상: 서울 서초구 18개 동")
    print("  - 거래타입: 매매 + 전세 + 월세 (전체)")
    print("  - 아파트타입: 아파트 + 분양권 + 주택 (전체)")
    print("  - 가격대: 무제한")
    print("  - 면적: 무제한") 
    print("  - 세대수: 무제한")
    print("  - 건축년도: 무제한")
    print("  - IP 차단 방지: 10-25초 랜덤 딜레이")
    
    crawler = DongLevelCrawler()
    
    start_time = time.time()
    await crawler.test_seocho_crawling()
    end_time = time.time()
    
    crawler.generate_report()
    
    print(f"\n⏱️ 총 소요 시간: {(end_time - start_time)/60:.1f}분")
    print("📁 결과 저장: dong_level_apartments.db")

if __name__ == "__main__":
    asyncio.run(main())