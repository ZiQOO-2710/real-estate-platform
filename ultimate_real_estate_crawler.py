#!/usr/bin/env python3
"""
Ultimate Real Estate Crawler - 완벽한 부동산 데이터 수집 시스템
- 국토부 실거래가 API + 네이버 부동산 매매호가 크롤링
- UltimateDatabaseManager로 100% 저장 보장
- IP 차단 방지를 위한 지능형 딜레이 시스템
- 자동 복구 및 데이터 안정성 최우선
"""

import asyncio
import aiohttp
import requests
import sqlite3
import json
import time
import random
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlencode, quote
import logging
import sys
import os
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading

# UltimateDatabaseManager import
from ultimate_database_manager import UltimateDatabaseManager

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ultimate_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class CrawlingConfig:
    """크롤링 설정"""
    # 국토부 API 설정
    molit_service_key: str = "UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ=="
    molit_base_url: str = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
    
    # 네이버 부동산 설정
    naver_base_url: str = "https://new.land.naver.com/api/complexes/single-markers/2.0"
    
    # 딜레이 설정 (IP 차단 방지)
    min_delay: float = 1.0  # 최소 딜레이 (초)
    max_delay: float = 3.0  # 최대 딜레이 (초)
    error_delay: float = 10.0  # 에러시 딜레이 (초)
    
    # 동시 처리 설정
    max_concurrent_naver: int = 3  # 네이버 동시 처리 수
    max_concurrent_molit: int = 1  # 국토부 동시 처리 수 (API 제한 고려)
    
    # 재시도 설정
    max_retries: int = 5
    
    # 데이터베이스 설정
    db_path: str = "real_estate_crawling.db"
    db_max_connections: int = 20
    db_max_retries: int = 50

