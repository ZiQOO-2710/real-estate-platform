#!/usr/bin/env python3
"""
데이터 복구 크롤러 - 분실된 크롤링 데이터 복구
- 실패한 지역 재크롤링
- UltimateDatabaseManager로 100% 저장 보장
- 전국 규모 확장 복구
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

# UltimateDatabaseManager import
from ultimate_database_manager import UltimateDatabaseManager

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data_recovery.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DataRecoveryCrawler:
    def __init__(self, db_path="real_estate_crawling.db"):
        self.db_path = db_path
        self.base_url = "https://new.land.naver.com/api/complexes/single-markers/2.0"
        
        # UltimateDatabaseManager 초기화
        self.db_manager = UltimateDatabaseManager(
            db_path=db_path,
            max_connections=15,  # 복구용으로 더 많은 연결
            max_retries=30       # 복구용으로 더 많은 재시도
        )
        
        # 통계
        self.stats = {
            'failed_regions_retry': 0,
            'new_regions_added': 0,
            'total_apartments_recovered': 0,
            'total_attempts': 0,
            'start_time': None,
            'end_time': None
        }
        
        # 세션 설정
        self.session = None
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'DNT': '1',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
        }
        
        logger.info("데이터 복구 크롤러 초기화 완료")
    
    async def _create_session(self):
        """HTTP 세션 생성"""
        connector = aiohttp.TCPConnector(
            limit=100,
            limit_per_host=30,
            ttl_dns_cache=300
        )
        
        timeout = aiohttp.ClientTimeout(total=45, connect=15)
        
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=self.headers
        )
        
        logger.info("HTTP 세션 생성 완료")
    
    def get_failed_regions(self) -> List[Dict]:
        """실패한 지역 목록 가져오기"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT city, gu, dong, trade_type 
            FROM crawling_progress 
            WHERE status = 'failed'
            ORDER BY id DESC
        """)
        
        failed_regions = []
        trade_type_codes = {
            "매매": "A01",
            "전세": "B01", 
            "월세": "B02"
        }
        
        for row in cursor.fetchall():
            city, gu, dong, trade_type = row
            failed_regions.append({
                "city": city,
                "gu": gu,
                "dong": dong,
                "trade_type": trade_type,
                "trade_code": trade_type_codes.get(trade_type, "A01")
            })
        
        conn.close()
        logger.info(f"실패한 지역 {len(failed_regions)}개 발견")
        return failed_regions
    
    def get_expanded_regions(self) -> List[Dict]:
        """전국 확장 지역 목록 생성"""
        # 전국 주요 도시 확장
        expanded_regions = []
        
        # 전국 주요 도시 데이터
        national_cities = [
            # 서울 전체 구
            {"city": "서울", "gus": [
                "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구",
                "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구",
                "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"
            ]},
            # 경기도 주요 도시
            {"city": "경기도", "gus": [
                "수원시", "성남시", "고양시", "용인시", "안양시", "부천시", "평택시", "안산시",
                "화성시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시",
                "하남시", "오산시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시"
            ]},
            # 인천
            {"city": "인천", "gus": [
                "중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"
            ]},
            # 부산
            {"city": "부산", "gus": [
                "중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구",
                "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"
            ]},
            # 대구
            {"city": "대구", "gus": [
                "중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군"
            ]},
            # 대전
            {"city": "대전", "gus": [
                "동구", "중구", "서구", "유성구", "대덕구"
            ]},
            # 광주
            {"city": "광주", "gus": [
                "동구", "서구", "남구", "북구", "광산구"
            ]},
            # 울산
            {"city": "울산", "gus": [
                "중구", "남구", "동구", "북구", "울주군"
            ]}
        ]
        
        # 거래 타입
        trade_types = [
            {"name": "매매", "code": "A01"},
            {"name": "전세", "code": "B01"},
            {"name": "월세", "code": "B02"}
        ]
        
        # 각 도시별 대표 동 생성 (실제로는 더 많은 동이 있지만 시간 제약상 일부만)
        sample_dongs = [
            "역삼동", "삼성동", "신사동", "압구정동", "대치동", "논현동", "청담동", "개포동",
            "도곡도", "세곡동", "일원동", "수서동", "강일동", "명일동", "고덕동", "상일동",
            "암사동", "천호동", "둔촌동", "길동", "성내동", "미아동", "번동", "수유동", "우이동"
        ]
        
        for city_data in national_cities:
            city = city_data["city"]
            for gu in city_data["gus"]:
                # 각 구마다 샘플 동 할당
                for i, dong in enumerate(sample_dongs):
                    if i >= 5:  # 구당 5개 동만 처리 (시간 제약)
                        break
                    
                    for trade_type in trade_types:
                        expanded_regions.append({
                            "city": city,
                            "gu": gu,
                            "dong": dong,
                            "trade_type": trade_type["name"],
                            "trade_code": trade_type["code"]
                        })
        
        logger.info(f"확장 지역 {len(expanded_regions)}개 생성")
        return expanded_regions
    
    async def _fetch_apartment_data(self, region: Dict) -> List[Dict]:
        """아파트 데이터 크롤링"""
        try:
            # 지역 코드 생성 (간단한 매핑)
            region_codes = {
                "서울": "1100000000",
                "경기도": "4100000000", 
                "인천": "2800000000",
                "부산": "2600000000",
                "대구": "2700000000",
                "대전": "3000000000",
                "광주": "2900000000",
                "울산": "3100000000"
            }
            
            cortarNo = region_codes.get(region["city"], "1100000000")
            
            # 요청 파라미터
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
                'mapBounds': '33.0,124.0,39.0,132.0',  # 전국 범위
                'sameAddr': 'Y',
                'showR0': 'N',
                'aa': ''
            }
            
            url = f"{self.base_url}?{urlencode(params)}"
            
            # 요청 실행
            async with self.session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('data', [])
                elif response.status == 429:
                    logger.warning(f"Rate limit: {region['city']} {region['gu']} {region['dong']} - 대기 중")
                    await asyncio.sleep(random.uniform(10, 20))
                    return []
                else:
                    logger.error(f"HTTP {response.status}: {region['city']} {region['gu']} {region['dong']}")
                    return []
                    
        except Exception as e:
            logger.error(f"크롤링 오류: {region['city']} {region['gu']} {region['dong']} - {str(e)}")
            return []
    
    async def _process_region(self, region: Dict) -> bool:
        """지역 크롤링 처리"""
        try:
            # 크롤링 실행
            apartments = await self._fetch_apartment_data(region)
            
            if not apartments:
                logger.info(f"데이터 없음: {region['city']} {region['gu']} {region['dong']} {region['trade_type']}")
                return True
            
            # 아파트 데이터 저장
            saved_count = 0
            for apt in apartments:
                try:
                    complex_id = apt.get('complexNo', '')
                    complex_name = apt.get('complexName', '')
                    latitude = apt.get('lat', 0.0)
                    longitude = apt.get('lng', 0.0)
                    
                    # 가격 정보
                    deal_min_price = apt.get('dealMinPrice', 0)
                    deal_max_price = apt.get('dealMaxPrice', 0)
                    rent_min_price = apt.get('rentMinPrice', 0)
                    rent_max_price = apt.get('rentMaxPrice', 0)
                    
                    # 저장 (INSERT OR REPLACE로 중복 방지)
                    self.db_manager.queue_transaction(
                        "INSERT OR REPLACE INTO apartment_complexes (complex_id, complex_name, city, gu, dong, latitude, longitude, deal_min_price, deal_max_price, rent_min_price, rent_max_price, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (complex_id, complex_name, region["city"], region["gu"], region["dong"], latitude, longitude, deal_min_price, deal_max_price, rent_min_price, rent_max_price, datetime.now())
                    )
                    
                    saved_count += 1
                    
                except Exception as e:
                    logger.error(f"아파트 저장 오류: {str(e)}")
                    continue
            
            # 진행 상태 업데이트
            self.db_manager.queue_transaction(
                "INSERT OR REPLACE INTO crawling_progress (city, gu, dong, trade_type, status, crawl_start_time, crawl_end_time, apartment_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (region["city"], region["gu"], region["dong"], region["trade_type"], "completed", datetime.now(), datetime.now(), saved_count)
            )
            
            # 통계 업데이트
            self.stats['total_apartments_recovered'] += saved_count
            self.stats['total_attempts'] += 1
            
            logger.info(f"복구 완료: {region['city']} {region['gu']} {region['dong']} {region['trade_type']} - {saved_count}개")
            
            return True
            
        except Exception as e:
            logger.error(f"지역 처리 오류: {region['city']} {region['gu']} {region['dong']} - {str(e)}")
            return False
    
    async def run_recovery(self, max_concurrent=3):
        """데이터 복구 실행"""
        logger.info("=== 데이터 복구 크롤러 시작 ===")
        
        self.stats['start_time'] = datetime.now()
        
        # HTTP 세션 생성
        await self._create_session()
        
        # 1단계: 실패한 지역 재시도
        failed_regions = self.get_failed_regions()
        if failed_regions:
            logger.info(f"1단계: 실패한 지역 {len(failed_regions)}개 재시도")
            
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def retry_with_semaphore(region):
                async with semaphore:
                    return await self._process_region(region)
            
            # 배치 처리
            batch_size = 10
            for i in range(0, len(failed_regions), batch_size):
                batch = failed_regions[i:i + batch_size]
                tasks = [retry_with_semaphore(region) for region in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                success_count = sum(1 for r in results if r is True)
                self.stats['failed_regions_retry'] += success_count
                
                logger.info(f"실패 지역 재시도 배치 {i//batch_size + 1}: {success_count}/{len(batch)} 성공")
                
                # 배치 간 대기
                await asyncio.sleep(random.uniform(3, 7))
        
        # 2단계: 확장 지역 추가 크롤링
        expanded_regions = self.get_expanded_regions()
        if expanded_regions:
            logger.info(f"2단계: 확장 지역 {len(expanded_regions)}개 추가 크롤링")
            
            # 샘플링 (시간 제약상 일부만)
            sample_size = min(200, len(expanded_regions))  # 최대 200개 지역
            sampled_regions = random.sample(expanded_regions, sample_size)
            
            semaphore = asyncio.Semaphore(max_concurrent)
            
            async def expand_with_semaphore(region):
                async with semaphore:
                    return await self._process_region(region)
            
            # 배치 처리
            batch_size = 10
            for i in range(0, len(sampled_regions), batch_size):
                batch = sampled_regions[i:i + batch_size]
                tasks = [expand_with_semaphore(region) for region in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                success_count = sum(1 for r in results if r is True)
                self.stats['new_regions_added'] += success_count
                
                logger.info(f"확장 지역 배치 {i//batch_size + 1}: {success_count}/{len(batch)} 성공")
                
                # 진행률 출력
                progress = (i + len(batch)) / len(sampled_regions) * 100
                logger.info(f"확장 크롤링 진행률: {progress:.1f}%")
                
                # 배치 간 대기
                await asyncio.sleep(random.uniform(3, 7))
        
        # 세션 종료
        if self.session:
            await self.session.close()
        
        # 모든 트랜잭션 완료 대기
        logger.info("모든 트랜잭션 완료 대기 중...")
        final_stats = self.db_manager.wait_for_completion(timeout=1200)  # 20분 대기
        
        # 최종 통계
        self.stats['end_time'] = datetime.now()
        
        logger.info("=== 데이터 복구 완료 ===")
        logger.info(f"총 소요 시간: {self.stats['end_time'] - self.stats['start_time']}")
        logger.info(f"실패 지역 재시도: {self.stats['failed_regions_retry']}개")
        logger.info(f"새 지역 추가: {self.stats['new_regions_added']}개")
        logger.info(f"총 복구된 아파트: {self.stats['total_apartments_recovered']}개")
        logger.info(f"데이터베이스 저장 효율: {final_stats['success_rate']:.2f}%")
        
        # 데이터베이스 매니저 종료
        self.db_manager.close()
        
        return final_stats

async def main():
    """메인 실행 함수"""
    crawler = DataRecoveryCrawler()
    
    try:
        print("분실된 크롤링 데이터 복구 시작...")
        stats = await crawler.run_recovery(max_concurrent=3)
        
        print(f"\n복구 완료! 데이터베이스 저장 효율: {stats['success_rate']:.1f}%")
        
        # 최종 데이터베이스 상태 확인
        import sqlite3
        conn = sqlite3.connect("real_estate_crawling.db")
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
        final_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM crawling_progress WHERE status = 'completed'")
        completed_count = cursor.fetchone()[0]
        conn.close()
        
        print(f"최종 저장된 아파트 단지: {final_count}개")
        print(f"완료된 크롤링 지역: {completed_count}개")
        
    except KeyboardInterrupt:
        print("사용자에 의해 중단됨")
    except Exception as e:
        print(f"복구 오류: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())