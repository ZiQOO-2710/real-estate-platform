#!/usr/bin/env python3
"""
🏢 전국 아파트 단지 종합 크롤러 v2.0
- Playwright 기반 완전 크롤링
- VPN 로테이션 시스템 (WARP + NordVPN)
- 전국 시도/시군구 자동 탐색
- 매물 호가 전체 수집 (매매/전세/월세)
- 하나도 빠뜨리지 않는 완전 수집 시스템
"""

import asyncio
import json
import time
import sqlite3
import logging
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, asdict
import random
import traceback

# Playwright 관련
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

# 프로젝트 모듈들
sys.path.append(str(Path(__file__).parent))
sys.path.append(str(Path(__file__).parent / "modules" / "naver-crawler"))

try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("vpn_manager", "modules/naver-crawler/utils/vpn_manager.py")
    vpn_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vpn_module)
    VPNManager = vpn_module.VPNManager
except:
    try:
        from utils.vpn_manager import VPNManager
    except ImportError:
        # VPN 매니저가 없으면 더미 클래스 생성
        class VPNManager:
            async def ensure_vpn_connection(self):
                return False, "No VPN", "None"
            async def handle_blocking_detected(self, content):
                return False, "No VPN", "None"

try:
    from ultimate_database_manager import UltimateDatabaseManager
