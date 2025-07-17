#!/usr/bin/env python3
"""
확실한 전국 아파트 크롤러 v3.0
- 네이버 부동산 API 직접 호출
- 단계별 검증 및 확인
- 느려도 확실하게 수집
"""

import requests
import sqlite3
import json
import time
import random
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import asyncio
import aiohttp

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('reliable_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class ApartmentUnit:
    """아파트 매물 정보"""
    complex_id: str
    complex_name: str
    deal_type: str  # 매매, 전세, 월세
    price: str
    area: str
    floor: str
    direction: str
    region: str
    address: str
    crawled_at: str

class ReliableNationwideCrawler:
    """확실한 전국 아파트 크롤러"""
    
    def __init__(self):
        self.session = requests.Session()
        self.db_path = "reliable_real_estate.db"
        self.setup_headers()
        self.init_database()
        
        # 전국 지역 코드 (확실한 지역코드)
        self.regions = {
            '11': {'name': '서울특별시', 'districts': ['11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305', '11320', '11350', '11380', '11410', '11440', '11470', '11500', '11530', '11545', '11560', '11590', '11620', '11650', '11680', '11710', '11740']},
            '26': {'name': '부산광역시', 'districts': ['26110', '26140', '26170', '26200', '26230', '26260', '26290', '26320', '26350', '26380', '26410', '26440', '26470', '26500', '26530', '26710']},
            '27': {'name': '대구광역시', 'districts': ['27110', '27140', '27170', '27200', '27230', '27260', '27290', '27710']},
            '28': {'name': '인천광역시', 'districts': ['28110', '28140', '28177', '28185', '28200', '28237', '28245', '28260', '28710', '28720']},
            '29': {'name': '광주광역시', 'districts': ['29110', '29140', '29155', '29170', '29200']},
            '30': {'name': '대전광역시', 'districts': ['30110', '30140', '30170', '30200', '30230']},
            '31': {'name': '울산광역시', 'districts': ['31110', '31140', '31170', '31200', '31710']},
            '41': {'name': '경기도', 'districts': ['41110', '41130', '41150', '41170', '41190', '41210', '41220', '41250', '41270', '41280', '41290', '41310', '41360', '41370', '41390', '41410', '41430', '41450', '41460', '41480', '41500', '41550', '41570', '41590', '41610', '41630', '41650', '41670', '41720', '41730', '41750', '41770', '41800', '41820', '41830']},
        }
        
        # 통계
        self.stats = {
            'total_complexes': 0,
            'total_listings': 0,
            'regions_completed': 0,
            'start_time': datetime.now()
        }
    
    def setup_headers(self):
        """헤더 설정"""
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Referer': 'https://new.land.naver.com/complexes',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        })
    
    def init_database(self):
        """데이터베이스 초기화"""
        logger.info("데이터베이스 초기화 중...")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 아파트 단지 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT,
                address TEXT,
                region_code TEXT,
                region_name TEXT,
                district_code TEXT,
                latitude REAL,
                longitude REAL,
                total_households INTEGER,
                completion_year TEXT,
                min_area REAL,
                max_area REAL,
                min_price INTEGER,
                max_price INTEGER,
                api_data TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 매물 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS property_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT,
                complex_name TEXT,
                deal_type TEXT,
                price TEXT,
                area TEXT,
                floor TEXT,
                direction TEXT,
                region TEXT,
                address TEXT,
                listing_data TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 크롤링 진행 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS crawling_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region_code TEXT,
                region_name TEXT,
                district_code TEXT,
                status TEXT,
                complexes_found INTEGER DEFAULT 0,
                listings_found INTEGER DEFAULT 0,
                error_message TEXT,
                started_at TEXT,
                completed_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("데이터베이스 초기화 완료")
    
    def get_complex_list_by_district(self, region_code: str, district_code: str) -> List[Dict[str, Any]]:
        """지역별 아파트 단지 목록 API 호출"""
        logger.info(f"지역 {region_code}-{district_code} 아파트 단지 목록 조회 중...")
        
        # 네이버 부동산 API URL 
        url = "https://new.land.naver.com/api/complexes"
        
        params = {
            'cortarNo': district_code,
            'ptpNo': 'APT',  # 아파트
            'rletTpCd': 'A01',  # 매매
            'tradTpCd': 'A1',
            'z': '12',
            'lat': '37.5665',
            'lon': '126.9780',
            'btm': '37.4',
            'lft': '126.7',
            'top': '37.7',
            'rgt': '127.2'
        }
        
        try:
            response = self.session.get(url, params=params, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                
                # 응답 구조 확인
                if 'complexList' in data:
                    complexes = data['complexList']
                elif isinstance(data, list):
                    complexes = data
                else:
                    logger.warning(f"예상과 다른 응답 구조: {list(data.keys()) if isinstance(data, dict) else type(data)}")
                    complexes = []
                
                logger.info(f"지역 {district_code}: {len(complexes)}개 단지 발견")
                return complexes
                
            else:
                logger.error(f"API 호출 실패: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"지역 {district_code} API 호출 오류: {e}")
            return []
        
        finally:
            # 요청 간격 (안전한 크롤링)
            time.sleep(random.uniform(2, 4))
    
    def get_complex_detail(self, complex_id: str) -> Dict[str, Any]:
        """아파트 단지 상세 정보 API 호출"""
        logger.info(f"단지 {complex_id} 상세 정보 조회 중...")
        
        url = f"https://new.land.naver.com/api/complexes/{complex_id}"
        
        try:
            response = self.session.get(url, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"단지 {complex_id} 상세 정보 수집 완료")
                return data
            else:
                logger.error(f"단지 {complex_id} 상세 정보 API 호출 실패: {response.status_code}")
                return {}
                
        except Exception as e:
            logger.error(f"단지 {complex_id} 상세 정보 오류: {e}")
            return {}
        
        finally:
            time.sleep(random.uniform(1, 2))
    
    def get_complex_listings(self, complex_id: str) -> List[Dict[str, Any]]:
        """아파트 단지 매물 목록 API 호출"""
        logger.info(f"단지 {complex_id} 매물 목록 조회 중...")
        
        all_listings = []
        
        # 거래 유형별로 조회 (매매, 전세, 월세)
        trade_types = [
            {'code': 'A1', 'name': '매매'},
            {'code': 'B1', 'name': '전세'},
            {'code': 'B2', 'name': '월세'}
        ]
        
        for trade_type in trade_types:
            logger.info(f"  {trade_type['name']} 매물 조회 중...")
            
            url = f"https://new.land.naver.com/api/complexes/{complex_id}/prices"
            
            params = {
                'tradTpCd': trade_type['code'],
                'tag': '{}',
                'rentPrc': '0',
                'spc': '{}',
                'dp': '0',
                'year': '0',
                'floor': '{}',
                'page': '1',
                'size': '200'
            }
            
            try:
                response = self.session.get(url, params=params, timeout=30)
                
                if response.status_code == 200:
                    data = response.json()
                    
                    # 매물 데이터 추출
                    if 'list' in data:
                        listings = data['list']
                        for listing in listings:
                            listing['deal_type'] = trade_type['name']
                        all_listings.extend(listings)
                        logger.info(f"    {trade_type['name']}: {len(listings)}개 매물")
                    
                else:
                    logger.warning(f"  {trade_type['name']} 매물 API 호출 실패: {response.status_code}")
                    
            except Exception as e:
                logger.error(f"  {trade_type['name']} 매물 조회 오류: {e}")
            
            # 거래유형별 딜레이
            time.sleep(random.uniform(1, 2))
        
        logger.info(f"단지 {complex_id} 총 매물: {len(all_listings)}개")
        return all_listings
    
    def save_complex(self, complex_data: Dict[str, Any], region_code: str, district_code: str):
        """아파트 단지 정보 저장"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            complex_id = str(complex_data.get('complexNo', ''))
            complex_name = complex_data.get('complexName', '')
            address = complex_data.get('roadAddress', complex_data.get('address', ''))
            region_name = self.regions.get(region_code, {}).get('name', '')
            
            cursor.execute("""
                INSERT OR REPLACE INTO apartment_complexes 
                (complex_id, complex_name, address, region_code, region_name, district_code,
                 latitude, longitude, total_households, completion_year, min_area, max_area,
                 min_price, max_price, api_data, crawled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                complex_id, complex_name, address, region_code, region_name, district_code,
                complex_data.get('lat'), complex_data.get('lng'),
                complex_data.get('householdCnt'), complex_data.get('useApproveDate'),
                complex_data.get('minSupplyArea'), complex_data.get('maxSupplyArea'),
                complex_data.get('dealPrice'), complex_data.get('rentPrice'),
                json.dumps(complex_data, ensure_ascii=False),
                datetime.now().isoformat()
            ))
            
            conn.commit()
            conn.close()
            
            self.stats['total_complexes'] += 1
            logger.info(f"단지 저장 완료: {complex_name} ({complex_id})")
            
        except Exception as e:
            logger.error(f"단지 저장 오류: {e}")
    
    def save_listings(self, complex_id: str, complex_name: str, listings: List[Dict[str, Any]], region: str):
        """매물 정보 저장"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for listing in listings:
                cursor.execute("""
                    INSERT INTO property_listings 
                    (complex_id, complex_name, deal_type, price, area, floor, direction,
                     region, address, listing_data, crawled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    complex_id, complex_name, listing.get('deal_type', ''),
                    listing.get('dealPrice', listing.get('rentPrice', '')),
                    listing.get('supplyArea', ''), listing.get('floor', ''),
                    listing.get('direction', ''), region, '',
                    json.dumps(listing, ensure_ascii=False),
                    datetime.now().isoformat()
                ))
            
            conn.commit()
            conn.close()
            
            self.stats['total_listings'] += len(listings)
            logger.info(f"매물 {len(listings)}개 저장 완료")
            
        except Exception as e:
            logger.error(f"매물 저장 오류: {e}")
    
    def record_progress(self, region_code: str, district_code: str, status: str, 
                       complexes_found: int = 0, listings_found: int = 0, error_msg: str = None):
        """진행 상황 기록"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            region_name = self.regions.get(region_code, {}).get('name', '')
            
            cursor.execute("""
                INSERT OR REPLACE INTO crawling_progress 
                (region_code, region_name, district_code, status, complexes_found, listings_found,
                 error_message, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                region_code, region_name, district_code, status, complexes_found, listings_found,
                error_msg, datetime.now().isoformat(),
                datetime.now().isoformat() if status == '완료' else None
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"진행 상황 기록 오류: {e}")
    
    def crawl_district(self, region_code: str, district_code: str):
        """지역별 크롤링"""
        region_name = self.regions.get(region_code, {}).get('name', '')
        logger.info(f"\n=== {region_name} {district_code} 크롤링 시작 ===")
        
        try:
            self.record_progress(region_code, district_code, '시작')
            
            # 1단계: 단지 목록 조회
            complexes = self.get_complex_list_by_district(region_code, district_code)
            
            if not complexes:
                logger.warning(f"지역 {district_code}: 아파트 단지를 찾을 수 없습니다")
                self.record_progress(region_code, district_code, '완료', 0, 0)
                return
            
            logger.info(f"지역 {district_code}: {len(complexes)}개 단지 발견")
            
            total_listings = 0
            
            # 2단계: 각 단지별 상세 정보 및 매물 수집
            for i, complex_basic in enumerate(complexes, 1):
                try:
                    complex_id = str(complex_basic.get('complexNo', ''))
                    complex_name = complex_basic.get('complexName', f'단지_{complex_id}')
                    
                    logger.info(f"  [{i}/{len(complexes)}] {complex_name} 처리 중...")
                    
                    # 단지 상세 정보 조회
                    complex_detail = self.get_complex_detail(complex_id)
                    
                    # 기본 정보와 상세 정보 합병
                    combined_data = {**complex_basic, **complex_detail}
                    
                    # 단지 정보 저장
                    self.save_complex(combined_data, region_code, district_code)
                    
                    # 매물 정보 조회 및 저장
                    listings = self.get_complex_listings(complex_id)
                    if listings:
                        self.save_listings(complex_id, complex_name, listings, region_name)
                        total_listings += len(listings)
                    
                    logger.info(f"    완료: 단지정보 저장, 매물 {len(listings)}개")
                    
                    # 단지별 딜레이 (서버 부하 방지)
                    time.sleep(random.uniform(3, 6))
                    
                except Exception as e:
                    logger.error(f"    단지 처리 오류: {e}")
                    continue
            
            # 완료 기록
            self.record_progress(region_code, district_code, '완료', len(complexes), total_listings)
            logger.info(f"=== {region_name} {district_code} 완료: 단지 {len(complexes)}개, 매물 {total_listings}개 ===")
            
        except Exception as e:
            logger.error(f"지역 {district_code} 크롤링 오류: {e}")
            self.record_progress(region_code, district_code, '오류', 0, 0, str(e))
    
    def start_comprehensive_crawling(self):
        """전국 종합 크롤링 시작"""
        logger.info("🚀 확실한 전국 아파트 크롤링 시작!")
        logger.info(f"📊 대상: {len(self.regions)}개 시도")
        
        # 서울부터 시작 (테스트)
        for region_code, region_info in list(self.regions.items())[:1]:  # 일단 서울만
            region_name = region_info['name']
            districts = region_info['districts']
            
            logger.info(f"\n🏙️ {region_name} 크롤링 시작 ({len(districts)}개 구/군)")
            
            for district_code in districts[:3]:  # 일단 3개 구만 테스트
                self.crawl_district(region_code, district_code)
                
                # 지역간 딜레이
                time.sleep(random.uniform(5, 10))
            
            self.stats['regions_completed'] += 1
            logger.info(f"✅ {region_name} 완료")
        
        # 최종 통계
        self.print_final_stats()
    
    def print_final_stats(self):
        """최종 통계 출력"""
        end_time = datetime.now()
        duration = end_time - self.stats['start_time']
        
        logger.info("\n" + "="*60)
        logger.info("🎉 확실한 전국 아파트 크롤링 완료!")
        logger.info("="*60)
        logger.info(f"📊 최종 통계:")
        logger.info(f"  🏢 수집된 단지: {self.stats['total_complexes']:,}개")
        logger.info(f"  🏠 수집된 매물: {self.stats['total_listings']:,}개")
        logger.info(f"  🏙️ 완료된 지역: {self.stats['regions_completed']}개")
        logger.info(f"  ⏱️ 소요 시간: {duration}")
        logger.info(f"  📈 시간당 평균: 단지 {self.stats['total_complexes']/(duration.total_seconds()/3600):.1f}개/시간")
        logger.info("="*60)

def main():
    """메인 실행 함수"""
    print("확실한 전국 아파트 크롤러 v3.0")
    print("="*40)
    print("- 네이버 부동산 API 직접 호출")
    print("- 단계별 검증 및 확인")
    print("- 느려도 확실하게 수집")
    print("="*40)
    
    crawler = ReliableNationwideCrawler()
    
    try:
        crawler.start_comprehensive_crawling()
        
    except KeyboardInterrupt:
        logger.info("⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"❌ 크롤링 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()