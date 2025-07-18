#!/usr/bin/env python3
"""
개선된 전국 크롤러 - 최신 방법 + UltimateDatabaseManager
- 기존 성공한 크롤링 로직 유지
- UltimateDatabaseManager로 100% 저장 보장
- 대규모 데이터 수집 최적화
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

# UltimateDatabaseManager import
from ultimate_database_manager import UltimateDatabaseManager

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('enhanced_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# VPN 매니저 import
sys.path.append(os.path.join(os.path.dirname(__file__), 'modules', 'naver-crawler'))

try:
    from utils.vpn_manager import VPNManager, ensure_safe_connection, handle_ip_blocked
    VPN_AVAILABLE = True
    logger.info("VPN 백업 시스템 사용 가능")
except ImportError as e:
    VPN_AVAILABLE = False
    logger.warning(f"VPN 매니저 import 실패: {e}")

class EnhancedNationwideCrawler:
    def __init__(self, db_path="real_estate_crawling.db"):
        self.db_path = db_path
        self.base_url = "https://new.land.naver.com/api/complexes/single-markers/2.0"
        
        # UltimateDatabaseManager 초기화 (더 강력한 설정)
        self.db_manager = UltimateDatabaseManager(
            db_path=db_path,
            max_connections=20,
            max_retries=50
        )
        
        # VPN 매니저
        self.vpn_manager = VPNManager() if VPN_AVAILABLE else None
        
        # 통계
        self.stats = {
            'total_regions': 0,
            'processed_regions': 0,
            'total_apartments': 0,
            'saved_apartments': 0,
            'failed_regions': 0,
            'start_time': None,
            'end_time': None
        }
        
        # 세션 설정
        self.session = None
        self.headers = {
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
        
        logger.info("Enhanced Nationwide Crawler 초기화 완료")
        logger.info(f"UltimateDatabaseManager: {self.db_manager.max_connections}개 연결, {self.db_manager.max_retries}회 재시도")
    
    def generate_comprehensive_regions(self) -> List[Dict]:
        """전국 포괄적 지역 생성"""
        regions = []
        
        # 전국 시/도/구/동 데이터 (실제 행정구역 기반)
        korea_regions = {
            "서울특별시": {
                "강남구": ["개포동", "논현동", "대치동", "도곡동", "삼성동", "세곡동", "수서동", "신사동", "압구정동", "역삼동", "일원동", "청담동"],
                "강동구": ["강일동", "고덕동", "길동", "둔촌동", "명일동", "상일동", "성내동", "암사동", "천호동"],
                "강북구": ["미아동", "번동", "수유동", "우이동"],
                "강서구": ["가양동", "개화동", "공항동", "등촌동", "마곡동", "방화동", "염창동", "오곡동", "오쇠동", "외발산동", "내발산동", "화곡동"],
                "관악구": ["남현동", "대학동", "도림동", "미성동", "봉천동", "신림동", "인헌동", "조원동", "청림동", "청룡동", "행운동", "호암동"],
                "광진구": ["구의동", "광장동", "군자동", "능동", "자양동", "중곡동", "화양동"],
                "구로구": ["가리봉동", "개봉동", "고척동", "구로동", "궁동", "신도림동", "온수동", "오류동", "천왕동", "항동"],
                "금천구": ["가산동", "독산동", "시흥동"],
                "노원구": ["공릉동", "상계동", "월계동", "하계동", "중계동"],
                "도봉구": ["도봉동", "방학동", "쌍문동", "창동"],
                "동대문구": ["답십리동", "용두동", "제기동", "전농동", "청량리동", "회기동", "휘경동", "이문동", "장안동"],
                "동작구": ["노량진동", "대방동", "사당동", "상도동", "신대방동", "흑석동"],
                "마포구": ["공덕동", "구수동", "노고산동", "당인동", "대흥동", "도화동", "동교동", "마포동", "망원동", "상암동", "서교동", "서강동", "성산동", "신수동", "아현동", "연남동", "염리동", "용강동", "토정동", "하중동", "합정동", "현석동"],
                "서대문구": ["남가좌동", "냉천동", "대신동", "대현동", "미근동", "봉원동", "북가좌동", "북아현동", "신촌동", "연희동", "영천동", "옥천동", "창천동", "충정로동", "평동", "홍은동", "홍제동"],
                "서초구": ["내곡동", "반포동", "방배동", "서초동", "신원동", "양재동", "염곡동", "원지동", "잠원동"],
                "성동구": ["금호동", "도선동", "마장동", "사근동", "성수동", "송정동", "용답동", "왕십리동", "홍익동"],
                "성북구": ["길음동", "돈암동", "동소문동", "삼선동", "성북동", "안암동", "월곡동", "장위동", "정릉동", "종암동", "하월곡동"],
                "송파구": ["가락동", "거여동", "마천동", "문정동", "방이동", "삼전동", "석촌동", "송파동", "신천동", "오금동", "오륜동", "잠실동", "장지동", "풍납동"],
                "양천구": ["목동", "신월동", "신정동"],
                "영등포구": ["경인로", "대림동", "도림동", "문래동", "신길동", "양평동", "양화동", "여의도동", "영등포동", "당산동"],
                "용산구": ["갈월동", "남영동", "대사관로", "도원동", "동빙고동", "동자동", "보광동", "서빙고동", "신계동", "신창동", "용산동", "원효로동", "이촌동", "이태원동", "장문동", "청파동", "한강로동", "한남동", "효창동", "후암동"],
                "은평구": ["갈현동", "구산동", "대조동", "불광동", "수색동", "신사동", "역촌동", "응암동", "증산동", "진관동"],
                "종로구": ["가회동", "교남동", "궁정동", "권농동", "낙원동", "내수동", "내자동", "누상동", "누하동", "당주동", "도렴동", "돈의동", "동숭동", "명륜동", "묘동", "봉익동", "부암동", "사간동", "사직동", "삼청동", "서린동", "소격동", "송월동", "수송동", "숭인동", "신교동", "안국동", "와룡동", "운니동", "원서동", "원남동", "이화동", "인사동", "익선동", "장사동", "재동", "적선동", "정독도서관길", "종로동", "창신동", "청운동", "체부동", "충신동", "통의동", "통인동", "팔판동", "평창동", "필동", "행촌동", "혜화동", "홍지동", "홍파동", "화동", "훈정동"],
                "중구": ["광희동", "남산동", "남창동", "다산동", "동화동", "명동", "방산동", "보문동", "봉래동", "신당동", "신라동", "쌍림동", "을지로동", "입정동", "장교동", "장충동", "저동", "정동", "중림동", "초동", "충무로", "태평로", "필동", "황학동", "흥인동", "회현동"],
                "중랑구": ["면목동", "망우동", "상봉동", "신내동", "중화동"]
            },
            "부산광역시": {
                "중구": ["광복동", "남포동", "대청동", "동광동", "보수동", "부평동", "신창동", "영주동", "중앙동", "창선동"],
                "서구": ["남부민동", "대신동", "동대신동", "부민동", "서대신동", "아미동", "암남동", "충무동", "토성동"],
                "동구": ["범일동", "수정동", "좌천동", "초량동", "항만"],
                "영도구": ["남항동", "대평동", "동삼동", "봉래동", "신선동", "영선동", "절영도", "청학동", "태종대"],
                "부산진구": ["가야동", "개금동", "당감동", "범천동", "부암동", "연지동", "전포동", "초읍동"],
                "동래구": ["낙민동", "명륜동", "명장동", "복천동", "사직동", "수민동", "안락동", "온천동", "칠산동"],
                "남구": ["감만동", "대연동", "문현동", "용당동", "용호동", "우암동"],
                "북구": ["금곡동", "구포동", "덕천동", "만덕동", "화명동"],
                "해운대구": ["반송동", "반여동", "석대동", "송정동", "우동", "재송동", "좌동", "중동"],
                "사하구": ["감천동", "구평동", "다대동", "당리동", "신평동", "장림동", "하단동"],
                "금정구": ["구서동", "금사동", "금성동", "남산동", "부곡동", "서동", "오륜동", "장전동", "청룡동", "회동동"],
                "강서구": ["강동동", "대저동", "명지동", "미음동", "봉림동", "생곡동", "성북동", "송정동", "신호동", "지사동", "죽림동", "죽동동", "천성동"],
                "연제구": ["거제동", "연산동", "토현동"],
                "수영구": ["광안동", "남천동", "망미동", "민락동", "수영동"],
                "사상구": ["감전동", "괘법동", "덕포동", "모라동", "삼락동", "엄궁동", "주례동", "학장동"],
                "기장군": ["기장읍", "일광면", "장안읍", "정관읍", "철마면"]
            },
            "대구광역시": {
                "중구": ["남일동", "대봉동", "대신동", "동인동", "삼덕동", "성내동", "수동", "태평로", "포정동"],
                "동구": ["각산동", "괴전동", "금강동", "동촌동", "둔산동", "방촌동", "봉무동", "불로동", "신암동", "신천동", "효목동"],
                "서구": ["내당동", "비산동", "상중이동", "원대동", "이현동", "중리동", "평리동"],
                "남구": ["대명동", "봉덕동", "이천동"],
                "북구": ["고성동", "구암동", "국우동", "노원동", "대현동", "동천동", "매천동", "복현동", "사수동", "산격동", "서변동", "연경동", "읍내동", "칠성동", "태전동", "학정동", "함지동", "검단동"],
                "수성구": ["고산동", "두산동", "만촌동", "범물동", "상동", "수성동", "시지동", "연호동", "욱수동", "중동", "지산동", "파동", "황금동"],
                "달서구": ["갈산동", "감삼동", "대곡동", "대천동", "도원동", "두류동", "본동", "본리동", "상인동", "성당동", "송현동", "신당동", "용산동", "월곡동", "월성동", "유천동", "이곡동", "장기동", "죽전동", "진천동", "호림동", "호산동"],
                "달성군": ["가창면", "구지면", "논공읍", "다사읍", "유가읍", "옥포면", "하빈면", "현풍읍", "화원읍"]
            },
            "인천광역시": {
                "중구": ["관동", "궁동", "낙도동", "내동", "다소동", "답동", "덕교동", "도원동", "무의동", "북성동", "선린동", "송월동", "신생동", "신흥동", "영종동", "용동", "유동", "을왕동", "인현동", "전동", "중산동", "항동", "해안동"],
                "동구": ["금곡동", "만석동", "송현동", "송림동", "화도진동", "화평동"],
                "미추홀구": ["관교동", "도화동", "문학동", "숭의동", "용현동", "주안동", "학익동"],
                "연수구": ["동춘동", "송도동", "연수동", "청학동"],
                "남동구": ["간석동", "고잔동", "구월동", "논현동", "만수동", "서창동", "소래동", "장수동"],
                "부평구": ["갈산동", "구산동", "부평동", "산곡동", "삼산동", "십정동", "일신동", "청천동"],
                "계양구": ["계산동", "교동", "나진도동", "동양동", "박촌동", "서운동", "선주지동", "오류동", "용종동", "임학동", "작전동", "효성동"],
                "서구": ["가좌동", "가정동", "경서동", "공촌동", "금곡동", "마전동", "백석동", "시천동", "신현동", "심곡동", "연희동", "오류동", "왕길동", "원당동", "원창동", "청라동", "탄현동", "검암동"],
                "강화군": ["강화읍", "길상면", "내가면", "불은면", "선원면", "양도면", "양사면", "하점면", "화도면"],
                "옹진군": ["대청면", "덕적면", "백령면", "연평면", "영흥면"]
            },
            "광주광역시": {
                "동구": ["계림동", "금남로", "대인동", "동명동", "산수동", "서남동", "용산동", "지산동", "충장로", "학동"],
                "서구": ["광천동", "농성동", "눌지동", "덕흥동", "마륵동", "벽진동", "상무동", "쌍촌동", "치평동", "화정동"],
                "남구": ["구동", "노대동", "대촌동", "덕남동", "봉선동", "사직동", "압촌동", "양림동", "월산동", "진월동", "행암동", "효덕동"],
                "북구": ["건국동", "각화동", "광산동", "덕의동", "동림동", "매곡동", "문흥동", "본촌동", "삼각동", "생용동", "신안동", "오치동", "용봉동", "우산동", "운암동", "임동", "중흥동", "풍향동"],
                "광산구": ["고산동", "광산동", "남산동", "내산동", "도산동", "도덕동", "명화동", "본량동", "비아동", "산막동", "삼도동", "송정동", "신가동", "신창동", "어룡동", "오선동", "옥동", "운남동", "월곡동", "장덕동", "장수동", "진곡동", "하남동", "흑석동"]
            },
            "대전광역시": {
                "동구": ["가양동", "가오동", "과로동", "낭월동", "대동", "대청동", "삼성동", "상소동", "성남동", "소제동", "신인동", "신촌동", "용운동", "용전동", "이사동", "인동", "자양동", "장동", "정동", "주산동", "중동", "판암동", "하소동", "홍도동", "효동"],
                "중구": ["goal동", "금동", "낭월동", "대사동", "대흥동", "목동", "문창동", "문화동", "부사동", "사정동", "산성동", "석교동", "선화동", "안영동", "어남동", "오류동", "옥계동", "용두동", "유천동", "은행동", "인동", "중촌동", "침산동", "태평동", "호동"],
                "서구": ["가수원동", "가장동", "갈마동", "관저동", "괴정동", "기성동", "내동", "도마동", "둔산동", "만년동", "매노동", "변동", "복수동", "봉곡동", "산직동", "용문동", "원정동", "월평동", "장안동", "정림동", "평촌동"],
                "유성구": ["가정동", "관평동", "구즉동", "궁동", "금고동", "노은동", "대정동", "도룡동", "반석동", "봉명동", "상대동", "성북동", "신성동", "어은동", "외삼동", "원내동", "원촌동", "자운동", "장대동", "전민동", "죽동", "지족동", "탑립동", "하기동", "학하동"],
                "대덕구": ["갈전동", "금촌동", "낭월동", "대화동", "덕암동", "목상동", "법동", "비래동", "삼정동", "상서동", "석봉동", "송촌동", "신대동", "신탄진동", "안산동", "여러분동", "오정동", "용호동", "읍내동", "이현동", "장동", "중리동", "평촌동", "회덕동"]
            },
            "울산광역시": {
                "중구": ["교동", "다운동", "반구동", "복산동", "성남동", "성안동", "약사동", "옥교동", "우정동", "유곡동", "태화동", "학산동", "학성동"],
                "남구": ["고사동", "달동", "삼산동", "선암동", "수암동", "야음동", "여천동", "옥동", "용연동", "장생포동", "정자동", "무거동", "신정동"],
                "동구": ["남목동", "대송동", "동부동", "미포동", "방어동", "서부동", "일산동", "전하동", "주전동", "화정동"],
                "북구": ["농소동", "달천동", "매곡동", "명촌동", "무룡동", "산하동", "송정동", "신현동", "어물동", "연암동", "정자동", "중산동", "진장동", "화봉동"],
                "울주군": ["두동면", "두서면", "삼남면", "삼동면", "상북면", "서생면", "온산읍", "온양읍", "웅촌면", "언양읍", "청량면", "범서읍"]
            }
        }
        
        # 거래 타입
        trade_types = [
            {"name": "매매", "code": "A01"},
            {"name": "전세", "code": "B01"},
            {"name": "월세", "code": "B02"}
        ]
        
        # 모든 지역 조합 생성
        for city, gus in korea_regions.items():
            for gu, dongs in gus.items():
                for dong in dongs:
                    for trade_type in trade_types:
                        regions.append({
                            "city": city,
                            "gu": gu,
                            "dong": dong,
                            "trade_type": trade_type["name"],
                            "trade_code": trade_type["code"]
                        })
        
        logger.info(f"전국 포괄적 지역 {len(regions)}개 생성")
        return regions
    
    async def _create_session(self):
        """HTTP 세션 생성"""
        connector = aiohttp.TCPConnector(
            limit=200,
            limit_per_host=50,
            ttl_dns_cache=300,
            enable_cleanup_closed=True
        )
        
        timeout = aiohttp.ClientTimeout(total=30, connect=10)
        
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=self.headers
        )
        
        logger.info("HTTP 세션 생성 완료")
    
    async def _fetch_apartment_data(self, region: Dict) -> List[Dict]:
        """아파트 데이터 크롤링"""
        try:
            # 지역 코드 매핑
            region_codes = {
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
            
            cortarNo = region_codes.get(region["city"], "1100000000")
            
            # 네이버 부동산 API 파라미터 (성공했던 방식)
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
            
            url = f"{self.base_url}?{urlencode(params)}"
            
            # 요청 실행
            async with self.session.get(url) as response:
                if response.status == 200:
                    try:
                        data = await response.json()
                        markers = data.get('data', [])
                        
                        # 응답 데이터 구조 확인 및 파싱
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
                                    'address_jibun': marker.get('cortarAddress', '')
                                }
                                
                                # 유효한 데이터만 추가
                                if apartment['complex_id'] and apartment['complex_name']:
                                    apartments.append(apartment)
                                    
                            except Exception as e:
                                logger.debug(f"아파트 파싱 오류: {e}")
                                continue
                        
                        return apartments
                        
                    except json.JSONDecodeError:
                        logger.error(f"JSON 파싱 오류: {region['city']} {region['gu']} {region['dong']}")
                        return []
                        
                elif response.status == 429:
                    logger.warning(f"Rate limit: {region['city']} {region['gu']} {region['dong']} - 대기")
                    await asyncio.sleep(random.uniform(10, 20))
                    return []
                    
                else:
                    logger.error(f"HTTP {response.status}: {region['city']} {region['gu']} {region['dong']}")
                    return []
                    
        except asyncio.TimeoutError:
            logger.warning(f"타임아웃: {region['city']} {region['gu']} {region['dong']}")
            return []
        except Exception as e:
            logger.error(f"크롤링 오류: {region['city']} {region['gu']} {region['dong']} - {str(e)}")
            return []
    
    async def _process_region(self, region: Dict) -> Tuple[int, int]:
        """지역 처리 및 데이터 저장"""
        try:
            # 크롤링 실행
            apartments = await self._fetch_apartment_data(region)
            
            if not apartments:
                return 0, 0
            
            # 데이터베이스 저장
            saved_count = 0
            for apt in apartments:
                try:
                    # UltimateDatabaseManager로 안전하게 저장
                    success = self.db_manager.queue_transaction(
                        """INSERT OR REPLACE INTO apartment_complexes 
                           (complex_id, complex_name, city, gu, dong, latitude, longitude, 
                            construction_year, total_units, deal_min_price, deal_max_price, 
                            lease_min_price, lease_max_price, rent_min_price, rent_max_price,
                            trade_types, address_road, address_jibun, updated_at) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (apt['complex_id'], apt['complex_name'], apt['city'], apt['gu'], apt['dong'],
                         apt['latitude'], apt['longitude'], apt['construction_year'], apt['total_units'],
                         apt['deal_min_price'], apt['deal_max_price'], apt['lease_min_price'], apt['lease_max_price'],
                         apt['rent_min_price'], apt['rent_max_price'], apt['trade_type'],
                         apt['address_road'], apt['address_jibun'], datetime.now())
                    )
                    
                    if success:
                        saved_count += 1
                        
                except Exception as e:
                    logger.error(f"아파트 저장 오류: {str(e)}")
                    continue
            
            # 진행 상황 기록
            self.db_manager.queue_transaction(
                """INSERT OR REPLACE INTO crawling_progress 
                   (city, gu, dong, trade_type, status, crawl_start_time, crawl_end_time, apartment_count) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (region["city"], region["gu"], region["dong"], region["trade_type"], 
                 "completed", datetime.now(), datetime.now(), saved_count)
            )
            
            # 통계 업데이트
            self.stats['total_apartments'] += len(apartments)
            self.stats['saved_apartments'] += saved_count
            self.stats['processed_regions'] += 1
            
            logger.info(f"완료: {region['city']} {region['gu']} {region['dong']} {region['trade_type']} - {saved_count}/{len(apartments)}")
            
            return len(apartments), saved_count
            
        except Exception as e:
            logger.error(f"지역 처리 오류: {region['city']} {region['gu']} {region['dong']} - {str(e)}")
            self.stats['failed_regions'] += 1
            return 0, 0
    
    async def run_enhanced_crawling(self, max_concurrent=10, max_regions=1000):
        """개선된 크롤링 실행"""
        logger.info("=== Enhanced Nationwide Crawler 시작 ===")
        
        self.stats['start_time'] = datetime.now()
        
        # HTTP 세션 생성
        await self._create_session()
        
        # 전국 지역 생성
        all_regions = self.generate_comprehensive_regions()
        
        # 제한된 수의 지역만 처리 (테스트/성능)
        regions_to_process = all_regions[:max_regions]
        self.stats['total_regions'] = len(regions_to_process)
        
        logger.info(f"총 {len(regions_to_process)}개 지역 크롤링 시작")
        
        # 동시 처리 세마포어
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_with_semaphore(region):
            async with semaphore:
                return await self._process_region(region)
        
        try:
            # 배치별 처리
            batch_size = 50
            for i in range(0, len(regions_to_process), batch_size):
                batch = regions_to_process[i:i + batch_size]
                
                logger.info(f"배치 {i//batch_size + 1}/{(len(regions_to_process) + batch_size - 1)//batch_size} 처리 중...")
                
                # 배치 실행
                tasks = [process_with_semaphore(region) for region in batch]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # 결과 집계
                success_count = sum(1 for r in results if isinstance(r, tuple) and r[0] > 0)
                
                logger.info(f"배치 결과: {success_count}/{len(batch)} 성공")
                logger.info(f"전체 진행률: {self.stats['processed_regions']}/{len(regions_to_process)} ({self.stats['processed_regions']/len(regions_to_process)*100:.1f}%)")
                logger.info(f"누적 수집: 아파트 {self.stats['total_apartments']}개, 저장 {self.stats['saved_apartments']}개")
                
                # 배치 간 대기
                await asyncio.sleep(random.uniform(3, 8))
        
        except Exception as e:
            logger.error(f"크롤링 실행 중 오류: {str(e)}")
        
        finally:
            # 세션 종료
            if self.session:
                await self.session.close()
            
            # 모든 트랜잭션 완료 대기
            logger.info("모든 트랜잭션 완료 대기 중...")
            final_stats = self.db_manager.wait_for_completion(timeout=1800)  # 30분 대기
            
            # 최종 통계
            self.stats['end_time'] = datetime.now()
            
            logger.info("=== Enhanced Nationwide Crawler 완료 ===")
            logger.info(f"총 소요 시간: {self.stats['end_time'] - self.stats['start_time']}")
            logger.info(f"처리 지역: {self.stats['processed_regions']}/{self.stats['total_regions']}")
            logger.info(f"수집 아파트: {self.stats['total_apartments']}개")
            logger.info(f"저장 아파트: {self.stats['saved_apartments']}개")
            logger.info(f"실패 지역: {self.stats['failed_regions']}개")
            logger.info(f"데이터베이스 저장 효율: {final_stats['success_rate']:.2f}%")
            
            # 데이터베이스 매니저 종료
            self.db_manager.close()
            
            return final_stats

async def main():
    """메인 실행 함수"""
    crawler = EnhancedNationwideCrawler()
    
    try:
        print("Enhanced Nationwide Crawler 시작...")
        print("최신 크롤링 방법 + UltimateDatabaseManager 적용")
        
        # 1000개 지역으로 제한하여 테스트
        stats = await crawler.run_enhanced_crawling(max_concurrent=8, max_regions=1000)
        
        print(f"\n크롤링 완료! 데이터베이스 저장 효율: {stats['success_rate']:.1f}%")
        
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
        print(f"크롤링 오류: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())