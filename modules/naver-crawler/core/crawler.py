"""
네이버 부동산 크롤러 메인 클래스
"""

import asyncio
import aiohttp
import json
import csv
import pandas as pd
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from urllib.parse import urlencode
import logging

from .types import ApartmentData, CrawlerConfig, REGION_CODES, TRADE_TYPE_CODES
from .utils import (
    check_warp_status, get_region_code, get_trade_type_code, 
    calculate_coordinates, create_output_directory,
    validate_price_range, validate_area_range
)

logger = logging.getLogger(__name__)

class NaverRealEstateCrawler:
    """네이버 부동산 크롤러"""
    
    def __init__(self, config: Optional[CrawlerConfig] = None):
        """
        크롤러 초기화
        
        Args:
            config: 크롤러 설정 (기본값 사용 시 None)
        """
        self.config = config or CrawlerConfig()
        self.session: Optional[aiohttp.ClientSession] = None
        self.base_api_url = "https://new.land.naver.com/api/complexes/single-markers/2.0"
        
        # 로깅 설정
        if self.config.verbose:
            logging.getLogger().setLevel(logging.DEBUG)
    
    async def __aenter__(self):
        """비동기 컨텍스트 매니저 진입"""
        await self._init_session()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """비동기 컨텍스트 매니저 종료"""
        await self._close_session()
    
    async def _init_session(self):
        """HTTP 세션 초기화"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
        
        timeout = aiohttp.ClientTimeout(total=self.config.timeout)
        self.session = aiohttp.ClientSession(headers=headers, timeout=timeout)
    
    async def _close_session(self):
        """HTTP 세션 종료"""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def check_prerequisites(self) -> bool:
        """
        크롤링 전제 조건 확인 (VPN 백업 시스템 포함)
        
        Returns:
            bool: 전제 조건 만족 여부
        """
        logger.info("🔍 크롤링 전제 조건 확인 중...")
        
        try:
            # VPN 백업 시스템 사용
            from utils.vpn_manager import ensure_safe_connection
            
            logger.info("🚀 VPN 백업 시스템으로 안전한 연결 보장 중...")
            success, ip, vpn_type = await ensure_safe_connection()
            
            if success:
                logger.info(f"✅ {vpn_type} 연결 성공 - IP: {ip}")
                return True
            else:
                logger.error("❌ 모든 VPN 연결 실패")
                logger.warning("⚠️ VPN 없이 진행합니다 (위험할 수 있음)")
                return True  # VPN 없이도 진행 허용
                
        except ImportError:
            logger.warning("⚠️ VPN 매니저를 찾을 수 없음, 기존 WARP 확인 사용")
            
            # 기존 WARP 확인 방식
            warp_connected, ip = await check_warp_status()
            if warp_connected:
                logger.info(f"✅ WARP 연결됨 - IP: {ip}")
                return True
            else:
                logger.warning(f"⚠️ WARP 미연결 - IP: {ip}")
                logger.warning("WARP 연결을 권장하지만 계속 진행합니다.")
                return True  # WARP 없이도 진행 허용
                
        except Exception as e:
            logger.error(f"❌ VPN 연결 확인 오류: {e}")
            logger.warning("⚠️ VPN 상태 불명, 계속 진행합니다")
            return True
    
    def _build_api_params(self, region_code: str, trade_type: str, **kwargs) -> Dict[str, str]:
        """
        API 호출 파라미터 구성
        
        Args:
            region_code: 지역 코드
            trade_type: 거래 타입 코드
            **kwargs: 추가 파라미터
            
        Returns:
            Dict[str, str]: API 파라미터
        """
        # 좌표 계산
        left_lon, right_lon, top_lat, bottom_lat = calculate_coordinates(region_code)
        
        # 가격 범위 검증
        price_min, price_max = validate_price_range(
            self.config.price_min, self.config.price_max
        )
        
        # 면적 범위 검증
        area_min, area_max = validate_area_range(
            self.config.area_min, self.config.area_max
        )
        
        params = {
            'cortarNo': region_code,
            'zoom': str(self.config.zoom_level),
            'priceType': 'RETAIL',
            'markerId': '',
            'markerType': '',
            'selectedComplexNo': '',
            'selectedComplexBuildingNo': '',
            'fakeComplexMarker': '',
            'realEstateType': 'APT:ABYG:JGC:PRE',  # 아파트 관련 타입들
            'tradeType': trade_type,
            'tag': '::::::::',
            'rentPriceMin': '0',
            'rentPriceMax': str(price_max),
            'priceMin': str(price_min),
            'priceMax': str(price_max),
            'areaMin': str(area_min),
            'areaMax': str(area_max),
            'oldBuildYears': str(self.config.build_years_old),
            'recentlyBuildYears': str(self.config.build_years_new),
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
        
        # 추가 파라미터 오버라이드
        params.update(kwargs)
        
        return params
    
    async def _call_api(self, params: Dict[str, str], region_name: str) -> Optional[List[Dict]]:
        """
        네이버 부동산 API 호출
        
        Args:
            params: API 파라미터
            region_name: 지역명 (로깅용)
            
        Returns:
            Optional[List[Dict]]: API 응답 데이터
        """
        if not self.session:
            await self._init_session()
        
        url = f"{self.base_api_url}?{urlencode(params)}"
        
        for attempt in range(self.config.max_retries):
            try:
                logger.debug(f"API 호출 시도 {attempt + 1}/{self.config.max_retries}: {region_name}")
                
                async with self.session.get(url) as response:
                    if response.status == 200:
                        content_type = response.headers.get('content-type', '')
                        
                        if 'json' in content_type:
                            data = await response.json()
                            
                            if isinstance(data, list):
                                logger.info(f"✅ {region_name}: {len(data)}개 아파트 데이터 수신")
                                return data
                            else:
                                logger.warning(f"⚠️ {region_name}: 예상과 다른 응답 형식")
                                return None
                        else:
                            logger.warning(f"⚠️ {region_name}: JSON이 아닌 응답")
                            return None
                    else:
                        logger.warning(f"⚠️ {region_name}: HTTP {response.status}")
                        
            except asyncio.TimeoutError:
                logger.warning(f"⚠️ {region_name}: 타임아웃 (시도 {attempt + 1})")
            except Exception as e:
                logger.warning(f"⚠️ {region_name}: API 호출 오류 - {e}")
            
            if attempt < self.config.max_retries - 1:
                await asyncio.sleep(self.config.request_delay)
        
        logger.error(f"❌ {region_name}: 모든 재시도 실패")
        return None
    
    def _parse_apartment_data(self, raw_data: List[Dict], region_name: str) -> List[ApartmentData]:
        """
        원시 API 데이터를 ApartmentData 객체로 변환
        
        Args:
            raw_data: 원시 API 응답 데이터
            region_name: 지역명
            
        Returns:
            List[ApartmentData]: 파싱된 아파트 데이터 리스트
        """
        apartments = []
        
        for item in raw_data:
            try:
                apartment = ApartmentData(
                    complex_name=item.get('complexName'),
                    complex_no=str(item.get('markerId', '')),
                    address=region_name,
                    
                    # 가격 정보 (만원 단위)
                    min_deal_price=item.get('minDealPrice'),
                    max_deal_price=item.get('maxDealPrice'),
                    min_jeonse_price=item.get('minLeasePrice'),
                    max_jeonse_price=item.get('maxLeasePrice'),
                    min_monthly_rent=item.get('minRentPrice'),
                    max_monthly_rent=item.get('maxRentPrice'),
                    
                    # 면적 정보
                    min_area=item.get('minArea'),
                    max_area=item.get('maxArea'),
                    representative_area=item.get('representativeArea'),
                    
                    # 건물 정보
                    total_household_count=item.get('totalHouseholdCount'),
                    total_dong_count=item.get('totalDongCount'),
                    completion_year_month=item.get('completionYearMonth'),
                    floor_area_ratio=item.get('floorAreaRatio'),
                    
                    # 위치 정보
                    latitude=item.get('latitude'),
                    longitude=item.get('longitude'),
                    
                    # 거래 정보
                    deal_count=item.get('dealCount'),
                    lease_count=item.get('leaseCount'),
                    rent_count=item.get('rentCount'),
                    
                    # 메타 정보
                    photo_count=item.get('photoCount'),
                    real_estate_type=item.get('realEstateTypeName'),
                    collect_time=datetime.now(),
                    source_region=region_name,
                    
                    # 원본 데이터 보존
                    raw_data=item
                )
                
                apartments.append(apartment)
                
            except Exception as e:
                logger.warning(f"아파트 데이터 파싱 오류: {e}")
                continue
        
        return apartments
    
    async def get_apartments(
        self, 
        city: str, 
        district: str, 
        trade_type: str = "매매"
    ) -> List[ApartmentData]:
        """
        특정 지역의 아파트 매물 정보 조회
        
        Args:
            city: 도시명 (예: "서울", "부산")
            district: 구/군명 (예: "강남구", "해운대구")
            trade_type: 거래 타입 (매매, 전세, 월세)
            
        Returns:
            List[ApartmentData]: 아파트 매물 리스트
        """
        # 전제 조건 확인
        await self.check_prerequisites()
        
        # 지역 코드 조회
        region_code = get_region_code(city, district)
        if not region_code:
            raise ValueError(f"지원하지 않는 지역: {city} {district}")
        
        # 거래 타입 코드 조회
        trade_type_code = get_trade_type_code(trade_type)
        
        # API 파라미터 구성
        params = self._build_api_params(region_code, trade_type_code)
        
        # API 호출
        region_name = f"{city}_{district}"
        raw_data = await self._call_api(params, region_name)
        
        if raw_data is None:
            logger.warning(f"❌ {region_name}: 데이터를 가져올 수 없습니다.")
            return []
        
        # 데이터 파싱
        apartments = self._parse_apartment_data(raw_data, region_name)
        
        logger.info(f"✅ {region_name}: 총 {len(apartments)}개 아파트 수집 완료")
        
        return apartments
    
    async def get_apartments_bulk(
        self, 
        regions: List[tuple], 
        trade_type: str = "매매"
    ) -> Dict[str, List[ApartmentData]]:
        """
        여러 지역의 아파트 매물 정보 일괄 조회
        
        Args:
            regions: 지역 리스트 [(도시, 구/군), ...]
            trade_type: 거래 타입
            
        Returns:
            Dict[str, List[ApartmentData]]: 지역별 아파트 매물 딕셔너리
        """
        results = {}
        
        for city, district in regions:
            try:
                apartments = await self.get_apartments(city, district, trade_type)
                results[f"{city}_{district}"] = apartments
                
                # 요청 간 딜레이
                await asyncio.sleep(self.config.request_delay)
                
            except Exception as e:
                logger.error(f"❌ {city} {district}: {e}")
                results[f"{city}_{district}"] = []
        
        return results
    
    def save_to_csv(self, apartments: List[ApartmentData], filename: Optional[str] = None) -> str:
        """
        아파트 데이터를 CSV 파일로 저장
        
        Args:
            apartments: 아파트 데이터 리스트
            filename: 파일명 (기본값: 자동 생성)
            
        Returns:
            str: 저장된 파일 경로
        """
        if not apartments:
            raise ValueError("저장할 아파트 데이터가 없습니다.")
        
        # 출력 디렉토리 생성
        output_dir = create_output_directory(self.config.output_dir)
        
        # 파일명 생성
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"naver_apartments_{timestamp}.csv"
        
        filepath = output_dir / filename
        
        # 데이터를 딕셔너리 리스트로 변환
        data_dicts = [apt.to_dict() for apt in apartments]
        
        # DataFrame 생성 및 저장
        df = pd.DataFrame(data_dicts)
        df.to_csv(filepath, index=False, encoding='utf-8-sig')
        
        logger.info(f"💾 CSV 저장 완료: {filepath}")
        return str(filepath)
    
    def save_to_json(self, apartments: List[ApartmentData], filename: Optional[str] = None) -> str:
        """
        아파트 데이터를 JSON 파일로 저장
        
        Args:
            apartments: 아파트 데이터 리스트
            filename: 파일명 (기본값: 자동 생성)
            
        Returns:
            str: 저장된 파일 경로
        """
        if not apartments:
            raise ValueError("저장할 아파트 데이터가 없습니다.")
        
        # 출력 디렉토리 생성
        output_dir = create_output_directory(self.config.output_dir)
        
        # 파일명 생성
        if filename is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"naver_apartments_{timestamp}.json"
        
        filepath = output_dir / filename
        
        # 데이터를 딕셔너리 리스트로 변환
        data_dicts = [apt.to_dict() for apt in apartments]
        
        # JSON 저장
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data_dicts, f, ensure_ascii=False, indent=2)
        
        logger.info(f"💾 JSON 저장 완료: {filepath}")
        return str(filepath)
    
    def get_supported_regions(self) -> Dict[str, List[str]]:
        """
        지원하는 지역 목록 반환
        
        Returns:
            Dict[str, List[str]]: 도시별 구/군 목록
        """
        return REGION_CODES.copy()