except ImportError:
    # 기본 데이터베이스 매니저 생성
    import sqlite3
    
    class UltimateDatabaseManager:
        def __init__(self, db_path):
            self.db_path = db_path
            
        def safe_execute(self, query, params=None):
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            try:
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                conn.commit()
                return cursor.fetchall()
            finally:
                conn.close()

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('comprehensive_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class CrawlingProgress:
    """크롤링 진행 상황"""
    total_regions: int = 0
    completed_regions: int = 0
    total_complexes: int = 0
    completed_complexes: int = 0
    total_listings: int = 0
    current_region: str = ""
    start_time: str = ""
    estimated_completion: str = ""
    vpn_switches: int = 0
    errors: int = 0

@dataclass
class ApartmentComplex:
    """아파트 단지 정보"""
    complex_id: str
    complex_name: str
    address: str
    region_code: str
    region_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    total_households: Optional[int] = None
    completion_year: Optional[str] = None
    building_count: Optional[int] = None
    min_floor: Optional[int] = None
    max_floor: Optional[int] = None
    parking_total: Optional[int] = None
    heating_type: Optional[str] = None
    areas: Optional[List[str]] = None
    source_url: str = ""
    crawled_at: str = ""

@dataclass
class PropertyListing:
    """매물 정보"""
    listing_id: str
    complex_id: str
    complex_name: str
    deal_type: str  # 매매, 전세, 월세
    price: Optional[str] = None
    monthly_rent: Optional[str] = None
    deposit: Optional[str] = None
    area_m2: Optional[float] = None
    area_pyeong: Optional[float] = None
    floor: Optional[int] = None
    direction: Optional[str] = None
    room_count: Optional[str] = None
    bathroom_count: Optional[str] = None
    built_year: Optional[str] = None
    move_in_date: Optional[str] = None
    maintenance_cost: Optional[str] = None
    description: Optional[str] = None
    agent_name: Optional[str] = None
    agent_phone: Optional[str] = None
    listing_url: str = ""
    crawled_at: str = ""

class ComprehensiveNationwideCrawler:
    """전국 아파트 단지 종합 크롤러"""
    
    def __init__(self):
        self.vpn_manager = VPNManager()
        self.db_manager = UltimateDatabaseManager("comprehensive_real_estate.db")
        
        # Playwright 관련
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
        # 크롤링 설정
        self.base_url = "https://new.land.naver.com"
        self.delay_min = 2.0
        self.delay_max = 5.0
        self.error_delay = 10.0
        self.vpn_switch_threshold = 5  # 에러 5회시 VPN 전환
        
        # 진행 상황 추적
        self.progress = CrawlingProgress()
        self.start_time = datetime.now()
        self.progress.start_time = self.start_time.isoformat()
        
        # 통계
        self.stats = {
            'regions_processed': 0,
            'complexes_found': 0,
            'listings_collected': 0,
            'errors': 0,
            'vpn_switches': 0,
            'start_time': self.start_time
        }
        
        # 전국 지역 코드 (시도 단위)
        self.regions = {
            '11': '서울특별시',
            '26': '부산광역시', 
            '27': '대구광역시',
            '28': '인천광역시',
            '29': '광주광역시',
            '30': '대전광역시',
            '31': '울산광역시',
            '36': '세종특별자치시',
            '41': '경기도',
            '42': '강원도',
            '43': '충청북도',
            '44': '충청남도',
            '45': '전라북도',
            '46': '전라남도',
            '47': '경상북도',
            '48': '경상남도',
            '50': '제주특별자치도'
        }
        
        self.progress.total_regions = len(self.regions)
        
    async def init_crawler(self):
        """크롤러 초기화"""
        logger.info("🚀 전국 아파트 종합 크롤러 초기화 중...")
        
        # VPN 연결 보장
        vpn_success, ip, vpn_type = await self.vpn_manager.ensure_vpn_connection()
        if vpn_success:
            logger.info(f"✅ VPN 연결 성공: {vpn_type} - IP: {ip}")
        else:
            logger.warning("⚠️ VPN 연결 실패, 일반 연결로 진행")
        
        # Playwright 초기화
        await self._init_playwright()
        
        # 데이터베이스 초기화
        await self._init_database()
        
        logger.info("✅ 크롤러 초기화 완료")
    
    async def _init_playwright(self):
        """Playwright 브라우저 초기화"""
        logger.info("🎭 Playwright 브라우저 초기화 중...")
        
        self.playwright = await async_playwright().start()
        
        # 안티 디텍션 브라우저 설정
        self.browser = await self.playwright.chromium.launch(
            headless=True,  # 백그라운드 실행
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-web-security',
                '--disable-features=TranslateUI',
                '--no-first-run',
                '--no-default-browser-check',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        )
        
        # 브라우저 컨텍스트 생성
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # 페이지 생성
        self.page = await self.context.new_page()
        
        # 안티 디텍션 스크립트 주입
        await self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            delete window.console.debug;
            delete window.console.clear;
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en'],
            });
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // 브라우저 자동화 감지 우회
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' })
                })
            });
        """)
        
        # 타임아웃 설정
        self.page.set_default_timeout(30000)
        
        logger.info("✅ Playwright 브라우저 초기화 완료")
    
    async def _init_database(self):
        """데이터베이스 테이블 초기화"""
        logger.info("💾 데이터베이스 초기화 중...")
        
        # 테이블 생성
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT,
                address TEXT,
                region_code TEXT,
                region_name TEXT,
                latitude REAL,
                longitude REAL,
                total_households INTEGER,
                completion_year TEXT,
                building_count INTEGER,
                min_floor INTEGER,
                max_floor INTEGER,
                parking_total INTEGER,
                heating_type TEXT,
                areas TEXT,
                source_url TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS property_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                listing_id TEXT UNIQUE NOT NULL,
                complex_id TEXT,
                complex_name TEXT,
                deal_type TEXT,
                price TEXT,
                monthly_rent TEXT,
                deposit TEXT,
                area_m2 REAL,
                area_pyeong REAL,
                floor INTEGER,
                direction TEXT,
                room_count TEXT,
                bathroom_count TEXT,
                built_year TEXT,
                move_in_date TEXT,
                maintenance_cost TEXT,
                description TEXT,
                agent_name TEXT,
                agent_phone TEXT,
                listing_url TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (complex_id) REFERENCES apartment_complexes (complex_id)
            )
        """)
        
        self.db_manager.safe_execute("""
            CREATE TABLE IF NOT EXISTS crawling_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region_code TEXT,
                region_name TEXT,
                status TEXT,
                complexes_found INTEGER DEFAULT 0,
                listings_found INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 인덱스 생성
        self.db_manager.safe_execute("CREATE INDEX IF NOT EXISTS idx_complex_id ON apartment_complexes(complex_id)")
        self.db_manager.safe_execute("CREATE INDEX IF NOT EXISTS idx_region_code ON apartment_complexes(region_code)")
        self.db_manager.safe_execute("CREATE INDEX IF NOT EXISTS idx_listing_complex ON property_listings(complex_id)")
        self.db_manager.safe_execute("CREATE INDEX IF NOT EXISTS idx_deal_type ON property_listings(deal_type)")
        
        logger.info("✅ 데이터베이스 초기화 완료")
    
    async def start_comprehensive_crawling(self):
        """전국 종합 크롤링 시작"""
        logger.info("🌍 전국 아파트 단지 종합 크롤링 시작!")
        logger.info(f"📊 대상 지역: {len(self.regions)}개 시도")
        
        try:
            for region_code, region_name in self.regions.items():
                self.progress.current_region = f"{region_name} ({region_code})"
                logger.info(f"\n🏙️ [{self.progress.completed_regions + 1}/{self.progress.total_regions}] {region_name} 크롤링 시작")
                
                # 지역별 크롤링 진행 기록
                await self._record_region_progress(region_code, region_name, "진행중")
                
                try:
                    # 해당 지역의 모든 시군구 크롤링
                    region_result = await self._crawl_region_complete(region_code, region_name)
                    
                    if region_result['success']:
                        logger.info(f"✅ {region_name} 크롤링 완료 - 단지: {region_result['complexes']}개, 매물: {region_result['listings']}개")
                        await self._record_region_progress(region_code, region_name, "완료", 
                                                         region_result['complexes'], region_result['listings'])
                    else:
                        logger.error(f"❌ {region_name} 크롤링 실패: {region_result.get('error', 'Unknown')}")
                        await self._record_region_progress(region_code, region_name, "실패", 
                                                         error_message=region_result.get('error', 'Unknown'))
                    
                    self.progress.completed_regions += 1
                    
                    # 지역간 대기 시간 (서버 부하 방지)
                    await self._intelligent_delay()
                    
                except Exception as e:
                    logger.error(f"❌ {region_name} 크롤링 중 오류: {e}")
                    await self._record_region_progress(region_code, region_name, "오류", error_message=str(e))
                    await self._handle_error(str(e))
            
            # 크롤링 완료 통계
            await self._print_final_statistics()
            
        except Exception as e:
            logger.error(f"❌ 전국 크롤링 중 치명적 오류: {e}")
            traceback.print_exc()
        
        finally:
            await self._cleanup()
    
    async def _crawl_region_complete(self, region_code: str, region_name: str) -> Dict[str, Any]:
        """특정 지역의 완전 크롤링"""
        logger.info(f"🔍 {region_name} 상세 크롤링 시작")
        
        complexes_found = 0
        listings_found = 0
        
        try:
            # 1단계: 지역의 모든 시군구 탐색
            districts = await self._discover_districts(region_code, region_name)
            logger.info(f"📍 {region_name} 하위 지역 {len(districts)}개 발견")
            
            # 2단계: 각 시군구별 아파트 단지 탐색
            for district_code, district_name in districts.items():
                logger.info(f"  🏘️ {district_name} 크롤링 중...")
                
                # 해당 지역의 아파트 단지 목록 수집
                complexes = await self._discover_complexes_in_district(region_code, district_code, f"{region_name} {district_name}")
                
                logger.info(f"  📊 {district_name}: 아파트 단지 {len(complexes)}개 발견")
                complexes_found += len(complexes)
                
                # 3단계: 각 단지별 상세 정보 및 매물 수집
                for complex_info in complexes:
                    try:
                        # 단지 상세 정보 크롤링
                        complex_detail = await self._crawl_complex_detail(complex_info)
                        if complex_detail:
                            await self._save_complex(complex_detail)
                        
                        # 해당 단지의 모든 매물 크롤링
                        listings = await self._crawl_complex_listings(complex_info['complex_id'])
                        listings_found += len(listings)
                        
                        for listing in listings:
                            await self._save_listing(listing)
                        
                        # 단지별 딜레이
                        await asyncio.sleep(random.uniform(1, 3))
                        
                    except Exception as e:
                        logger.error(f"  ❌ 단지 {complex_info.get('name', 'Unknown')} 크롤링 오류: {e}")
                        await self._handle_error(str(e))
                
                # 시군구별 딜레이
                await asyncio.sleep(random.uniform(2, 4))
            
            return {
                'success': True,
                'complexes': complexes_found,
                'listings': listings_found
            }
            
        except Exception as e:
            logger.error(f"❌ {region_name} 크롤링 중 오류: {e}")
            return {
                'success': False,
                'error': str(e),
                'complexes': complexes_found,
                'listings': listings_found
            }
    
    async def _discover_districts(self, region_code: str, region_name: str) -> Dict[str, str]:
        """지역의 모든 시군구 탐색"""
        logger.info(f"🔍 {region_name} 하위 지역 탐색 중...")
        
        try:
            # 네이버 부동산 지역 선택 페이지로 이동
            url = f"{self.base_url}/complexes?ms=37.5665,126.9780,11&a=APT:ABYG:JGC:PRE&e=RETAIL"
            await self.page.goto(url, wait_until="networkidle", timeout=30000)
            
            await asyncio.sleep(3)
            
            # 지역 선택 UI 조작하여 시군구 목록 추출
            districts = await self.page.evaluate(f"""
                async () => {{
                    const districts = {{}};
                    
                    // 여러 방법으로 지역 정보 추출 시도
                    const selectors = [
                        '[data-region-code="{region_code}"]',
                        '.region_list',
                        '.area_list',
                        '[class*="region"]',
                        '[class*="area"]'
                    ];
                    
                    for (const selector of selectors) {{
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {{
                            const text = el.textContent.trim();
                            if (text && text.length > 0 && text.includes('시') || text.includes('군') || text.includes('구')) {{
                                const code = el.getAttribute('data-code') || el.getAttribute('value') || Math.random().toString();
                                districts[code] = text;
                            }}
                        }});
                    }}
                    
                    // 기본 시군구 목록 (백업)
                    if (Object.keys(districts).length === 0) {{
                        const defaultDistricts = {{
                            'default': '{region_name} 전체'
                        }};
                        return defaultDistricts;
                    }}
                    
                    return districts;
                }}
            """)
            
            if not districts:
                # 백업: 기본 지역으로 설정
                districts = {'default': f'{region_name} 전체'}
            
            logger.info(f"📍 {region_name} 하위 지역 {len(districts)}개 발견: {list(districts.values())}")
            return districts
            
        except Exception as e:
            logger.error(f"❌ {region_name} 하위 지역 탐색 실패: {e}")
            # 백업: 기본 지역으로 설정
            return {'default': f'{region_name} 전체'}
    
    async def _discover_complexes_in_district(self, region_code: str, district_code: str, district_name: str) -> List[Dict[str, Any]]:
        """특정 시군구의 모든 아파트 단지 탐색"""
        logger.info(f"🏘️ {district_name} 아파트 단지 탐색 중...")
        
        complexes = []
        page_num = 1
        max_pages = 100  # 안전장치
        
        try:
            while page_num <= max_pages:
                # 해당 지역의 아파트 목록 페이지로 이동
                url = f"{self.base_url}/complexes"
                params = {
                    'cortarNo': region_code,
                    'ptpNo': 'APT',
                    'rletTpCd': 'A01',
                    'page': page_num
                }
                
                query_string = '&'.join([f"{k}={v}" for k, v in params.items()])
                full_url = f"{url}?{query_string}"
                
                await self.page.goto(full_url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(random.uniform(2, 4))
                
                # 페이지에서 아파트 단지 정보 추출
                page_complexes = await self.page.evaluate("""
                    () => {
                        const complexes = [];
                        
                        // 다양한 셀렉터로 아파트 단지 요소 찾기
                        const selectors = [
                            '.complex_item',
                            '.item_link',
                            '.complex_link',
                            '[data-complex-no]',
                            'a[href*="/complexes/"]',
                            '.list_item',
                            '[class*="complex"]',
                            '[class*="item"]'
                        ];
                        
                        for (const selector of selectors) {
                            const elements = document.querySelectorAll(selector);
                            
                            elements.forEach(el => {
                                const href = el.href || el.querySelector('a')?.href;
                                const text = el.textContent.trim();
                                
                                if (href && href.includes('/complexes/') && text && text.length > 5) {
                                    const complexMatch = href.match(/\/complexes\/(\d+)/);
                                    if (complexMatch) {
                                        const complexId = complexMatch[1];
                                        
                                        // 중복 체크
                                        if (!complexes.find(c => c.complex_id === complexId)) {
                                            // 단지명 추출
                                            const nameEl = el.querySelector('.complex_title, .name, h3, h4, strong') || el;
                                            const complexName = nameEl.textContent.trim().split('\\n')[0];
                                            
                                            // 주소 추출
                                            const addressEl = el.querySelector('.address, .location, .addr') || el;
                                            const address = addressEl.textContent.trim().split('\\n').find(line => 
                                                line.includes('시') || line.includes('구') || line.includes('군')
                                            ) || '';
                                            
                                            complexes.push({
                                                complex_id: complexId,
                                                name: complexName,
                                                address: address,
                                                url: href
                                            });
                                        }
                                    }
                                }
                            });
                            
                            if (complexes.length > 0) break; // 하나라도 찾으면 중단
                        }
                        
                        return complexes;
                    }
                """)
                
                if page_complexes:
                    complexes.extend(page_complexes)
                    logger.info(f"  📄 {district_name} {page_num}페이지: {len(page_complexes)}개 단지 발견")
                    page_num += 1
                    
                    # 페이지간 딜레이
                    await asyncio.sleep(random.uniform(1, 2))
                else:
                    logger.info(f"  ✅ {district_name} 탐색 완료 (총 {page_num-1}페이지)")
                    break
            
            # 중복 제거
            unique_complexes = []
            seen_ids = set()
            for complex_info in complexes:
                if complex_info['complex_id'] not in seen_ids:
                    unique_complexes.append(complex_info)
                    seen_ids.add(complex_info['complex_id'])
            
            logger.info(f"📊 {district_name} 최종 결과: {len(unique_complexes)}개 단지 발견")
            return unique_complexes
            
        except Exception as e:
            logger.error(f"❌ {district_name} 단지 탐색 실패: {e}")
            await self._handle_error(str(e))
            return complexes
    
    async def _crawl_complex_detail(self, complex_info: Dict[str, Any]) -> Optional[ApartmentComplex]:
        """아파트 단지 상세 정보 크롤링"""
        complex_id = complex_info['complex_id']
        logger.info(f"🏢 단지 상세 정보 크롤링: {complex_info.get('name', complex_id)}")
        
        try:
            # 단지 상세 페이지로 이동
            detail_url = f"{self.base_url}/complexes/{complex_id}"
            await self.page.goto(detail_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            
            # 상세 정보 추출
            detail_info = await self.page.evaluate("""
                () => {
                    const info = {};
                    
                    // 단지명
                    const nameSelectors = [
                        'h1.complex_title',
                        '.complex_name',
                        '.title',
                        'h1',
                        '[class*="title"]'
                    ];
                    
                    for (const selector of nameSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.textContent.trim()) {
                            info.complex_name = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // 주소
                    const addressSelectors = [
                        '.complex_address',
                        '.address',
                        '[class*="address"]',
                        '[class*="location"]'
                    ];
                    
                    for (const selector of addressSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.textContent.trim()) {
                            info.address = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // 전체 텍스트에서 정보 추출
                    const fullText = document.body.textContent;
                    
                    // 세대수
                    const householdMatch = fullText.match(/(\\d+)\\s*세대/);
                    if (householdMatch) {
                        info.total_households = parseInt(householdMatch[1]);
                    }
                    
                    // 준공년도
                    const yearMatch = fullText.match(/(19|20)\\d{2}년?\\s*준?공?/);
                    if (yearMatch) {
                        info.completion_year = yearMatch[0];
                    }
                    
                    // 동수
                    const buildingMatch = fullText.match(/(\\d+)\\s*동/);
                    if (buildingMatch) {
                        info.building_count = parseInt(buildingMatch[1]);
                    }
                    
                    // 층수
                    const floorMatches = fullText.match(/(\\d+)층/g);
                    if (floorMatches && floorMatches.length > 0) {
                        const floors = floorMatches.map(f => parseInt(f.replace('층', '')));
                        info.min_floor = Math.min(...floors);
                        info.max_floor = Math.max(...floors);
                    }
                    
                    // 주차대수
                    const parkingMatch = fullText.match(/(\\d+)\\s*대\\s*주차/);
                    if (parkingMatch) {
                        info.parking_total = parseInt(parkingMatch[1]);
                    }
                    
                    // 난방방식
                    const heatingMatches = fullText.match(/(개별난방|중앙난방|지역난방|도시가스)/);
                    if (heatingMatches) {
                        info.heating_type = heatingMatches[0];
                    }
                    
                    // 면적 정보
                    const areaMatches = fullText.match(/(\\d+\\.?\\d*)㎡/g);
                    if (areaMatches && areaMatches.length > 0) {
                        info.areas = [...new Set(areaMatches)].slice(0, 10);
                    }
                    
                    return info;
                }
            """)
            
            # ApartmentComplex 객체 생성
            complex_detail = ApartmentComplex(
                complex_id=complex_id,
                complex_name=detail_info.get('complex_name', complex_info.get('name', '')),
                address=detail_info.get('address', complex_info.get('address', '')),
                region_code=complex_info.get('region_code', ''),
                region_name=complex_info.get('region_name', ''),
                total_households=detail_info.get('total_households'),
                completion_year=detail_info.get('completion_year'),
                building_count=detail_info.get('building_count'),
                min_floor=detail_info.get('min_floor'),
                max_floor=detail_info.get('max_floor'),
                parking_total=detail_info.get('parking_total'),
                heating_type=detail_info.get('heating_type'),
                areas=detail_info.get('areas'),
                source_url=detail_url,
                crawled_at=datetime.now().isoformat()
            )
            
            return complex_detail
            
        except Exception as e:
            logger.error(f"❌ 단지 {complex_id} 상세 정보 크롤링 실패: {e}")
            await self._handle_error(str(e))
            return None
    
    async def _crawl_complex_listings(self, complex_id: str) -> List[PropertyListing]:
        """아파트 단지의 모든 매물 크롤링"""
        logger.info(f"🏠 단지 {complex_id} 매물 크롤링 중...")
        
        all_listings = []
        deal_types = ['매매', '전세', '월세']
        
        try:
            for deal_type in deal_types:
                logger.info(f"  📋 {deal_type} 매물 크롤링 중...")
                
                # 거래유형별 매물 페이지로 이동
                listing_url = f"{self.base_url}/complexes/{complex_id}"
                await self.page.goto(listing_url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)
                
                # 거래유형 탭 클릭 시도
                await self._click_deal_type_tab(deal_type)
                await asyncio.sleep(3)
                
                # 해당 거래유형의 매물 목록 추출
                listings = await self._extract_listings_from_page(complex_id, deal_type)
                all_listings.extend(listings)
                
                logger.info(f"    ✅ {deal_type}: {len(listings)}개 매물 발견")
                
                # 거래유형간 딜레이
                await asyncio.sleep(random.uniform(1, 2))
            
            logger.info(f"📊 단지 {complex_id} 총 매물: {len(all_listings)}개")
            return all_listings
            
        except Exception as e:
            logger.error(f"❌ 단지 {complex_id} 매물 크롤링 실패: {e}")
            await self._handle_error(str(e))
            return all_listings
    
    async def _click_deal_type_tab(self, deal_type: str):
        """거래유형 탭 클릭"""
        try:
            # 다양한 방법으로 거래유형 탭 클릭 시도
            tab_selectors = [
                f'text="{deal_type}"',
                f'[data-deal-type="{deal_type}"]',
                f'.tab:has-text("{deal_type}")',
                f'button:has-text("{deal_type}")',
                f'a:has-text("{deal_type}")'
            ]
            
            for selector in tab_selectors:
                try:
                    element = await self.page.query_selector(selector)
                    if element:
                        await element.click()
                        logger.info(f"  🖱️ {deal_type} 탭 클릭 성공")
                        return
                except:
                    continue
            
            logger.warning(f"  ⚠️ {deal_type} 탭을 찾을 수 없습니다")
            
        except Exception as e:
            logger.warning(f"  ⚠️ {deal_type} 탭 클릭 실패: {e}")
    
    async def _extract_listings_from_page(self, complex_id: str, deal_type: str) -> List[PropertyListing]:
        """페이지에서 매물 정보 추출"""
        try:
            listings_data = await self.page.evaluate(f"""
                () => {{
                    const listings = [];
                    
                    // 매물 목록 셀렉터들
                    const listingSelectors = [
                        '.item_link',
                        '.article_item',
                        '.property_item',
                        '[class*="item"]',
                        '[class*="article"]',
                        '[class*="property"]',
                        '.list_item'
                    ];
                    
                    for (const selector of listingSelectors) {{
                        const elements = document.querySelectorAll(selector);
                        
                        elements.forEach((el, index) => {{
                            const text = el.textContent.trim();
                            
                            // 부동산 관련 키워드 필터링
                            if (text && (
                                text.includes('억') || 
                                text.includes('만원') ||
                                text.includes('전세') ||
                                text.includes('월세') ||
                                text.includes('매매') ||
                                text.includes('㎡') ||
                                text.includes('평') ||
                                text.includes('층')
                            ) && text.length > 20) {{
                                
                                // 상세 정보 추출
                                const priceMatch = text.match(/(\\d+)억\\s*(\\d+)?/);
                                const monthlyMatch = text.match(/월세\\s*(\\d+)/);
                                const depositMatch = text.match(/보증금\\s*(\\d+)억?\\s*(\\d+)?/);
                                const areaMatch = text.match(/(\\d+\\.?\\d*)㎡/);
                                const pyeongMatch = text.match(/(\\d+\\.?\\d*)평/);
                                const floorMatch = text.match(/(\\d+)층/);
                                const roomMatch = text.match(/(\\d+)방/);
                                
                                const listing = {{
                                    listing_id: `{complex_id}_${{index}}_${{Date.now()}}`,
                                    text: text.substring(0, 500),
                                    price: priceMatch ? priceMatch[0] : null,
                                    monthly_rent: monthlyMatch ? monthlyMatch[0] : null,
                                    deposit: depositMatch ? depositMatch[0] : null,
                                    area_m2: areaMatch ? parseFloat(areaMatch[1]) : null,
                                    area_pyeong: pyeongMatch ? parseFloat(pyeongMatch[1]) : null,
                                    floor: floorMatch ? parseInt(floorMatch[1]) : null,
                                    room_count: roomMatch ? roomMatch[0] : null,
                                    href: el.href || el.querySelector('a')?.href
                                }};
                                
                                listings.push(listing);
                            }}
                        }});
                        
                        if (listings.length > 0) break; // 매물을 찾으면 중단
                    }}
                    
                    return listings.slice(0, 50); // 최대 50개
                }}
            """)
            
            # PropertyListing 객체들로 변환
            listings = []
            for data in listings_data:
                listing = PropertyListing(
                    listing_id=data['listing_id'],
                    complex_id=complex_id,
                    complex_name='',  # 나중에 조인으로 채움
                    deal_type=deal_type,
                    price=data.get('price'),
                    monthly_rent=data.get('monthly_rent'),
                    deposit=data.get('deposit'),
                    area_m2=data.get('area_m2'),
                    area_pyeong=data.get('area_pyeong'),
                    floor=data.get('floor'),
                    room_count=data.get('room_count'),
                    listing_url=data.get('href', ''),
                    crawled_at=datetime.now().isoformat()
                )
                listings.append(listing)
            
            return listings
            
        except Exception as e:
            logger.error(f"❌ 매물 정보 추출 실패: {e}")
            return []
    
    async def _save_complex(self, complex: ApartmentComplex):
        """아파트 단지 정보 저장"""
        try:
            self.db_manager.safe_execute("""
                INSERT OR REPLACE INTO apartment_complexes 
                (complex_id, complex_name, address, region_code, region_name, 
                 latitude, longitude, total_households, completion_year, building_count,
                 min_floor, max_floor, parking_total, heating_type, areas, source_url, crawled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                complex.complex_id, complex.complex_name, complex.address,
                complex.region_code, complex.region_name, complex.latitude, complex.longitude,
                complex.total_households, complex.completion_year, complex.building_count,
                complex.min_floor, complex.max_floor, complex.parking_total,
                complex.heating_type, json.dumps(complex.areas) if complex.areas else None,
                complex.source_url, complex.crawled_at
            ))
            
            self.stats['complexes_found'] += 1
            
        except Exception as e:
            logger.error(f"❌ 단지 정보 저장 실패: {e}")
    
    async def _save_listing(self, listing: PropertyListing):
        """매물 정보 저장"""
        try:
            self.db_manager.safe_execute("""
                INSERT OR REPLACE INTO property_listings 
                (listing_id, complex_id, complex_name, deal_type, price, monthly_rent, deposit,
                 area_m2, area_pyeong, floor, direction, room_count, bathroom_count,
                 built_year, move_in_date, maintenance_cost, description, agent_name, agent_phone,
                 listing_url, crawled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                listing.listing_id, listing.complex_id, listing.complex_name, listing.deal_type,
                listing.price, listing.monthly_rent, listing.deposit, listing.area_m2, listing.area_pyeong,
                listing.floor, listing.direction, listing.room_count, listing.bathroom_count,
                listing.built_year, listing.move_in_date, listing.maintenance_cost, listing.description,
                listing.agent_name, listing.agent_phone, listing.listing_url, listing.crawled_at
            ))
            
            self.stats['listings_collected'] += 1
            
        except Exception as e:
            logger.error(f"❌ 매물 정보 저장 실패: {e}")
    
    async def _record_region_progress(self, region_code: str, region_name: str, status: str, 
                                    complexes_found: int = 0, listings_found: int = 0, error_message: str = None):
        """지역별 진행 상황 기록"""
        try:
            completed_at = datetime.now().isoformat() if status in ['완료', '실패', '오류'] else None
            
            self.db_manager.safe_execute("""
                INSERT OR REPLACE INTO crawling_progress 
                (region_code, region_name, status, complexes_found, listings_found, 
                 started_at, completed_at, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                region_code, region_name, status, complexes_found, listings_found,
                datetime.now().isoformat(), completed_at, error_message
            ))
            
        except Exception as e:
            logger.error(f"❌ 진행 상황 기록 실패: {e}")
    
    async def _handle_error(self, error_message: str):
        """에러 처리 및 VPN 전환"""
        self.stats['errors'] += 1
        
        # 차단 관련 키워드 체크
        blocking_keywords = ['차단', 'blocked', 'rate limit', 'captcha', '접근이 제한']
        is_blocked = any(keyword in error_message.lower() for keyword in blocking_keywords)
        
        if is_blocked or self.stats['errors'] >= self.vpn_switch_threshold:
            logger.warning("🚨 IP 차단 감지 또는 에러 임계치 도달, VPN 전환 시도")
            
            success, ip, vpn_type = await self.vpn_manager.handle_blocking_detected(error_message)
            if success:
                logger.info(f"✅ VPN 전환 성공: {vpn_type} - IP: {ip}")
                self.stats['vpn_switches'] += 1
                self.stats['errors'] = 0  # 에러 카운터 리셋
            else:
                logger.error("❌ VPN 전환 실패")
            
            # VPN 전환 후 대기
            await asyncio.sleep(self.error_delay)
        else:
            # 일반 에러 딜레이
            await asyncio.sleep(random.uniform(2, 5))
    
    async def _intelligent_delay(self):
        """지능형 딜레이 (서버 부하 방지)"""
        # 기본 딜레이
        base_delay = random.uniform(self.delay_min, self.delay_max)
        
        # 에러율에 따른 추가 딜레이
        error_rate = self.stats['errors'] / max(1, self.stats['regions_processed'])
        if error_rate > 0.1:  # 에러율 10% 초과시
            base_delay *= 1.5
        
        await asyncio.sleep(base_delay)
    
    async def _print_final_statistics(self):
        """최종 통계 출력"""
        end_time = datetime.now()
        duration = end_time - self.start_time
        
        logger.info("\n" + "="*80)
        logger.info("🎉 전국 아파트 단지 종합 크롤링 완료!")
        logger.info("="*80)
        logger.info(f"📊 최종 통계:")
        logger.info(f"  🏙️ 처리된 지역: {self.progress.completed_regions}/{self.progress.total_regions}")
        logger.info(f"  🏢 수집된 단지: {self.stats['complexes_found']:,}개")
        logger.info(f"  🏠 수집된 매물: {self.stats['listings_collected']:,}개")
        logger.info(f"  ⏱️ 소요 시간: {duration}")
        logger.info(f"  🔄 VPN 전환: {self.stats['vpn_switches']}회")
        logger.info(f"  ❌ 총 에러: {self.stats['errors']}회")
        
        # 평균 처리 속도
        if duration.total_seconds() > 0:
            complexes_per_hour = self.stats['complexes_found'] / (duration.total_seconds() / 3600)
            listings_per_hour = self.stats['listings_collected'] / (duration.total_seconds() / 3600)
            logger.info(f"  📈 평균 속도: 단지 {complexes_per_hour:.1f}개/시간, 매물 {listings_per_hour:.1f}개/시간")
        
        logger.info("="*80)
    
    async def _cleanup(self):
        """정리 작업"""
        logger.info("🧹 크롤러 정리 중...")
        
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        
        logger.info("✅ 정리 완료")

async def main():
    """메인 실행 함수"""
    logger.info("🚀 전국 아파트 단지 종합 크롤러 시작!")
    
    crawler = ComprehensiveNationwideCrawler()
    
    try:
        await crawler.init_crawler()
        await crawler.start_comprehensive_crawling()
        
    except KeyboardInterrupt:
        logger.info("⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"❌ 치명적 오류: {e}")
        traceback.print_exc()
    finally:
        await crawler._cleanup()

if __name__ == "__main__":
    asyncio.run(main())