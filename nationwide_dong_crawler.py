#!/usr/bin/env python3
"""
전국 동단위 완전 크롤링 시스템
- 전국 모든 시/구/동 세분화 크롤링
- 모든 거래 타입 포함 (매매+전세+월세)
- IP 차단 방지 시스템
- 대용량 데이터 처리 최적화
- 자동 재시도 및 복구 시스템
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
import sys
import os

# 로깅 설정 (먼저 설정)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('nationwide_dong_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# VPN 매니저 import를 위한 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules', 'naver-crawler'))

try:
    from utils.vpn_manager import VPNManager, ensure_safe_connection, handle_ip_blocked
    VPN_AVAILABLE = True
    logger.info("✅ VPN 백업 시스템 사용 가능")
except ImportError as e:
    VPN_AVAILABLE = False
    logger.warning(f"⚠️ VPN 매니저 import 실패: {e}")
    logger.warning("⚠️ VPN 없이 진행합니다")

class NationwideDongCrawler:
    def __init__(self, db_path="real_estate_crawling.db"):
        self.db_path = db_path
        self.base_url = "https://new.land.naver.com/api/complexes/single-markers/2.0"
        self.session = None
        self.vpn_manager = VPNManager() if VPN_AVAILABLE else None
        self.blocked_count = 0  # 차단 횟수 추적
        self.max_blocked_attempts = 3  # 최대 차단 허용 횟수
        self.init_database()
        
    def init_database(self):
        """데이터베이스 초기화 - 상세한 스키마"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 기존 테이블 삭제하고 새로운 구조로 생성
        cursor.execute('DROP TABLE IF EXISTS apartment_complexes')
        cursor.execute('DROP TABLE IF EXISTS crawling_progress')
        
        # 새로운 상세 아파트 테이블
        cursor.execute('''
            CREATE TABLE apartment_complexes (
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
                
                -- 매매 가격 (만원)
                deal_min_price INTEGER,
                deal_max_price INTEGER,
                deal_count INTEGER DEFAULT 0,
                
                -- 전세 가격 (만원)
                lease_min_price INTEGER,
                lease_max_price INTEGER,
                lease_count INTEGER DEFAULT 0,
                
                -- 월세 가격 (만원)
                rent_min_price INTEGER,
                rent_max_price INTEGER,
                rent_min_deposit INTEGER,
                rent_max_deposit INTEGER,
                rent_count INTEGER DEFAULT 0,
                
                -- 면적 정보 (㎡)
                min_area REAL,
                max_area REAL,
                representative_area REAL,
                
                -- 메타 정보
                real_estate_type TEXT,
                trade_types TEXT,  -- 매매,전세,월세 중 어떤 거래가 있는지
                source_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                
                -- 원본 데이터
                raw_data TEXT
            )
        ''')
        
        # 크롤링 진행 상황 테이블
        cursor.execute('''
            CREATE TABLE crawling_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT,
                gu TEXT,  
                dong TEXT,
                trade_type TEXT,
                status TEXT,  -- pending, processing, completed, failed, skipped
                apartment_count INTEGER DEFAULT 0,
                crawl_start_time TIMESTAMP,
                crawl_end_time TIMESTAMP,
                error_message TEXT,
                retry_count INTEGER DEFAULT 0
            )
        ''')
        
        # 인덱스 생성
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_complex_id ON apartment_complexes(complex_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_location ON apartment_complexes(city, gu, dong)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_progress ON crawling_progress(city, gu, dong, trade_type)')
        
        conn.commit()
        conn.close()
        logger.info("✅ 새로운 상세 데이터베이스 구조 초기화 완료")

    async def init_session(self):
        """HTTP 세션 초기화 + VPN 연결 확인"""
        # VPN 백업 시스템으로 안전한 연결 보장
        if VPN_AVAILABLE and self.vpn_manager:
            try:
                logger.info("🔍 VPN 백업 시스템으로 안전한 연결 확인 중...")
                success, ip, vpn_type = await ensure_safe_connection()
                
                if success:
                    logger.info(f"✅ {vpn_type} 연결 성공 - IP: {ip}")
                    self.current_vpn = vpn_type
                    self.current_ip = ip
                else:
                    logger.warning("⚠️ VPN 연결 실패, 일반 연결로 진행")
                    self.current_vpn = "None"
                    self.current_ip = "Unknown"
            except Exception as e:
                logger.error(f"❌ VPN 시스템 오류: {e}")
                logger.warning("⚠️ VPN 없이 진행합니다")
                self.current_vpn = "None"
                self.current_ip = "Unknown"
        else:
            logger.info("ℹ️ VPN 시스템 없이 진행")
            self.current_vpn = "None"
            self.current_ip = "Unknown"
        
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

    def get_nationwide_regions(self) -> Dict[str, Dict[str, List[Tuple[str, str]]]]:
        """전국 시/구/동 좌표 데이터"""
        return {
            "서울": {
                "강남구": [
                    ("신사동", "1168010500"),
                    ("논현동", "1168010500"),
                    ("압구정동", "1168010500"),
                    ("청담동", "1168010500"),
                    ("삼성동", "1168010500"),
                    ("대치동", "1168010500"),
                    ("역삼동", "1168010500"),
                    ("도곡동", "1168010500"),
                    ("개포동", "1168010500"),
                    ("세곡동", "1168010500"),
                    ("자곡동", "1168010500"),
                    ("율현동", "1168010500"),
                    ("일원동", "1168010500"),
                    ("수서동", "1168010500")
                ],
                "서초구": [
                    ("서초동", "1168011900"),
                    ("잠원동", "1168011900"),
                    ("반포동", "1168011900"),
                    ("방배동", "1168011900"),
                    ("양재동", "1168011900"),
                    ("내곡동", "1168011900"),
                    ("염곡동", "1168011900"),
                    ("원지동", "1168011900"),
                    ("우면동", "1168011900"),
                    ("신반포동", "1168011900"),
                    ("개포동", "1168011900"),
                    ("도곡동", "1168011900"),
                    ("대치동", "1168011900"),
                    ("역삼동", "1168011900"),
                    ("논현동", "1168011900"),
                    ("반포본동", "1168011900"),
                    ("서초중앙동", "1168011900"),
                    ("가락동", "1168011900")
                ],
                "송파구": [
                    ("가락동", "1168012200"),
                    ("거여동", "1168012200"),
                    ("마천동", "1168012200"),
                    ("문정동", "1168012200"),
                    ("방이동", "1168012200"),
                    ("삼전동", "1168012200"),
                    ("석촌동", "1168012200"),
                    ("송파동", "1168012200"),
                    ("신천동", "1168012200"),
                    ("오금동", "1168012200"),
                    ("오륜동", "1168012200"),
                    ("잠실동", "1168012200"),
                    ("장지동", "1168012200"),
                    ("풍납동", "1168012200")
                ],
                "강동구": [
                    ("강일동", "1168010600"),
                    ("고덕동", "1168010600"),
                    ("길동", "1168010600"),
                    ("둔촌동", "1168010600"),
                    ("명일동", "1168010600"),
                    ("상일동", "1168010600"),
                    ("성내동", "1168010600"),
                    ("암사동", "1168010600"),
                    ("천호동", "1168010600")
                ],
                "마포구": [
                    ("공덕동", "1168011700"),
                    ("구수동", "1168011700"),
                    ("노고산동", "1168011700"),
                    ("대흥동", "1168011700"),
                    ("도화동", "1168011700"),
                    ("동교동", "1168011700"),
                    ("마포동", "1168011700"),
                    ("망원동", "1168011700"),
                    ("상암동", "1168011700"),
                    ("상수동", "1168011700"),
                    ("서교동", "1168011700"),
                    ("성산동", "1168011700"),
                    ("신공덕동", "1168011700"),
                    ("아현동", "1168011700"),
                    ("연남동", "1168011700"),
                    ("염리동", "1168011700"),
                    ("용강동", "1168011700"),
                    ("토정동", "1168011700"),
                    ("하중동", "1168011700"),
                    ("합정동", "1168011700"),
                    ("현석동", "1168011700")
                ]
            },
            "부산": {
                "해운대구": [
                    ("우동", "2644010100"),
                    ("중동", "2644010100"),
                    ("좌동", "2644010100"),
                    ("송정동", "2644010100"),
                    ("반여동", "2644010100"),
                    ("반송동", "2644010100"),
                    ("재송동", "2644010100")
                ],
                "수영구": [
                    ("남천동", "2644010200"),
                    ("민락동", "2644010200"),
                    ("수영동", "2644010200"),
                    ("망미동", "2644010200"),
                    ("광안동", "2644010200")
                ]
            },
            "인천": {
                "연수구": [
                    ("연수동", "2811010400"),
                    ("선학동", "2811010400"),
                    ("청학동", "2811010400"),
                    ("동춘동", "2811010400"),
                    ("송도동", "2811010400"),
                    ("옥련동", "2811010400")
                ]
            }
        }

    def get_dong_coordinates(self, city: str, gu: str, dong: str) -> Tuple[float, float, float, float]:
        """동단위 상세 좌표 계산"""
        # 기본 좌표 맵핑 (실제로는 더 정확한 좌표 사용)
        base_coords = {
            # 서울 강남구
            "서울_강남구_신사동": (127.020, 127.030, 37.525, 37.515),
            "서울_강남구_논현동": (127.025, 127.035, 37.515, 37.505),
            "서울_강남구_압구정동": (127.025, 127.035, 37.530, 37.520),
            "서울_강남구_청담동": (127.040, 127.050, 37.525, 37.515),
            "서울_강남구_삼성동": (127.050, 127.060, 37.515, 37.505),
            "서울_강남구_대치동": (127.055, 127.065, 37.505, 37.495),
            "서울_강남구_역삼동": (127.030, 127.040, 37.505, 37.495),
            "서울_강남구_도곡동": (127.040, 127.050, 37.495, 37.485),
            "서울_강남구_개포동": (127.055, 127.065, 37.485, 37.475),
            
            # 서울 서초구 (기존 테스트 데이터 활용)
            "서울_서초구_방배동": (126.995, 127.015, 37.485, 37.475),
            "서울_서초구_서초동": (127.015, 127.035, 37.495, 37.485),
            "서울_서초구_반포동": (126.995, 127.015, 37.515, 37.505),
            "서울_서초구_잠원동": (127.015, 127.035, 37.525, 37.515),
            
            # 기본값
            "default": (127.000, 127.020, 37.500, 37.480)
        }
        
        key = f"{city}_{gu}_{dong}"
        return base_coords.get(key, base_coords["default"])

    def get_trade_types(self) -> List[str]:
        """거래 타입 목록"""
        return ["매매", "전세", "월세"]

    def get_trade_type_code(self, trade_type: str) -> str:
        """거래 타입 코드 변환"""
        codes = {
            "매매": "A1",
            "전세": "B1", 
            "월세": "B2"
        }
        return codes.get(trade_type, "A1")

    async def crawl_dong_trade_type(self, city: str, gu: str, dong: str, region_code: str, trade_type: str) -> int:
        """특정 동의 특정 거래타입 크롤링"""
        coords = self.get_dong_coordinates(city, gu, dong)
        trade_code = self.get_trade_type_code(trade_type)
        
        # 이미 완료된 경우 스킵
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT status FROM crawling_progress 
            WHERE city = ? AND gu = ? AND dong = ? AND trade_type = ? AND status = 'completed'
        """, (city, gu, dong, trade_type))
        
        if cursor.fetchone():
            conn.close()
            logger.info(f"⏭️ {city} {gu} {dong} {trade_type}: 이미 완료됨")
            return 0
        conn.close()
        
        # 진행 상황 기록
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO crawling_progress 
            (city, gu, dong, trade_type, status, crawl_start_time, retry_count)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        """, (city, gu, dong, trade_type, 'processing', datetime.now()))
        conn.commit()
        progress_id = cursor.lastrowid
        conn.close()
        
        try:
            # API 파라미터 구성
            left_lon, right_lon, top_lat, bottom_lat = coords
            
            params = {
                'cortarNo': region_code,
                'zoom': '17',  # 매우 높은 줌 레벨
                'priceType': 'RETAIL',
                'markerId': '',
                'markerType': '',
                'selectedComplexNo': '',
                'selectedComplexBuildingNo': '',
                'fakeComplexMarker': '',
                'realEstateType': 'APT:ABYG:JGC:PRE',
                'tradeType': trade_code,
                'tag': '::::::::',
                'rentPriceMin': '0',
                'rentPriceMax': '999999999',
                'priceMin': '0',
                'priceMax': '999999999',
                'areaMin': '0',
                'areaMax': '999999999',
                'oldBuildYears': '99',
                'recentlyBuildYears': '0',
                'minHouseHoldCount': '',
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
            
            url = f"{self.base_url}?{urlencode(params)}"
            logger.info(f"🔍 API 호출: {city} {gu} {dong} {trade_type}")
            
            # API 호출 + 차단 감지 및 VPN 전환
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if isinstance(data, list):
                        count = self.save_apartments(data, city, gu, dong, trade_type)
                        
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
                        
                        # 성공 시 차단 카운트 리셋
                        self.blocked_count = 0
                        logger.info(f"✅ {city} {gu} {dong} {trade_type}: {count}개 수집")
                        return count
                    else:
                        logger.warning(f"⚠️ {city} {gu} {dong} {trade_type}: 예상과 다른 응답")
                        return 0
                        
                elif response.status in [403, 429, 503]:  # 차단 의심 상태 코드
                    logger.warning(f"🚨 {city} {gu} {dong} {trade_type}: 차단 의심 HTTP {response.status}")
                    
                    # VPN 전환 시도
                    if VPN_AVAILABLE and self.vpn_manager:
                        success = await self.handle_blocking_detection(f"HTTP {response.status}")
                        if success:
                            logger.info("🔄 VPN 전환 후 재시도")
                            # 재시도 로직은 상위 함수에서 처리하도록 Exception 발생
                            raise Exception(f"VPN_SWITCH_RETRY_{response.status}")
                    
                    return 0
                else:
                    logger.warning(f"⚠️ {city} {gu} {dong} {trade_type}: HTTP {response.status}")
                    return 0
                    
        except Exception as e:
            error_message = str(e)
            
            # VPN 전환 재시도인 경우
            if "VPN_SWITCH_RETRY" in error_message:
                logger.info(f"🔄 VPN 전환 후 {city} {gu} {dong} {trade_type} 재시도")
                
                # 재시도 딜레이
                await asyncio.sleep(random.uniform(5, 10))
                
                # 재귀 호출로 재시도 (최대 3회)
                if hasattr(self, '_retry_count'):
                    self._retry_count += 1
                else:
                    self._retry_count = 1
                    
                if self._retry_count <= 3:
                    logger.info(f"📡 재시도 {self._retry_count}/3: {city} {gu} {dong} {trade_type}")
                    result = await self.crawl_dong_trade_type(city, gu, dong, region_code, trade_type)
                    self._retry_count = 0  # 성공 시 카운트 리셋
                    return result
                else:
                    logger.error(f"❌ 최대 재시도 횟수 초과: {city} {gu} {dong} {trade_type}")
                    self._retry_count = 0
            
            # 실패 기록
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE crawling_progress
                SET status = ?, error_message = ?, crawl_end_time = ?
                WHERE id = ?
            """, ('failed', error_message, datetime.now(), progress_id))
            conn.commit()
            conn.close()
            
            logger.error(f"❌ {city} {gu} {dong} {trade_type}: {error_message}")
            return 0

    def save_apartments(self, apartments_data: List[Dict], city: str, gu: str, dong: str, trade_type: str) -> int:
        """아파트 데이터 저장 (중복 제거 및 업데이트)"""
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
                
                # 중복 확인
                cursor.execute("""
                    SELECT id, trade_types FROM apartment_complexes WHERE complex_id = ?
                """, (complex_id,))
                
                existing = cursor.fetchone()
                
                if existing:
                    # 기존 데이터 업데이트
                    existing_id, existing_trade_types = existing
                    trade_types_list = existing_trade_types.split(',') if existing_trade_types else []
                    
                    if trade_type not in trade_types_list:
                        trade_types_list.append(trade_type)
                    
                    # 거래 타입별 가격 정보 업데이트
                    update_fields = ['trade_types = ?', 'updated_at = ?']
                    update_values = [','.join(trade_types_list), datetime.now()]
                    
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
                        UPDATE apartment_complexes 
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
                        INSERT INTO apartment_complexes (
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
                        city,
                        gu, 
                        dong,
                        f"{city} {gu} {dong}",
                        f"{city} {gu} {dong}",
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
        
        return saved_count

    async def handle_blocking_detection(self, content: str = "") -> bool:
        """차단 감지 시 VPN 전환 처리"""
        if not VPN_AVAILABLE or not self.vpn_manager:
            logger.warning("⚠️ VPN 시스템을 사용할 수 없어 차단 대응 불가")
            return False
            
        try:
            self.blocked_count += 1
            logger.warning(f"🚨 차단 감지 ({self.blocked_count}/{self.max_blocked_attempts}): {content}")
            
            # 최대 차단 횟수 초과 시 중단
            if self.blocked_count >= self.max_blocked_attempts:
                logger.error(f"❌ 최대 차단 횟수 초과. 크롤링 중단")
                return False
                
            # VPN 전환 시도
            logger.info("🔄 VPN 전환 시도 중...")
            success, new_ip, new_vpn_type = await handle_ip_blocked(content)
            
            if success:
                logger.info(f"✅ VPN 전환 성공: {self.current_vpn} → {new_vpn_type} (IP: {new_ip})")
                self.current_vpn = new_vpn_type
                self.current_ip = new_ip
                
                # 세션 재생성
                if self.session:
                    await self.session.close()
                    await asyncio.sleep(2)
                
                # 새 세션 초기화 (헤더 만 새로 설정)
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
                
                logger.info("✅ 새 세션으로 준비 완료")
                return True
            else:
                logger.error(f"❌ VPN 전환 실패: {new_ip}")
                return False
                
        except Exception as e:
            logger.error(f"❌ VPN 전환 오류: {e}")
            return False

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

    async def crawl_nationwide(self):
        """전국 동단위 크롤링"""
        logger.info("🚀 전국 동단위 크롤링 시작!")
        
        await self.init_session()
        
        # 현재 VPN 상태 로깅
        if hasattr(self, 'current_vpn') and hasattr(self, 'current_ip'):
            logger.info(f"🔍 현재 연결 상태: {self.current_vpn} (IP: {self.current_ip})")
        else:
            logger.info("🔍 연결 상태: 일반 인터넷 연결")
        
        try:
            regions = self.get_nationwide_regions()
            total_count = 0
            
            for city, gus in regions.items():
                logger.info(f"🏙️ {city} 크롤링 시작")
                
                for gu, dongs in gus.items():
                    logger.info(f"📍 {city} {gu} 크롤링 시작")
                    
                    for dong, region_code in dongs:
                        logger.info(f"🏘️ {city} {gu} {dong} 크롤링 시작")
                        
                        dong_count = 0
                        
                        for trade_type in self.get_trade_types():
                            count = await self.crawl_dong_trade_type(city, gu, dong, region_code, trade_type)
                            dong_count += count
                            
                            # 거래 타입 간 딜레이 + VPN 상태 표시
                            delay = random.uniform(8, 12)
                            vpn_status = f"[{self.current_vpn}]" if hasattr(self, 'current_vpn') and self.current_vpn != "None" else ""
                            logger.info(f"⏳ {vpn_status} 다음 거래 타입까지 {delay:.1f}초 대기...")
                            await asyncio.sleep(delay)
                        
                        total_count += dong_count
                        logger.info(f"🎯 {city} {gu} {dong} 완료: {dong_count}개 아파트")
                        
                        # 동 간 딜레이 + VPN 상태 표시
                        delay = random.uniform(15, 25)
                        vpn_status = f"[{self.current_vpn}]" if hasattr(self, 'current_vpn') and self.current_vpn != "None" else ""
                        logger.info(f"⏳ {vpn_status} 다음 동까지 {delay:.1f}초 대기...")
                        await asyncio.sleep(delay)
                    
                    logger.info(f"✅ {city} {gu} 완료")
                    
                logger.info(f"🎉 {city} 완료!")
            
            logger.info(f"🏆 전국 크롤링 완료! 총 {total_count}개 아파트 수집")
            
        finally:
            await self.close_session()

    def generate_progress_report(self):
        """진행 상황 리포트"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 전체 통계
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
        total_apartments = cursor.fetchone()[0]
        
        # 지역별 통계
        cursor.execute("""
            SELECT city, gu, COUNT(*) as count
            FROM apartment_complexes 
            GROUP BY city, gu 
            ORDER BY city, gu
        """)
        region_stats = cursor.fetchall()
        
        # 거래 타입별 통계
        cursor.execute("""
            SELECT 
                COUNT(CASE WHEN deal_min_price IS NOT NULL THEN 1 END) as deal_count,
                COUNT(CASE WHEN lease_min_price IS NOT NULL THEN 1 END) as lease_count,
                COUNT(CASE WHEN rent_min_price IS NOT NULL THEN 1 END) as rent_count
            FROM apartment_complexes
        """)
        trade_stats = cursor.fetchone()
        
        # 진행 상황
        cursor.execute("""
            SELECT status, COUNT(*) 
            FROM crawling_progress 
            GROUP BY status
        """)
        progress_stats = cursor.fetchall()
        
        conn.close()
        
        print("\n" + "="*60)
        print("📊 전국 동단위 크롤링 진행 리포트")
        print("="*60)
        print(f"🏢 총 아파트 단지: {total_apartments:,}개")
        
        print("\n🗺️ 지역별 현황:")
        for city, gu, count in region_stats:
            print(f"  {city} {gu}: {count:,}개")
        
        print("\n💰 거래 타입별 현황:")
        if trade_stats:
            print(f"  매매: {trade_stats[0]:,}개")
            print(f"  전세: {trade_stats[1]:,}개")
            print(f"  월세: {trade_stats[2]:,}개")
        
        print("\n⚙️ 크롤링 진행 상황:")
        total_tasks = sum(count for status, count in progress_stats)
        for status, count in progress_stats:
            percentage = (count / total_tasks * 100) if total_tasks > 0 else 0
            print(f"  {status}: {count:,}건 ({percentage:.1f}%)")

async def main():
    """메인 실행 함수"""
    print("🚀 전국 동단위 크롤링 시작!")
    print("📋 크롤링 조건:")
    print("  - 대상: 전국 주요 도시 동단위")
    print("  - 거래타입: 매매 + 전세 + 월세 (전체)")
    print("  - 아파트타입: 아파트 + 분양권 + 주택 (전체)")
    print("  - 모든 조건: 무제한")
    print("  - IP 차단 방지: 8-25초 랜덤 딜레이")
    print("  - DB: 새로운 상세 구조")
    
    crawler = NationwideDongCrawler()
    
    start_time = time.time()
    await crawler.crawl_nationwide()
    end_time = time.time()
    
    crawler.generate_progress_report()
    
    print(f"\n⏱️ 총 소요 시간: {(end_time - start_time)/3600:.1f}시간")
    print("📁 결과 저장: real_estate_crawling.db (새로운 상세 구조)")

if __name__ == "__main__":
    asyncio.run(main())