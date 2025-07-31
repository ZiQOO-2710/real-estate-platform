"""
네이버 부동산 강화 크롤러 (2025 개인용)
스텔스 모드 + 우회 기술 적용

개인적 연구 목적으로 사용
"""

import asyncio
import json
import csv
import random
import time
from datetime import datetime
from pathlib import Path
from playwright.async_api import async_playwright
import re
from fake_useragent import UserAgent
import requests
from .duplicate_detector import DuplicateDetector, remove_duplicates_from_listings
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from database.simple_data_processor import process_json_file

class EnhancedNaverCrawler:
    """네이버 부동산 강화 크롤러 - 개인용"""
    
    def __init__(self, headless=True, stealth_mode=True):
        self.browser = None
        self.page = None
        self.context = None
        self.headless = headless
        self.stealth_mode = stealth_mode
        self.ua = UserAgent()
        
        # 스텔스 설정
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        ]
        
    async def init_stealth_browser(self):
        """스텔스 모드 브라우저 초기화"""
        print("🥷 스텔스 모드 브라우저 시작...")
        
        playwright = await async_playwright().start()
        
        # 랜덤 User-Agent 선택
        current_ua = random.choice(self.user_agents)
        
        # 고급 스텔스 설정
        self.browser = await playwright.chromium.launch(
            headless=self.headless,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-web-security',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-hang-monitor',
                '--no-first-run',
                '--no-default-browser-check',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--hide-scrollbars',
                '--mute-audio',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-features=BlinkGenPropertyTrees',
                '--disable-accelerated-2d-canvas',
                '--disable-accelerated-jpeg-decoding',
                '--disable-accelerated-mjpeg-decode',
                '--disable-accelerated-video-decode',
                '--disable-app-list-dismiss-on-blur',
                '--disable-accelerated-video-encode'
            ]
        )
        
        # 스텔스 컨텍스트 생성
        self.context = await self.browser.new_context(
            viewport={'width': 1366, 'height': 768},
            user_agent=current_ua,
            locale='ko-KR',
            timezone_id='Asia/Seoul',
            color_scheme='light',
            extra_http_headers={
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Cache-Control': 'max-age=0'
            }
        )
        
        self.page = await self.context.new_page()
        
        # 진보된 스텔스 스크립트
        await self.page.add_init_script("""
            // webdriver 제거
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // 브라우저 플러그인 시뮬레이션
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // 언어 설정
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en'],
            });
            
            // 플랫폼 정보
            Object.defineProperty(navigator, 'platform', {
                get: () => 'Win32',
            });
            
            // 화면 정보
            Object.defineProperty(screen, 'width', {
                get: () => 1366,
            });
            Object.defineProperty(screen, 'height', {
                get: () => 768,
            });
            
            // 콘솔 함수 제거
            delete window.console.debug;
            delete window.console.clear;
            
            // Automation 탐지 우회
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Permission API 제거
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // WebGL 벤더 제거
            const getParameter = WebGLRenderingContext.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return 'Intel Inc.';
                }
                if (parameter === 37446) {
                    return 'Intel Iris OpenGL Engine';
                }
                return getParameter(parameter);
            };
        """)
        
        print(f"✅ 스텔스 브라우저 초기화 완료 (UA: {current_ua[:50]}...)")
        
    async def human_like_delay(self, min_seconds=2, max_seconds=5):
        """인간적 대기 시간"""
        delay = random.uniform(min_seconds, max_seconds)
        print(f"⏳ 인간적 대기: {delay:.1f}초")
        await asyncio.sleep(delay)
        
    async def simulate_human_behavior(self):
        """인간 행동 시뮬레이션"""
        # 랜덤 마우스 이동
        await self.page.mouse.move(
            random.randint(100, 800), 
            random.randint(100, 600)
        )
        await asyncio.sleep(random.uniform(0.5, 1.5))
        
        # 랜덤 스크롤
        await self.page.evaluate("""
            window.scrollTo({
                top: Math.random() * 500,
                behavior: 'smooth'
            });
        """)
        await asyncio.sleep(random.uniform(1, 2))
        
    async def safe_navigate(self, url, retries=3):
        """안전한 페이지 네비게이션"""
        for attempt in range(retries):
            try:
                print(f"🌍 페이지 이동 시도 {attempt + 1}/{retries}: {url}")
                
                # 네비게이션 전 대기
                if attempt > 0:
                    await self.human_like_delay(3, 7)
                
                # 페이지 로드
                response = await self.page.goto(
                    url, 
                    wait_until="networkidle", 
                    timeout=30000
                )
                
                if response and response.status == 200:
                    print(f"✅ 페이지 로드 성공 (HTTP {response.status})")
                    
                    # 인간 행동 시뮬레이션
                    await self.simulate_human_behavior()
                    
                    # 추가 대기
                    await self.human_like_delay(2, 4)
                    
                    return True
                else:
                    print(f"⚠️ HTTP 오류: {response.status if response else 'No response'}")
                    
            except Exception as e:
                print(f"❌ 네비게이션 오류 {attempt + 1}: {e}")
                if attempt < retries - 1:
                    await self.human_like_delay(5, 10)
                    
        return False
        
    async def extract_with_multiple_strategies(self, strategies):
        """다중 전략으로 데이터 추출"""
        results = []
        
        for i, strategy in enumerate(strategies):
            try:
                print(f"🔍 전략 {i+1} 시도: {strategy['name']}")
                
                # 전략 실행
                data = await self.page.evaluate(strategy['script'])
                
                if data and len(data) > 0:
                    print(f"✅ 전략 {i+1} 성공: {len(data)}개 데이터 추출")
                    results.extend(data)
                else:
                    print(f"⚠️ 전략 {i+1} 데이터 없음")
                    
                # 전략 간 대기
                await asyncio.sleep(random.uniform(1, 3))
                
            except Exception as e:
                print(f"❌ 전략 {i+1} 오류: {e}")
                
        # 중복 제거
        unique_results = []
        seen_texts = set()
        
        for item in results:
            item_text = str(item).lower().replace(' ', '')[:100]
            if item_text not in seen_texts:
                seen_texts.add(item_text)
                unique_results.append(item)
                
        print(f"📊 최종 결과: {len(unique_results)}개 (전체 {len(results)}개에서 중복 제거)")
        return unique_results
        
    async def extract_complex_info(self, url):
        """단지 기본 정보 추출 (강화버전)"""
        print(f"🏢 단지 정보 추출 시작...")
        
        # 다중 전략 정의
        strategies = [
            {
                'name': '기본 셀렉터',
                'script': """
                    () => {
                        const info = {};
                        
                        // 다양한 셀렉터로 단지명 찾기
                        const titleSelectors = [
                            'h1', '.complex_title', '.title', '.complex_name',
                            '[class*="title"]', '[class*="name"]', '.page-title'
                        ];
                        
                        for (const selector of titleSelectors) {
                            const element = document.querySelector(selector);
                            if (element && element.textContent.trim() && 
                                !element.textContent.includes('네이버') &&
                                !element.textContent.includes('@') &&
                                element.textContent.length < 100) {
                                info.complexName = element.textContent.trim();
                                break;
                            }
                        }
                        
                        // 주소 정보
                        const addressSelectors = [
                            '.address', '.complex_address', '[class*="address"]',
                            '[class*="location"]', '.location'
                        ];
                        
                        for (const selector of addressSelectors) {
                            const element = document.querySelector(selector);
                            if (element && element.textContent.trim() &&
                                element.textContent.includes('시') ||
                                element.textContent.includes('구') ||
                                element.textContent.includes('동')) {
                                info.address = element.textContent.trim();
                                break;
                            }
                        }
                        
                        // 페이지 전체 텍스트에서 정보 추출
                        const fullText = document.body.textContent;
                        
                        // 준공년도 패턴
                        const yearPatterns = [
                            /(19|20)\d{2}년\s*준?공?/,
                            /준공\s*(19|20)\d{2}/,
                            /(19|20)\d{2}\.​\d{1,2}/
                        ];
                        
                        for (const pattern of yearPatterns) {
                            const match = fullText.match(pattern);
                            if (match) {
                                info.completionYear = match[0];
                                break;
                            }
                        }
                        
                        // 세대수
                        const householdMatch = fullText.match(/(\d+)\s*세대/);
                        if (householdMatch) {
                            info.totalHouseholds = householdMatch[1];
                        }
                        
                        return [info];
                    }
                """
            },
            {
                'name': 'URL 기반 추출',
                'script': """
                    () => {
                        const info = {
                            url: window.location.href,
                            title: document.title,
                            timestamp: new Date().toISOString()
                        };
                        
                        // URL에서 단지 ID 추출
                        const urlMatch = window.location.href.match(/complexes\/(\d+)/);
                        if (urlMatch) {
                            info.complexId = urlMatch[1];
                        }
                        
                        return [info];
                    }
                """
            }
        ]
        
        results = await self.extract_with_multiple_strategies(strategies)
        
        # 결과 병합
        combined_info = {
            'complex_id': self.extract_complex_id_from_url(url),
            'source_url': url,
            'extracted_at': datetime.now().isoformat()
        }
        
        for result in results:
            if isinstance(result, dict):
                combined_info.update(result)
                
        return combined_info
        
    def extract_complex_id_from_url(self, url):
        """단지 ID 추출"""
        match = re.search(r'/complexes/(\d+)', url)
        return match.group(1) if match else f'unknown_{int(time.time())}'
        
    async def extract_listings(self):
        """매물 정보 추출 (강화버전)"""
        print("🏠 매물 정보 추출 시작...")
        
        strategies = [
            {
                'name': '매물 리스트 탐지',
                'script': """
                    () => {
                        const listings = [];
                        
                        // 다양한 매물 셀렉터
                        const listingSelectors = [
                            '.item_link', '.article_item', '.property_item',
                            '[class*="item"]', '[class*="article"]', 
                            '[class*="property"]', '.list_item', '.listing',
                            '[class*="listing"]', '[class*="deal"]'
                        ];
                        
                        for (const selector of listingSelectors) {
                            const elements = document.querySelectorAll(selector);
                            
                            elements.forEach((element, index) => {
                                const text = element.textContent.trim();
                                
                                if (text && text.length > 30 && (
                                    text.includes('억') || 
                                    text.includes('만원') ||
                                    text.includes('전세') ||
                                    text.includes('월세') ||
                                    text.includes('매매') ||
                                    text.includes('㎡') ||
                                    text.includes('층')
                                )) {
                                    const priceMatch = text.match(/(\d+)억\s*(\d+)?/);
                                    const areaMatch = text.match(/(\d+\.?\d*)㎡/);
                                    const floorMatch = text.match(/(\d+)층/);
                                    const typeMatch = text.match(/(매매|전세|월세)/);
                                    
                                    listings.push({
                                        index: index,
                                        selector: selector,
                                        text: text.substring(0, 300),
                                        price: priceMatch ? priceMatch[0] : null,
                                        area: areaMatch ? areaMatch[0] : null,
                                        floor: floorMatch ? floorMatch[0] : null,
                                        deal_type: typeMatch ? typeMatch[0] : null,
                                        extracted_at: new Date().toISOString()
                                    });
                                }
                            });
                            
                            if (listings.length >= 50) break;
                        }
                        
                        return listings;
                    }
                """
            },
            {
                'name': '테이블 데이터 추출',
                'script': """
                    () => {
                        const listings = [];
                        
                        // 테이블에서 데이터 추출
                        const tables = document.querySelectorAll('table, .table, [class*="table"]');
                        
                        tables.forEach((table, tableIndex) => {
                            const rows = table.querySelectorAll('tr');
                            
                            rows.forEach((row, rowIndex) => {
                                const text = row.textContent.trim();
                                
                                if (text && (
                                    text.includes('억') || 
                                    text.includes('만원') ||
                                    text.includes('㎡')
                                )) {
                                    listings.push({
                                        type: 'table_row',
                                        table_index: tableIndex,
                                        row_index: rowIndex,
                                        text: text.substring(0, 200),
                                        extracted_at: new Date().toISOString()
                                    });
                                }
                            });
                        });
                        
                        return listings;
                    }
                """
            }
        ]
        
        raw_listings = await self.extract_with_multiple_strategies(strategies)
        
        # 중복 제거 적용
        if raw_listings:
            print(f"🔄 중복 매물 제거 중... (원본: {len(raw_listings)}개)")
            unique_listings, duplicate_report = remove_duplicates_from_listings(raw_listings)
            print(duplicate_report)
            return unique_listings
        
        return raw_listings
        
    async def extract_transactions(self):
        """실거래가 정보 추출 (강화버전)"""
        print("💰 실거래가 정보 추출 시작...")
        
        # 실거래가 탭 찾기 및 클릭 시도
        await self.try_click_transaction_tab()
        
        strategies = [
            {
                'name': '실거래가 패턴 추출',
                'script': """
                    () => {
                        const transactions = [];
                        const text = document.body.textContent;
                        
                        // 다양한 실거래가 패턴
                        const patterns = [
                            // 날짜 + 가격 패턴
                            /\d{4}[\.\/]\d{1,2}[\.\/]\d{1,2}.*?(\d+)억\s*(\d+)?/g,
                            // 가격 + 면적 패턴  
                            /(\d+)억\s*(\d+)?.*?(\d+\.?\d*)㎡/g,
                            // 거래유형 + 가격
                            /(매매|전세).*?(\d+)억/g,
                            // 층수 + 가격
                            /(\d+)층.*?(\d+)억/g,
                            // 월별 거래 패턴
                            /(\d{4})\.(\d{1,2}).*?(\d+)억/g
                        ];
                        
                        patterns.forEach((pattern, patternIndex) => {
                            let match;
                            let count = 0;
                            while ((match = pattern.exec(text)) !== null && count < 30) {
                                transactions.push({
                                    pattern_type: patternIndex,
                                    match_text: match[0],
                                    context: text.substring(
                                        Math.max(0, match.index - 50), 
                                        Math.min(text.length, match.index + 150)
                                    ),
                                    extracted_at: new Date().toISOString()
                                });
                                count++;
                            }
                        });
                        
                        return transactions;
                    }
                """
            },
            {
                'name': '실거래가 테이블',
                'script': """
                    () => {
                        const transactions = [];
                        
                        // 실거래가 테이블 찾기
                        const tables = document.querySelectorAll('table, .table, [class*="table"]');
                        
                        tables.forEach((table, tableIndex) => {
                            const tableText = table.textContent;
                            
                            if ((tableText.includes('억') || tableText.includes('만원')) && 
                                tableText.length > 100) {
                                
                                const rows = table.querySelectorAll('tr');
                                rows.forEach((row, rowIndex) => {
                                    const rowText = row.textContent.trim();
                                    
                                    if (rowText.includes('억') || rowText.includes('만원')) {
                                        transactions.push({
                                            type: 'transaction_table',
                                            table_index: tableIndex,
                                            row_index: rowIndex,
                                            content: rowText.substring(0, 200),
                                            extracted_at: new Date().toISOString()
                                        });
                                    }
                                });
                            }
                        });
                        
                        return transactions;
                    }
                """
            }
        ]
        
        return await self.extract_with_multiple_strategies(strategies)
        
    async def try_click_transaction_tab(self):
        """실거래가 탭 클릭 시도"""
        tab_selectors = [
            'text="실거래가"',
            'text="거래"', 
            'text="실거래"',
            '[class*="deal"]',
            '[class*="transaction"]',
            'button:권:has-text("실거래")',
            'a:권:has-text("실거래")',
            '.tab:권:has-text("실거래")'
        ]
        
        for selector in tab_selectors:
            try:
                element = await self.page.query_selector(selector)
                if element:
                    print(f"📝 실거래가 탭 발견: {selector}")
                    await element.click()
                    await self.human_like_delay(2, 4)
                    print("✅ 실거래가 탭 클릭 성공")
                    return True
            except Exception as e:
                print(f"⚠️ 탭 클릭 실패 ({selector}): {e}")
                continue
                
        print("⚠️ 실거래가 탭을 찾을 수 없음")
        return False
        
    async def take_enhanced_screenshot(self, complex_id):
        """강화된 스크린샷"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            screenshot_path = f"data/output/enhanced_screenshot_{complex_id}_{timestamp}.png"
            Path("data/output").mkdir(parents=True, exist_ok=True)
            
            # 전체 페이지 스크린샷 (PNG는 quality 옵션 불가)
            await self.page.screenshot(
                path=screenshot_path, 
                full_page=True
            )
            
            print(f"📸 스크린샷 저장: {screenshot_path}")
            return screenshot_path
            
        except Exception as e:
            print(f"❌ 스크린샷 오류: {e}")
            return None
            
    async def save_enhanced_data(self, complex_id, basic_info, listings, transactions, screenshot_path):
        """강화된 데이터 저장"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        Path("data/output").mkdir(parents=True, exist_ok=True)
        
        # 종합 데이터 구성
        comprehensive_data = {
            'crawler_info': {
                'version': '2.0 Enhanced',
                'crawl_method': 'stealth_mode',
                'crawled_at': datetime.now().isoformat(),
                'complex_id': complex_id
            },
            'basic_info': basic_info,
            'current_listings': listings,
            'transaction_history': transactions,
            'statistics': {
                'total_listings': len(listings),
                'total_transactions': len(transactions),
                'data_quality': 'enhanced'
            },
            'files': {
                'screenshot': screenshot_path
            }
        }
        
        # JSON 파일 저장
        json_file = f"data/output/enhanced_complex_{complex_id}_{timestamp}.json"
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(comprehensive_data, f, ensure_ascii=False, indent=2)
            
        # CSV 요약 저장
        csv_file = f"data/output/enhanced_summary_{complex_id}_{timestamp}.csv"
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'complex_id', 'complex_name', 'address', 'completion_year',
                'total_listings', 'total_transactions', 'screenshot_path',
                'crawl_method', 'crawled_at'
            ])
            
            writer.writerow([
                complex_id,
                basic_info.get('complexName', '정보없음'),
                basic_info.get('address', '정보없음'),
                basic_info.get('completionYear', '정보없음'),
                len(listings),
                len(transactions),
                screenshot_path,
                'enhanced_stealth',
                datetime.now().isoformat()
            ])
            
        return {
            'json_file': json_file,
            'csv_file': csv_file,
            'screenshot': screenshot_path
        }
        
    async def crawl_complex_enhanced(self, url, name=None):
        """강화된 단지 크롤링"""
        try:
            # 스텔스 브라우저 초기화
            await self.init_stealth_browser()
            
            complex_id = self.extract_complex_id_from_url(url)
            display_name = name or f"단지_{complex_id}"
            
            print(f"\n🏠 {display_name} 강화 크롤링 시작!")
            print(f"🎆 URL: {url}")
            
            # 1. 안전한 페이지 네비게이션
            if not await self.safe_navigate(url):
                raise Exception("페이지 로드 실패")
                
            # 2. 기본 정보 추출
            basic_info = await self.extract_complex_info(url)
            
            # 3. 매물 정보 추출
            listings = await self.extract_listings()
            
            # 4. 실거래가 추출 (국토부 데이터로 대체 예정이므로 스킵)
            print("💰 실거래가 정보 추출 스킵 (국토부 데이터 사용 예정)")
            transactions = []
            
            # 5. 스크린샷 촬영
            screenshot_path = await self.take_enhanced_screenshot(complex_id)
            
            # 6. 데이터 저장
            file_paths = await self.save_enhanced_data(
                complex_id, basic_info, listings, transactions, screenshot_path
            )
            
            # 7. DB 저장
            json_file = file_paths.get('json_file')
            db_success = False
            if json_file:
                db_success = process_json_file(json_file, {'database': 'data/naver_real_estate.db'})
            
            # 8. 결과 요약
            print(f"\n🎉 {display_name} 강화 크롤링 완료!")
            print(f"📊 수집 결과:")
            print(f"  🏢 단지ID: {complex_id}")
            print(f"  🏠 매물: {len(listings)}개")
            print(f"  💰 거래기록: 스킵됨 (국토부 데이터 사용)")
            print(f"  📸 스크린샷: {'✅' if screenshot_path else '❌'}")
            print(f"  🗄️ DB 저장: {'✅' if db_success else '❌'}")
            
            return {
                'success': True,
                'method': 'enhanced_stealth',
                'complex_id': complex_id,
                'complex_name': basic_info.get('complexName', display_name),
                'data_summary': {
                    'listings_count': len(listings),
                    'transactions_count': len(transactions),
                    'has_screenshot': bool(screenshot_path),
                    'db_saved': db_success
                },
                'files': file_paths
            }
            
        except Exception as e:
            print(f"❌ {display_name} 강화 크롤링 오류: {e}")
            import traceback
            traceback.print_exc()
            return {
                'success': False,
                'error': str(e),
                'method': 'enhanced_stealth',
                'complex_id': self.extract_complex_id_from_url(url)
            }
            
        finally:
            if self.browser:
                await self.browser.close()
                print("🔄 브라우저 종료")

# 사용 예시 함수들
async def crawl_enhanced_single(url, name=None, headless=True):
    """강화된 단일 단지 크롤링"""
    crawler = EnhancedNaverCrawler(headless=headless, stealth_mode=True)
    return await crawler.crawl_complex_enhanced(url, name)

async def test_enhanced_crawler():
    """강화된 크롤러 테스트"""
    test_url = "https://new.land.naver.com/complexes/2592"
    
    print("🚀 강화된 네이버 부동산 크롤러 테스트")
    print("🔒 스텔스 모드 + 우회 기술 적용")
    
    result = await crawl_enhanced_single(test_url, "정든한진6차 (강화버전)", headless=False)
    
    if result['success']:
        print(f"\n✅ 강화 테스트 성공!")
        print(f"📄 생성된 파일:")
        for key, path in result['files'].items():
            if path:
                print(f"  {key}: {path}")
    else:
        print(f"❌ 강화 테스트 실패: {result['error']}")
        
    return result

if __name__ == "__main__":
    asyncio.run(test_enhanced_crawler())
