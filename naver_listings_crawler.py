#!/usr/bin/env python3
"""
네이버부동산 매물호가 전용 크롤러
- 현재 시장에 나온 매물들의 호가 정보 수집
- 매매/전세/월세 구분하여 수집
- 실거래가와 분리된 별도 데이터베이스
"""

import asyncio
import aiohttp
import sqlite3
import json
import time
import random
import logging
from datetime import datetime
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import re

# Playwright 사용
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('naver_listings_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class PropertyListing:
    """매물 호가 정보"""
    listing_id: str
    complex_id: str
    complex_name: str
    deal_type: str  # 매매, 전세, 월세
    price: str
    monthly_rent: Optional[str] = None
    deposit: Optional[str] = None
    area_m2: Optional[float] = None
    area_pyeong: Optional[float] = None
    floor: Optional[int] = None
    total_floor: Optional[int] = None
    direction: Optional[str] = None
    room_type: Optional[str] = None
    maintenance_cost: Optional[str] = None
    move_in_date: Optional[str] = None
    heating_type: Optional[str] = None
    parking: Optional[str] = None
    elevator: Optional[str] = None
    agent_name: Optional[str] = None
    agent_phone: Optional[str] = None
    region: str = ""
    district: str = ""
    address: str = ""
    listing_url: str = ""
    image_urls: List[str] = None
    description: str = ""
    created_date: Optional[str] = None
    updated_date: Optional[str] = None
    view_count: Optional[int] = None
    crawled_at: str = ""

class NaverListingsCrawler:
    """네이버부동산 매물호가 전용 크롤러"""
    
    def __init__(self):
        self.db_path = "naver_property_listings.db"
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        
        self.init_database()
        
        # 주요 도시/지역 URL 매핑
        self.target_regions = {
            # 서울 주요 구
            '강남구': 'https://new.land.naver.com/complexes?ms=37.5172,127.0473,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11680',
            '서초구': 'https://new.land.naver.com/complexes?ms=37.4837,127.0324,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11650',
            '송파구': 'https://new.land.naver.com/complexes?ms=37.5145,127.1066,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11710',
            '강서구': 'https://new.land.naver.com/complexes?ms=37.5509,126.8495,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11500',
            '마포구': 'https://new.land.naver.com/complexes?ms=37.5615,126.9087,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11440',
            
            # 경기도 주요 지역
            '수원시': 'https://new.land.naver.com/complexes?ms=37.2636,127.0286,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=41110',
            '성남시': 'https://new.land.naver.com/complexes?ms=37.4201,127.1262,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=41130',
            '고양시': 'https://new.land.naver.com/complexes?ms=37.6583,126.8320,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=41280',
            '용인시': 'https://new.land.naver.com/complexes?ms=37.2342,127.2017,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=41460',
            
            # 부산 주요 구
            '해운대구': 'https://new.land.naver.com/complexes?ms=35.1796,129.1756,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=26350',
            '부산진구': 'https://new.land.naver.com/complexes?ms=35.1641,129.0534,15&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=26230',
        }
        
        self.stats = {
            'regions_processed': 0,
            'complexes_found': 0,
            'listings_collected': 0,
            'start_time': datetime.now()
        }
    
    def init_database(self):
        """데이터베이스 초기화"""
        logger.info("매물호가 데이터베이스 초기화 중...")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 매물 호가 테이블
        cursor.execute("""
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
                total_floor INTEGER,
                direction TEXT,
                room_type TEXT,
                maintenance_cost TEXT,
                move_in_date TEXT,
                heating_type TEXT,
                parking TEXT,
                elevator TEXT,
                agent_name TEXT,
                agent_phone TEXT,
                region TEXT,
                district TEXT,
                address TEXT,
                listing_url TEXT,
                image_urls TEXT,
                description TEXT,
                created_date TEXT,
                updated_date TEXT,
                view_count INTEGER,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 아파트 단지 기본 정보 (매물호가용)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS apartment_complexes_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT,
                address TEXT,
                region TEXT,
                district TEXT,
                total_households INTEGER,
                parking_spaces INTEGER,
                construction_company TEXT,
                completion_date TEXT,
                heating_type TEXT,
                current_listings_count INTEGER DEFAULT 0,
                avg_price_sale REAL,
                avg_price_jeonse REAL,
                avg_price_monthly REAL,
                min_area REAL,
                max_area REAL,
                complex_url TEXT,
                last_updated TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 크롤링 로그 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS crawling_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region TEXT,
                action TEXT,
                status TEXT,
                items_found INTEGER DEFAULT 0,
                error_message TEXT,
                start_time TEXT,
                end_time TEXT,
                duration_seconds INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 인덱스 생성
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_listing_complex ON property_listings(complex_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_listing_deal_type ON property_listings(deal_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_listing_region ON property_listings(region)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_complex_region ON apartment_complexes_listings(region)")
        
        conn.commit()
        conn.close()
        logger.info("매물호가 데이터베이스 초기화 완료")
    
    async def init_playwright(self):
        """Playwright 브라우저 초기화"""
        logger.info("Playwright 브라우저 초기화 중...")
        
        self.playwright = await async_playwright().start()
        
        # 안티 디텍션 브라우저 설정
        self.browser = await self.playwright.chromium.launch(
            headless=True,
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
                '--disable-extensions'
            ]
        )
        
        # 브라우저 컨텍스트 생성
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        
        # 페이지 생성
        self.page = await self.context.new_page()
        
        # 안티 디텍션 스크립트
        await self.page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            delete window.console.debug;
            delete window.console.clear;
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en'],
            });
        """)
        
        logger.info("Playwright 브라우저 초기화 완료")
    
    async def extract_complex_ids_from_region(self, region_url: str, region_name: str) -> List[str]:
        """지역 페이지에서 아파트 단지 ID 목록 추출"""
        logger.info(f"{region_name} 지역의 아파트 단지 목록 추출 중...")
        
        try:
            await self.page.goto(region_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(5)
            
            # 페이지에서 아파트 단지 링크 추출
            complex_ids = await self.page.evaluate("""
                () => {
                    const complexIds = new Set();
                    
                    // 다양한 방법으로 단지 링크 찾기
                    const linkSelectors = [
                        'a[href*="/complexes/"]',
                        '[data-complex-no]',
                        '.complex_link',
                        '.item_link'
                    ];
                    
                    for (const selector of linkSelectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            // href에서 단지 ID 추출
                            const href = el.href || el.getAttribute('href');
                            if (href) {
                                const match = href.match(/\/complexes\/(\d+)/);
                                if (match) {
                                    complexIds.add(match[1]);
                                }
                            }
                            
                            // data-complex-no에서 단지 ID 추출
                            const complexNo = el.getAttribute('data-complex-no');
                            if (complexNo && /^\d+$/.test(complexNo)) {
                                complexIds.add(complexNo);
                            }
                        });
                    }
                    
                    // JavaScript 변수에서 단지 정보 추출 시도
                    const scripts = document.querySelectorAll('script');
                    scripts.forEach(script => {
                        if (script.textContent) {
                            const complexMatches = script.textContent.match(/complexNo[\"']?\s*:\s*[\"']?(\d+)[\"']?/g);
                            if (complexMatches) {
                                complexMatches.forEach(match => {
                                    const idMatch = match.match(/(\d+)/);
                                    if (idMatch) {
                                        complexIds.add(idMatch[1]);
                                    }
                                });
                            }
                        }
                    });
                    
                    return Array.from(complexIds);
                }
            """)
            
            logger.info(f"{region_name}: {len(complex_ids)}개 아파트 단지 발견")
            return complex_ids
            
        except Exception as e:
            logger.error(f"{region_name} 단지 목록 추출 오류: {e}")
            return []
    
    async def crawl_complex_listings(self, complex_id: str) -> Dict[str, Any]:
        """개별 아파트 단지의 매물 정보 크롤링"""
        logger.info(f"단지 {complex_id} 매물 정보 크롤링 중...")
        
        result = {
            'complex_info': None,
            'listings': [],
            'error': None
        }
        
        try:
            # 단지 상세 페이지로 이동
            complex_url = f"https://new.land.naver.com/complexes/{complex_id}"
            await self.page.goto(complex_url, wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            
            # 단지 기본 정보 추출
            complex_info = await self.page.evaluate("""
                () => {
                    const info = {
                        complex_id: window.location.pathname.match(/\/complexes\/(\d+)/)?.[1] || '',
                        complex_name: '',
                        address: '',
                        total_households: null,
                        completion_date: '',
                        heating_type: ''
                    };
                    
                    // 단지명 추출
                    const nameSelectors = [
                        'h1.complex_title',
                        '.complex_name',
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
                    
                    // 주소 추출
                    const addressSelectors = [
                        '.complex_address',
                        '.address',
                        '[class*="address"]'
                    ];
                    
                    for (const selector of addressSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.textContent.trim()) {
                            info.address = el.textContent.trim();
                            break;
                        }
                    }
                    
                    // 전체 텍스트에서 추가 정보 추출
                    const fullText = document.body.textContent;
                    
                    // 세대수
                    const householdMatch = fullText.match(/(\d+)\s*세대/);
                    if (householdMatch) {
                        info.total_households = parseInt(householdMatch[1]);
                    }
                    
                    // 준공년도
                    const yearMatch = fullText.match(/(19|20)\d{2}년?\s*준?공?/);
                    if (yearMatch) {
                        info.completion_date = yearMatch[0];
                    }
                    
                    // 난방방식
                    const heatingMatch = fullText.match(/(개별난방|중앙난방|지역난방|도시가스)/);
                    if (heatingMatch) {
                        info.heating_type = heatingMatch[0];
                    }
                    
                    return info;
                }
            """)
            
            result['complex_info'] = complex_info
            
            # 매물 정보 추출 (거래유형별)
            deal_types = [
                {'type': '매매', 'selector': 'text="매매"'},
                {'type': '전세', 'selector': 'text="전세"'},
                {'type': '월세', 'selector': 'text="월세"'}
            ]
            
            for deal_type_info in deal_types:
                deal_type = deal_type_info['type']
                logger.info(f"  {deal_type} 매물 수집 중...")
                
                try:
                    # 거래유형 탭 클릭 시도
                    await self.page.click(deal_type_info['selector'], timeout=5000)
                    await asyncio.sleep(2)
                except:
                    logger.warning(f"  {deal_type} 탭 클릭 실패, 기본 페이지에서 추출")
                
                # 매물 목록 추출
                listings = await self.page.evaluate(f"""
                    (dealType) => {{
                        const listings = [];
                        
                        // 매물 관련 셀렉터들
                        const listingSelectors = [
                            '.item_link',
                            '.article_item', 
                            '.property_item',
                            '[class*="item"]',
                            '[class*="article"]',
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
                                    const priceMatch = text.match(/(\d+)억\s*(\d+)?/);
                                    const monthlyMatch = text.match(/월세\s*(\d+)/);
                                    const depositMatch = text.match(/보증금\s*(\d+)억?\s*(\d+)?/);
                                    const areaMatch = text.match(/(\d+\.?\d*)㎡/);
                                    const pyeongMatch = text.match(/(\d+\.?\d*)평/);
                                    const floorMatch = text.match(/(\d+)층/);
                                    const roomMatch = text.match(/(\d+)방/);
                                    
                                    // 링크 URL 추출
                                    const linkEl = el.querySelector('a') || el;
                                    const href = linkEl.href || '';
                                    
                                    const listing = {{
                                        listing_id: `{complex_id}_${{dealType}}_${{index}}_${{Date.now()}}`,
                                        deal_type: dealType,
                                        price: priceMatch ? priceMatch[0] : '',
                                        monthly_rent: monthlyMatch ? monthlyMatch[0] : '',
                                        deposit: depositMatch ? depositMatch[0] : '',
                                        area_m2: areaMatch ? parseFloat(areaMatch[1]) : null,
                                        area_pyeong: pyeongMatch ? parseFloat(pyeongMatch[1]) : null,
                                        floor: floorMatch ? parseInt(floorMatch[1]) : null,
                                        room_type: roomMatch ? roomMatch[0] : '',
                                        listing_url: href,
                                        raw_text: text.substring(0, 300),
                                        direction: '',
                                        maintenance_cost: '',
                                        agent_name: '',
                                        agent_phone: ''
                                    }};
                                    
                                    // 방향 정보 추출
                                    const directionMatch = text.match(/(남향|북향|동향|서향|남동향|남서향|북동향|북서향)/);
                                    if (directionMatch) {{
                                        listing.direction = directionMatch[0];
                                    }}
                                    
                                    // 관리비 추출
                                    const maintenanceMatch = text.match(/관리비\s*(\d+)만?원?/);
                                    if (maintenanceMatch) {{
                                        listing.maintenance_cost = maintenanceMatch[0];
                                    }}
                                    
                                    listings.push(listing);
                                }}
                            }});
                            
                            if (listings.length > 0) break; // 매물을 찾으면 중단
                        }}
                        
                        return listings.slice(0, 30); // 최대 30개
                    }}
                """, deal_type)
                
                # 결과에 추가
                for listing in listings:
                    listing['complex_id'] = complex_id
                    listing['complex_name'] = complex_info.get('complex_name', '')
                    listing['address'] = complex_info.get('address', '')
                    listing['crawled_at'] = datetime.now().isoformat()
                
                result['listings'].extend(listings)
                logger.info(f"    {deal_type}: {len(listings)}개 매물 발견")
                
                await asyncio.sleep(1)
            
            logger.info(f"단지 {complex_id} 총 매물: {len(result['listings'])}개")
            return result
            
        except Exception as e:
            error_msg = f"단지 {complex_id} 크롤링 오류: {e}"
            logger.error(error_msg)
            result['error'] = error_msg
            return result
    
    def save_complex_info(self, complex_info: Dict[str, Any], region: str):
        """아파트 단지 정보 저장"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT OR REPLACE INTO apartment_complexes_listings 
                (complex_id, complex_name, address, region, total_households, 
                 completion_date, heating_type, complex_url, last_updated, crawled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                complex_info.get('complex_id', ''),
                complex_info.get('complex_name', ''),
                complex_info.get('address', ''),
                region,
                complex_info.get('total_households'),
                complex_info.get('completion_date', ''),
                complex_info.get('heating_type', ''),
                f"https://new.land.naver.com/complexes/{complex_info.get('complex_id', '')}",
                datetime.now().isoformat(),
                datetime.now().isoformat()
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"단지 정보 저장 오류: {e}")
    
    def save_listings(self, listings: List[Dict[str, Any]], region: str):
        """매물 정보 저장"""
        if not listings:
            return
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for listing in listings:
                cursor.execute("""
                    INSERT OR REPLACE INTO property_listings 
                    (listing_id, complex_id, complex_name, deal_type, price, monthly_rent, deposit,
                     area_m2, area_pyeong, floor, direction, room_type, maintenance_cost,
                     agent_name, agent_phone, region, address, listing_url, crawled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    listing.get('listing_id', ''),
                    listing.get('complex_id', ''),
                    listing.get('complex_name', ''),
                    listing.get('deal_type', ''),
                    listing.get('price', ''),
                    listing.get('monthly_rent', ''),
                    listing.get('deposit', ''),
                    listing.get('area_m2'),
                    listing.get('area_pyeong'),
                    listing.get('floor'),
                    listing.get('direction', ''),
                    listing.get('room_type', ''),
                    listing.get('maintenance_cost', ''),
                    listing.get('agent_name', ''),
                    listing.get('agent_phone', ''),
                    region,
                    listing.get('address', ''),
                    listing.get('listing_url', ''),
                    listing.get('crawled_at', '')
                ))
            
            conn.commit()
            conn.close()
            
            self.stats['listings_collected'] += len(listings)
            logger.info(f"{len(listings)}개 매물 저장 완료")
            
        except Exception as e:
            logger.error(f"매물 저장 오류: {e}")
    
    def log_crawling_activity(self, region: str, action: str, status: str, 
                             items_found: int = 0, error_msg: str = None, duration: int = 0):
        """크롤링 활동 로그"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO crawling_logs 
                (region, action, status, items_found, error_message, 
                 start_time, end_time, duration_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                region, action, status, items_found, error_msg,
                datetime.now().isoformat(), datetime.now().isoformat(), duration
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"로그 저장 오류: {e}")
    
    async def crawl_region(self, region_name: str, region_url: str):
        """지역별 매물호가 크롤링"""
        logger.info(f"\n=== {region_name} 매물호가 크롤링 시작 ===")
        start_time = datetime.now()
        
        try:
            # 1단계: 아파트 단지 목록 추출
            complex_ids = await self.extract_complex_ids_from_region(region_url, region_name)
            
            if not complex_ids:
                logger.warning(f"{region_name}: 아파트 단지를 찾을 수 없습니다")
                self.log_crawling_activity(region_name, "단지목록추출", "실패", 0, "단지를 찾을 수 없음")
                return
            
            logger.info(f"{region_name}: {len(complex_ids)}개 단지에서 매물 수집 시작")
            
            # 2단계: 각 단지별 매물 정보 수집
            region_listings = 0
            
            for i, complex_id in enumerate(complex_ids, 1):
                try:
                    logger.info(f"  [{i}/{len(complex_ids)}] 단지 {complex_id} 처리 중...")
                    
                    # 단지 매물 크롤링
                    result = await self.crawl_complex_listings(complex_id)
                    
                    if result['complex_info']:
                        # 단지 정보 저장
                        self.save_complex_info(result['complex_info'], region_name)
                        self.stats['complexes_found'] += 1
                    
                    if result['listings']:
                        # 매물 정보 저장
                        self.save_listings(result['listings'], region_name)
                        region_listings += len(result['listings'])
                    
                    if result['error']:
                        logger.warning(f"    오류: {result['error']}")
                    
                    # 단지별 딜레이 (서버 부하 방지)
                    await asyncio.sleep(random.uniform(3, 6))
                    
                except Exception as e:
                    logger.error(f"    단지 {complex_id} 처리 오류: {e}")
                    continue
            
            # 완료 로그
            duration = (datetime.now() - start_time).total_seconds()
            self.log_crawling_activity(region_name, "전체크롤링", "완료", region_listings, None, int(duration))
            
            logger.info(f"=== {region_name} 완료: 단지 {len(complex_ids)}개, 매물 {region_listings}개 ===")
            self.stats['regions_processed'] += 1
            
        except Exception as e:
            logger.error(f"{region_name} 크롤링 오류: {e}")
            duration = (datetime.now() - start_time).total_seconds()
            self.log_crawling_activity(region_name, "전체크롤링", "오류", 0, str(e), int(duration))
    
    async def start_listings_crawling(self):
        """매물호가 크롤링 시작"""
        logger.info("🏠 네이버부동산 매물호가 크롤링 시작!")
        logger.info(f"📊 대상 지역: {len(self.target_regions)}개")
        
        try:
            await self.init_playwright()
            
            for region_name, region_url in self.target_regions.items():
                await self.crawl_region(region_name, region_url)
                
                # 지역간 딜레이
                await asyncio.sleep(random.uniform(10, 20))
            
            # 최종 결과
            self.print_final_results()
            
        except Exception as e:
            logger.error(f"크롤링 중 오류: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            await self.cleanup()
    
    def print_final_results(self):
        """최종 결과 출력"""
        duration = datetime.now() - self.stats['start_time']
        
        logger.info("\n" + "="*60)
        logger.info("🎉 네이버부동산 매물호가 크롤링 완료!")
        logger.info("="*60)
        logger.info(f"📊 최종 통계:")
        logger.info(f"  🏙️ 처리된 지역: {self.stats['regions_processed']}개")
        logger.info(f"  🏢 발견된 단지: {self.stats['complexes_found']}개")
        logger.info(f"  🏠 수집된 매물: {self.stats['listings_collected']}개")
        logger.info(f"  ⏱️ 소요 시간: {duration}")
        
        if duration.total_seconds() > 0:
            listings_per_hour = self.stats['listings_collected'] / (duration.total_seconds() / 3600)
            logger.info(f"  📈 시간당 평균: {listings_per_hour:.0f}개 매물/시간")
        
        logger.info("="*60)
    
    async def cleanup(self):
        """정리 작업"""
        logger.info("정리 작업 중...")
        
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        
        logger.info("정리 완료")

async def main():
    """메인 실행 함수"""
    print("네이버부동산 매물호가 전용 크롤러 v1.0")
    print("="*40)
    print("- 현재 시장에 나온 매물들의 호가 정보 수집")
    print("- 매매/전세/월세 구분하여 수집")
    print("- 실거래가와 분리된 별도 데이터베이스")
    print("="*40)
    
    crawler = NaverListingsCrawler()
    
    try:
        await crawler.start_listings_crawling()
    except KeyboardInterrupt:
        logger.info("⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"❌ 크롤링 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())