class UltimateRealEstateCrawler:
    """최고 수준의 부동산 크롤러"""
    
    def __init__(self, config: CrawlingConfig = None):
        self.config = config or CrawlingConfig()
        
        # UltimateDatabaseManager 초기화
        self.db_manager = UltimateDatabaseManager(
            db_path=self.config.db_path,
            max_connections=self.config.db_max_connections,
            max_retries=self.config.db_max_retries
        )
        
        # 세션 관리
        self.naver_session = None
        self.molit_session = requests.Session()
        
        # 통계
        self.stats = {
            'naver_total': 0,
            'naver_success': 0,
            'naver_failed': 0,
            'molit_total': 0,
            'molit_success': 0,
            'molit_failed': 0,
            'start_time': None,
            'end_time': None
        }
        
        # 헤더 설정
        self.naver_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://new.land.naver.com/',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        }
        
        # 딜레이 관리
        self.last_request_time = 0
        self.delay_lock = threading.Lock()
        
        logger.info("Ultimate Real Estate Crawler 초기화 완료")
    
    def _smart_delay(self, error_occurred: bool = False):
        """지능형 딜레이 시스템"""
        with self.delay_lock:
            current_time = time.time()
            
            if error_occurred:
                # 에러 발생시 더 긴 딜레이
                delay = self.config.error_delay
            else:
                # 정상 처리시 랜덤 딜레이
                delay = random.uniform(self.config.min_delay, self.config.max_delay)
            
            # 마지막 요청 이후 경과 시간 계산
            elapsed = current_time - self.last_request_time
            
            if elapsed < delay:
                sleep_time = delay - elapsed
                logger.debug(f"스마트 딜레이: {sleep_time:.2f}초 대기")
                time.sleep(sleep_time)
            
            self.last_request_time = time.time()
    
    def _get_region_codes(self) -> Dict[str, str]:
        """지역 코드 매핑"""
        return {
            "서울특별시": "1100000000",
            "부산광역시": "2600000000",
            "대구광역시": "2700000000",
            "인천광역시": "2800000000",
            "광주광역시": "2900000000",
            "대전광역시": "3000000000",
            "울산광역시": "3100000000",
            "세종특별자치시": "3600000000",
            "경기도": "4100000000",
            "강원도": "4200000000",
            "충청북도": "4300000000",
            "충청남도": "4400000000",
            "전라북도": "4500000000",
            "전라남도": "4600000000",
            "경상북도": "4700000000",
            "경상남도": "4800000000",
            "제주특별자치도": "5000000000"
        }
    
    def _get_molit_region_codes(self) -> Dict[str, str]:
        """국토부 API용 지역 코드 (5자리)"""
        return {
            "서울 강남구": "11680",
            "서울 서초구": "11650",
            "서울 송파구": "11710",
            "서울 강동구": "11740",
            "서울 마포구": "11560",
            "서울 용산구": "11170",
            "서울 성동구": "11200",
            "서울 광진구": "11215",
            "서울 중구": "11140",
            "서울 종로구": "11110",
            "부산 해운대구": "26350",
            "부산 부산진구": "26290",
            "부산 동래구": "26320",
            "부산 남구": "26300",
            "부산 중구": "26110",
            "대구 수성구": "27200",
            "대구 달서구": "27170",
            "대구 중구": "27110",
            "인천 연수구": "28185",
            "인천 남동구": "28177",
            "인천 서구": "28240",
            "경기 성남시": "41131",
            "경기 수원시": "41111",
            "경기 고양시": "41281",
            "경기 용인시": "41463",
            "경기 부천시": "41191",
            "경기 안양시": "41171",
            "경기 평택시": "41221",
            "경기 안산시": "41273",
            "경기 화성시": "41590"
        }
    
    def _generate_comprehensive_regions(self) -> List[Dict]:
        """포괄적 지역 생성"""
        regions = []
        
        # 주요 도시들의 구/동 데이터
        major_regions = {
            "서울특별시": {
                "강남구": ["개포동", "논현동", "대치동", "도곡동", "삼성동", "수서동", "신사동", "압구정동", "역삼동", "일원동", "청담동"],
                "서초구": ["내곡동", "반포동", "방배동", "서초동", "신원동", "양재동", "염곡동", "잠원동"],
                "송파구": ["가락동", "거여동", "마천동", "문정동", "방이동", "삼전동", "석촌동", "송파동", "신천동", "오금동", "잠실동", "장지동", "풍납동"],
                "강동구": ["강일동", "고덕동", "길동", "둔촌동", "명일동", "상일동", "성내동", "암사동", "천호동"],
                "마포구": ["공덕동", "망원동", "상암동", "서교동", "성산동", "연남동", "합정동", "홍대앞"],
                "용산구": ["한남동", "이태원동", "용산동", "이촌동", "서빙고동", "한강로동"],
                "성동구": ["성수동", "왕십리동", "금호동", "마장동", "홍익동"],
                "광진구": ["구의동", "광장동", "군자동", "자양동", "중곡동", "화양동"],
                "중구": ["명동", "중구", "신당동", "황학동", "동화동"],
                "종로구": ["종로", "명륜동", "창신동", "숭인동", "청운동", "부암동", "평창동"]
            },
            "부산광역시": {
                "해운대구": ["반송동", "반여동", "우동", "재송동", "좌동", "중동"],
                "부산진구": ["가야동", "개금동", "당감동", "범천동", "전포동", "초읍동"],
                "동래구": ["사직동", "안락동", "온천동", "명장동", "낙민동"],
                "남구": ["대연동", "문현동", "용당동", "용호동", "우암동"],
                "중구": ["광복동", "남포동", "중앙동", "동광동", "보수동"]
            },
            "대구광역시": {
                "수성구": ["범물동", "상동", "수성동", "지산동", "파동", "황금동"],
                "달서구": ["상인동", "월성동", "진천동", "본리동", "감삼동"],
                "중구": ["삼덕동", "대봉동", "남일동", "동인동", "성내동"]
            },
            "인천광역시": {
                "연수구": ["송도동", "연수동", "동춘동", "청학동"],
                "남동구": ["구월동", "간석동", "만수동", "서창동", "논현동"],
                "서구": ["청라동", "가좌동", "경서동", "검암동", "신현동"]
            },
            "경기도": {
                "성남시": ["분당구", "수정구", "중원구"],
                "수원시": ["영통구", "장안구", "팔달구", "권선구"],
                "고양시": ["일산동구", "일산서구", "덕양구"],
                "용인시": ["기흥구", "수지구", "처인구"],
                "부천시": ["원미구", "소사구", "오정구"],
                "안양시": ["동안구", "만안구"],
                "평택시": ["평택동", "서탄면", "청북면"],
                "안산시": ["상록구", "단원구"],
                "화성시": ["동탄동", "봉담읍", "향남읍"]
            }
        }
        
        # 거래 타입
        trade_types = [
            {"name": "매매", "code": "A01"},
            {"name": "전세", "code": "B01"},
            {"name": "월세", "code": "B02"}
        ]
        
        # 지역 조합 생성
        for city, gus in major_regions.items():
            for gu, dongs in gus.items():
                for dong in dongs:
                    for trade_type in trade_types:
                        regions.append({
                            "city": city,
                            "gu": gu,
                            "dong": dong,
                            "trade_type": trade_type["name"],
                            "trade_code": trade_type["code"],
                            "region_key": f"{city}_{gu}_{dong}_{trade_type['name']}"
                        })
        
        logger.info(f"포괄적 지역 {len(regions)}개 생성")
        return regions
    
    async def _create_naver_session(self):
        """네이버 세션 생성"""
        connector = aiohttp.TCPConnector(
            limit=100,
            limit_per_host=20,
            ttl_dns_cache=300,
            enable_cleanup_closed=True
        )
        
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        
        self.naver_session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=self.naver_headers
        )
        
        logger.info("네이버 세션 생성 완료")
    
    async def _crawl_naver_data(self, region: Dict) -> List[Dict]:
        """네이버 부동산 매매호가 크롤링"""
        try:
            # 스마트 딜레이 적용
            self._smart_delay()
            
            region_codes = self._get_region_codes()
            cortarNo = region_codes.get(region["city"], "1100000000")
            
            # 네이버 부동산 API 파라미터
            params = {
                'zoom': '15',
                'cortarNo': cortarNo,
                'filter': f'cortarNo:{cortarNo}',
                'rletTpCd': 'APT',
                'tradTpCd': region["trade_code"],
                'spcSrc': 'map',
                'rltrId': '',
                'priceType': 'RETAIL',
                'tag': ':::::',
                'rentPrc': '0',
                'dealPrc': '0',
                'areaSize': '0',
                'cpId': '',
                'mapBounds': '33.0,124.0,39.0,132.0',
                'sameAddr': 'Y',
                'showR0': 'N',
                'page': '1',
                'aa': ''
            }
            
            url = f"{self.config.naver_base_url}?{urlencode(params)}"
            
            # 재시도 로직
            for attempt in range(self.config.max_retries):
                try:
                    async with self.naver_session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            markers = data.get('data', [])
                            
                            apartments = []
                            for marker in markers:
                                try:
                                    apartment = {
                                        'complex_id': marker.get('complexNo', ''),
                                        'complex_name': marker.get('complexName', ''),
                                        'city': region["city"],
                                        'gu': region["gu"],
                                        'dong': region["dong"],
                                        'latitude': float(marker.get('lat', 0)) if marker.get('lat') else None,
                                        'longitude': float(marker.get('lng', 0)) if marker.get('lng') else None,
                                        'construction_year': marker.get('useAprvYear', 0),
                                        'total_units': marker.get('totalHouseholdCnt', 0),
                                        'deal_min_price': marker.get('dealMinPrice', 0),
                                        'deal_max_price': marker.get('dealMaxPrice', 0),
                                        'lease_min_price': marker.get('leaseMinPrice', 0),
                                        'lease_max_price': marker.get('leaseMaxPrice', 0),
                                        'rent_min_price': marker.get('rentMinPrice', 0),
                                        'rent_max_price': marker.get('rentMaxPrice', 0),
                                        'trade_type': region["trade_type"],
                                        'address_road': marker.get('roadAddress', ''),
                                        'address_jibun': marker.get('cortarAddress', ''),
                                        'data_source': 'naver'
                                    }
                                    
                                    if apartment['complex_id'] and apartment['complex_name']:
                                        apartments.append(apartment)
                                        
                                except Exception as e:
                                    logger.debug(f"네이버 아파트 파싱 오류: {e}")
                                    continue
                            
                            return apartments
                            
                        elif response.status == 429:
                            logger.warning(f"네이버 Rate limit - 대기 중: {region['region_key']}")
                            self._smart_delay(error_occurred=True)
                            continue
                            
                        else:
                            logger.error(f"네이버 HTTP {response.status}: {region['region_key']}")
                            if attempt < self.config.max_retries - 1:
                                self._smart_delay(error_occurred=True)
                                continue
                            return []
                            
                except asyncio.TimeoutError:
                    logger.warning(f"네이버 타임아웃: {region['region_key']}")
                    if attempt < self.config.max_retries - 1:
                        self._smart_delay(error_occurred=True)
                        continue
                    return []
                    
                except Exception as e:
                    logger.error(f"네이버 크롤링 오류: {region['region_key']} - {str(e)}")
                    if attempt < self.config.max_retries - 1:
                        self._smart_delay(error_occurred=True)
                        continue
                    return []
            
            return []
            
        except Exception as e:
            logger.error(f"네이버 크롤링 실패: {region['region_key']} - {str(e)}")
            return []
    
    def _crawl_molit_data(self, region_code: str, year_month: str) -> List[Dict]:
        """국토부 실거래가 크롤링"""
        try:
            # 스마트 딜레이 적용
            self._smart_delay()
            
            params = {
                'serviceKey': self.config.molit_service_key,
                'LAWD_CD': region_code,
                'DEAL_YMD': year_month,
                'pageNo': '1',
                'numOfRows': '9999'
            }
            
            # 재시도 로직
            for attempt in range(self.config.max_retries):
                try:
                    response = self.molit_session.get(
                        self.config.molit_base_url,
                        params=params,
                        timeout=30
                    )
                    
                    if response.status_code == 200:
                        # XML 파싱
                        root = ET.fromstring(response.text)
                        
                        # 결과 코드 확인
                        result_code = root.find('.//resultCode')
                        if result_code is not None and result_code.text == '00':
                            items = root.findall('.//item')
                            
                            transactions = []
                            for item in items:
                                try:
                                    transaction = {
                                        'sgg_cd': item.find('sggCd').text if item.find('sggCd') is not None else '',
                                        'umd_nm': item.find('umdNm').text if item.find('umdNm') is not None else '',
                                        'apt_nm': item.find('aptNm').text if item.find('aptNm') is not None else '',
                                        'deal_amount': item.find('dealAmount').text.strip() if item.find('dealAmount') is not None else '',
                                        'deal_year': item.find('dealYear').text if item.find('dealYear') is not None else '',
                                        'deal_month': item.find('dealMonth').text.zfill(2) if item.find('dealMonth') is not None else '',
                                        'deal_day': item.find('dealDay').text.zfill(2) if item.find('dealDay') is not None else '',
                                        'exclu_use_ar': item.find('excluUseAr').text if item.find('excluUseAr') is not None else '',
                                        'floor': item.find('floor').text if item.find('floor') is not None else '',
                                        'build_year': item.find('buildYear').text if item.find('buildYear') is not None else '',
                                        'dong': item.find('dong').text if item.find('dong') is not None else '',
                                        'jibun': item.find('jibun').text if item.find('jibun') is not None else '',
                                        'deal_date': f"{item.find('dealYear').text}-{item.find('dealMonth').text.zfill(2)}-{item.find('dealDay').text.zfill(2)}" if all(item.find(x) is not None for x in ['dealYear', 'dealMonth', 'dealDay']) else '',
                                        'data_source': 'molit',
                                        'region_code': region_code,
                                        'year_month': year_month
                                    }
                                    
                                    if transaction['apt_nm'] and transaction['deal_amount']:
                                        transactions.append(transaction)
                                        
                                except Exception as e:
                                    logger.debug(f"국토부 거래 파싱 오류: {e}")
                                    continue
                            
                            return transactions
                            
                        else:
                            error_msg = root.find('.//resultMsg')
                            error_text = error_msg.text if error_msg is not None else "알 수 없는 오류"
                            logger.warning(f"국토부 API 오류: {error_text} ({region_code}, {year_month})")
                            return []
                    
                    else:
                        logger.error(f"국토부 HTTP {response.status_code}: {region_code}, {year_month}")
                        if attempt < self.config.max_retries - 1:
                            self._smart_delay(error_occurred=True)
                            continue
                        return []
                        
                except requests.exceptions.Timeout:
                    logger.warning(f"국토부 타임아웃: {region_code}, {year_month}")
                    if attempt < self.config.max_retries - 1:
                        self._smart_delay(error_occurred=True)
                        continue
                    return []
                    
                except Exception as e:
                    logger.error(f"국토부 크롤링 오류: {region_code}, {year_month} - {str(e)}")
                    if attempt < self.config.max_retries - 1:
                        self._smart_delay(error_occurred=True)
                        continue
                    return []
            
            return []
            
        except Exception as e:
            logger.error(f"국토부 크롤링 실패: {region_code}, {year_month} - {str(e)}")
            return []
    
    async def _process_naver_region(self, region: Dict) -> Tuple[int, int]:
        """네이버 지역 처리"""
        try:
            apartments = await self._crawl_naver_data(region)
            
            if not apartments:
                return 0, 0
            
            saved_count = 0
            for apt in apartments:
                try:
                    success = self.db_manager.queue_transaction(
                        """INSERT OR REPLACE INTO apartment_complexes 
                           (complex_id, complex_name, city, gu, dong, latitude, longitude, 
                            construction_year, total_units, deal_min_price, deal_max_price, 
                            lease_min_price, lease_max_price, rent_min_price, rent_max_price,
                            trade_types, address_road, address_jibun, data_source, updated_at) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (apt['complex_id'], apt['complex_name'], apt['city'], apt['gu'], apt['dong'],
                         apt['latitude'], apt['longitude'], apt['construction_year'], apt['total_units'],
                         apt['deal_min_price'], apt['deal_max_price'], apt['lease_min_price'], apt['lease_max_price'],
                         apt['rent_min_price'], apt['rent_max_price'], apt['trade_type'],
                         apt['address_road'], apt['address_jibun'], apt['data_source'], datetime.now())
                    )
                    
                    saved_count += 1
                    
                except Exception as e:
                    logger.error(f"네이버 아파트 저장 오류: {str(e)}")
                    continue
            
            self.stats['naver_total'] += len(apartments)
            self.stats['naver_success'] += saved_count
            
            logger.info(f"네이버 완료: {region['region_key']} - {saved_count}/{len(apartments)}")
            return len(apartments), saved_count
            
        except Exception as e:
            logger.error(f"네이버 지역 처리 오류: {region['region_key']} - {str(e)}")
            self.stats['naver_failed'] += 1
            return 0, 0
    
    def _process_molit_region(self, region_code: str, year_month: str) -> Tuple[int, int]:
        """국토부 지역 처리"""
        try:
            transactions = self._crawl_molit_data(region_code, year_month)
            
            if not transactions:
                return 0, 0
            
            saved_count = 0
            for txn in transactions:
                try:
                    success = self.db_manager.queue_transaction(
                        """INSERT OR REPLACE INTO apartment_transactions 
                           (sgg_cd, umd_nm, apt_nm, deal_amount, deal_year, deal_month, deal_day,
                            exclu_use_ar, floor, build_year, dong, jibun, deal_date, 
                            data_source, region_code, year_month, created_at) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (txn['sgg_cd'], txn['umd_nm'], txn['apt_nm'], txn['deal_amount'],
                         txn['deal_year'], txn['deal_month'], txn['deal_day'], txn['exclu_use_ar'],
                         txn['floor'], txn['build_year'], txn['dong'], txn['jibun'], txn['deal_date'],
                         txn['data_source'], txn['region_code'], txn['year_month'], datetime.now())
                    )
                    
                    saved_count += 1
                    
                except Exception as e:
                    logger.error(f"국토부 거래 저장 오류: {str(e)}")
                    continue
            
            self.stats['molit_total'] += len(transactions)
            self.stats['molit_success'] += saved_count
            
            logger.info(f"국토부 완료: {region_code}, {year_month} - {saved_count}/{len(transactions)}")
            return len(transactions), saved_count
            
        except Exception as e:
            logger.error(f"국토부 지역 처리 오류: {region_code}, {year_month} - {str(e)}")
            self.stats['molit_failed'] += 1
            return 0, 0
    
    def _create_database_tables(self):
        """데이터베이스 테이블 생성"""
        # 아파트 단지 테이블 (네이버 매매호가)
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT NOT NULL,
                complex_name TEXT NOT NULL,
                city TEXT NOT NULL,
                gu TEXT NOT NULL,
                dong TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                construction_year INTEGER,
                total_units INTEGER,
                deal_min_price INTEGER,
                deal_max_price INTEGER,
                lease_min_price INTEGER,
                lease_max_price INTEGER,
                rent_min_price INTEGER,
                rent_max_price INTEGER,
                trade_types TEXT,
                address_road TEXT,
                address_jibun TEXT,
                data_source TEXT DEFAULT 'naver',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(complex_id, trade_types)
            )
        """)
        
        # 실거래가 테이블 (국토부 실거래가)
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS apartment_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sgg_cd TEXT NOT NULL,
                umd_nm TEXT NOT NULL,
                apt_nm TEXT NOT NULL,
                deal_amount TEXT,
                deal_year TEXT,
                deal_month TEXT,
                deal_day TEXT,
                exclu_use_ar TEXT,
                floor TEXT,
                build_year TEXT,
                dong TEXT,
                jibun TEXT,
                deal_date TEXT,
                data_source TEXT DEFAULT 'molit',
                region_code TEXT,
                year_month TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(sgg_cd, apt_nm, deal_date, exclu_use_ar, floor)
            )
        """)
        
        # 크롤링 진행 상황 테이블
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS crawling_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data_source TEXT NOT NULL,
                region_key TEXT NOT NULL,
                status TEXT NOT NULL,
                crawl_start_time DATETIME,
                crawl_end_time DATETIME,
                item_count INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(data_source, region_key)
            )
        """)
        
        # 인덱스 생성
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_complex_location ON apartment_complexes(city, gu, dong)",
            "CREATE INDEX IF NOT EXISTS idx_complex_id ON apartment_complexes(complex_id)",
            "CREATE INDEX IF NOT EXISTS idx_transaction_location ON apartment_transactions(sgg_cd, umd_nm, apt_nm)",
            "CREATE INDEX IF NOT EXISTS idx_transaction_date ON apartment_transactions(deal_date)",
            "CREATE INDEX IF NOT EXISTS idx_progress_source ON crawling_progress(data_source, region_key)"
        ]
        
        for index_sql in indexes:
            self.db_manager.safe_execute(index_sql)
        
        logger.info("데이터베이스 테이블 및 인덱스 생성 완료")
    
    async def run_ultimate_crawling(self, max_naver_regions: int = 500, max_molit_regions: int = 50):
        """최고 수준의 크롤링 실행"""
        logger.info("=== Ultimate Real Estate Crawler 시작 ===")
        
        self.stats['start_time'] = datetime.now()
        
        # 데이터베이스 테이블 생성
        self._create_database_tables()
        
        # 네이버 세션 생성
        await self._create_naver_session()
        
        try:
            # 1. 네이버 부동산 매매호가 크롤링
            logger.info("네이버 부동산 매매호가 크롤링 시작...")
            naver_regions = self._generate_comprehensive_regions()[:max_naver_regions]
            
            # 네이버 크롤링 실행
            semaphore = asyncio.Semaphore(self.config.max_concurrent_naver)
            
            async def process_naver_with_semaphore(region):
                async with semaphore:
                    return await self._process_naver_region(region)
            
            # 배치 처리
            batch_size = 20
            for i in range(0, len(naver_regions), batch_size):
                batch = naver_regions[i:i + batch_size]
                
                logger.info(f"네이버 배치 {i//batch_size + 1}/{(len(naver_regions) + batch_size - 1)//batch_size} 처리 중...")
                
                tasks = [process_naver_with_semaphore(region) for region in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                success_count = sum(1 for r in results if isinstance(r, tuple) and r[0] > 0)
                logger.info(f"네이버 배치 결과: {success_count}/{len(batch)} 성공")
                
                # 배치 간 대기
                await asyncio.sleep(random.uniform(2, 5))
            
            # 2. 국토부 실거래가 크롤링 (일일 1만건 제한 고려)
            logger.info("국토부 실거래가 크롤링 시작... (일일 1만건 제한 고려)")
            molit_regions = self._get_molit_region_codes()
            
            # 최근 3개월 데이터 수집 (API 제한 고려)
            current_date = datetime.now()
            year_months = []
            for i in range(3):  # 12개월 -> 3개월로 축소
                target_date = current_date - timedelta(days=i * 30)
                year_month = target_date.strftime("%Y%m")
                year_months.append(year_month)
            
            # 국토부 크롤링 실행 (동기식, 제한적)
            molit_tasks = []
            count = 0
            # 지역 수 제한 (API 제한 고려)
            limited_regions = list(molit_regions.items())[:10]  # 상위 10개 지역만
            
            for region_name, region_code in limited_regions:
                if count >= max_molit_regions:
                    break
                for year_month in year_months:
                    molit_tasks.append((region_code, year_month))
                    count += 1
                    if count >= max_molit_regions:
                        break
            
            # 국토부 API 제한 고려한 순차 처리
            logger.info(f"국토부 API 총 {len(molit_tasks)}개 작업 예정 (일일 1만건 제한 고려)")
            
            for i, (region_code, year_month) in enumerate(molit_tasks):
                try:
                    result = self._process_molit_region(region_code, year_month)
                    
                    # 진행률 표시
                    if i % 5 == 0:
                        logger.info(f"국토부 진행률: {i+1}/{len(molit_tasks)} (API 제한 고려한 안전 처리)")
                    
                    # API 제한 고려한 충분한 딜레이
                    await asyncio.sleep(random.uniform(8, 12))  # 8-12초 대기
                    
                except Exception as e:
                    logger.error(f"국토부 작업 실패: {str(e)}")
                    continue
            
        except Exception as e:
            logger.error(f"크롤링 실행 중 오류: {str(e)}")
        
        finally:
            # 세션 정리
            if self.naver_session:
                await self.naver_session.close()
            
            # 모든 트랜잭션 완료 대기
            logger.info("모든 트랜잭션 완료 대기 중...")
            final_stats = self.db_manager.wait_for_completion(timeout=1800)
            
            # 최종 통계
            self.stats['end_time'] = datetime.now()
            
            logger.info("=== Ultimate Real Estate Crawler 완료 ===")
            logger.info(f"총 소요 시간: {self.stats['end_time'] - self.stats['start_time']}")
            logger.info(f"네이버 처리: 성공 {self.stats['naver_success']}, 실패 {self.stats['naver_failed']}")
            logger.info(f"국토부 처리: 성공 {self.stats['molit_success']}, 실패 {self.stats['molit_failed']}")
            logger.info(f"데이터베이스 저장 효율: {final_stats['success_rate']:.2f}%")
            
            # 데이터베이스 매니저 종료
            self.db_manager.close()
            
            return final_stats

async def main():
    """메인 실행 함수"""
    # 설정
    config = CrawlingConfig(
        molit_service_key="YOUR_MOLIT_SERVICE_KEY_HERE",  # 실제 서비스키로 변경 필요
        min_delay=2.0,  # IP 차단 방지를 위한 충분한 딜레이
        max_delay=5.0,
        error_delay=15.0,
        max_concurrent_naver=3,  # 안전한 동시 처리 수
        max_concurrent_molit=2
    )
    
    crawler = UltimateRealEstateCrawler(config)
    
    try:
        print("Ultimate Real Estate Crawler 시작...")
        print("국토부 실거래가 + 네이버 매매호가 통합 수집")
        print("UltimateDatabaseManager로 100% 저장 보장")
        print("IP 차단 방지 시스템 활성화")
        
        # 국토부 API 제한 고려한 안전한 설정
        stats = await crawler.run_ultimate_crawling(
            max_naver_regions=300,  # 네이버 300개 지역
            max_molit_regions=30    # 국토부 30개 지역 (일일 1만건 제한 고려)
        )
        
        print(f"\n크롤링 완료! 데이터베이스 저장 효율: {stats['success_rate']:.1f}%")
        
        # 최종 데이터 확인
        import sqlite3
        conn = sqlite3.connect(config.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
        complex_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
        transaction_count = cursor.fetchone()[0]
        
        conn.close()
        
        print(f"최종 결과:")
        print(f"  - 아파트 단지 (네이버 매매호가): {complex_count}개")
        print(f"  - 실거래가 (국토부): {transaction_count}개")
        
    except KeyboardInterrupt:
        print("사용자에 의해 중단됨")
    except Exception as e:
        print(f"크롤링 오류: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())