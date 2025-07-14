"""
스텔스 크롤링 모듈 - IP 차단 회피 및 안정성 향상
"""

import random
import asyncio
import time
from typing import Optional, List, Dict, Any
from playwright.async_api import Page, Browser, BrowserContext
from loguru import logger
import json
import requests

from config.settings import (
    CRAWLING_CONFIG, 
    USER_AGENTS, 
    PROXY_CONFIG, 
    SESSION_CONFIG
)


class StealthCrawler:
    """스텔스 크롤링 기능 제공"""
    
    def __init__(self):
        self.request_count = 0
        self.session_start_time = time.time()
        self.current_proxy = None
        self.proxy_index = 0
        self.failed_proxies = set()
        
    async def random_delay(self, base_delay: float = None) -> None:
        """랜덤 딜레이 적용"""
        if base_delay is None:
            base_delay = CRAWLING_CONFIG["delay_between_requests"]
            
        min_delay, max_delay = CRAWLING_CONFIG["random_delay_range"]
        delay = random.uniform(min_delay, max_delay)
        
        logger.debug(f"랜덤 딜레이 적용: {delay:.2f}초")
        await asyncio.sleep(delay)
        
    def get_random_user_agent(self) -> str:
        """랜덤 User-Agent 반환"""
        return random.choice(USER_AGENTS)
        
    def get_random_viewport(self) -> Dict[str, int]:
        """랜덤 뷰포트 크기 반환"""
        common_resolutions = [
            {"width": 1920, "height": 1080},
            {"width": 1366, "height": 768},
            {"width": 1440, "height": 900},
            {"width": 1536, "height": 864},
            {"width": 1280, "height": 720},
        ]
        return random.choice(common_resolutions)
        
    async def setup_stealth_browser(self, browser: Browser) -> BrowserContext:
        """스텔스 브라우저 컨텍스트 설정"""
        # 랜덤 뷰포트 설정
        viewport = self.get_random_viewport()
        
        # 브라우저 컨텍스트 생성
        context = await browser.new_context(
            viewport=viewport,
            user_agent=self.get_random_user_agent(),
            locale="ko-KR",
            timezone_id="Asia/Seoul",
            # 프록시 설정 (활성화된 경우)
            proxy=self.get_current_proxy() if PROXY_CONFIG["enabled"] else None,
            # 추가 헤더 설정
            extra_http_headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Cache-Control": "max-age=0",
            }
        )
        
        # JavaScript 실행으로 브라우저 감지 우회
        await context.add_init_script("""
            // webdriver 속성 제거
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // chrome 속성 추가
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // permissions 속성 수정
            const originalQuery = window.navigator.permissions.query;
            return window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // plugins 속성 수정
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // languages 속성 수정
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en'],
            });
        """)
        
        return context
        
    async def setup_stealth_page(self, page: Page) -> None:
        """스텔스 페이지 설정"""
        # 이미지 로딩 비활성화 (속도 향상)
        await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,webp}", lambda route: route.abort())
        
        # 광고 및 트래킹 차단
        await page.route("**/*", self.block_resources)
        
        # 스크롤 이벤트 시뮬레이션
        await page.evaluate("""
            () => {
                window.scrollTo(0, Math.random() * 300);
            }
        """)
        
    async def block_resources(self, route) -> None:
        """불필요한 리소스 차단"""
        resource_type = route.request.resource_type
        url = route.request.url
        
        # 차단할 리소스 타입
        blocked_types = ["image", "media", "font", "stylesheet"]
        
        # 차단할 도메인
        blocked_domains = [
            "google-analytics.com",
            "googletagmanager.com",
            "facebook.com",
            "doubleclick.net",
            "googlesyndication.com",
        ]
        
        if resource_type in blocked_types or any(domain in url for domain in blocked_domains):
            await route.abort()
        else:
            await route.continue_()
            
    def get_current_proxy(self) -> Optional[Dict[str, str]]:
        """현재 프록시 설정 반환"""
        if not PROXY_CONFIG["enabled"] or not PROXY_CONFIG["proxy_list"]:
            return None
            
        available_proxies = [p for p in PROXY_CONFIG["proxy_list"] if p not in self.failed_proxies]
        
        if not available_proxies:
            # 모든 프록시가 실패한 경우 리셋
            self.failed_proxies.clear()
            available_proxies = PROXY_CONFIG["proxy_list"]
            
        if PROXY_CONFIG["rotation_enabled"]:
            proxy_url = random.choice(available_proxies)
        else:
            proxy_url = available_proxies[0]
            
        if proxy_url.startswith("http://"):
            return {"server": proxy_url}
        elif proxy_url.startswith("socks5://"):
            return {"server": proxy_url}
        else:
            return {"server": f"http://{proxy_url}"}
            
    async def test_proxy(self, proxy_url: str) -> bool:
        """프록시 연결 테스트"""
        try:
            proxies = {"http": proxy_url, "https": proxy_url}
            response = requests.get(
                PROXY_CONFIG["test_url"], 
                proxies=proxies, 
                timeout=10
            )
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"프록시 테스트 실패: {proxy_url} - {e}")
            return False
            
    async def rotate_proxy(self) -> None:
        """프록시 로테이션"""
        if not PROXY_CONFIG["enabled"]:
            return
            
        self.proxy_index = (self.proxy_index + 1) % len(PROXY_CONFIG["proxy_list"])
        new_proxy = PROXY_CONFIG["proxy_list"][self.proxy_index]
        
        if await self.test_proxy(new_proxy):
            self.current_proxy = new_proxy
            logger.info(f"프록시 변경: {new_proxy}")
        else:
            self.failed_proxies.add(new_proxy)
            logger.warning(f"프록시 실패로 제외: {new_proxy}")
            
    async def simulate_human_behavior(self, page: Page) -> None:
        """인간 행동 시뮬레이션"""
        if not SESSION_CONFIG["simulate_human_behavior"]:
            return
            
        # 랜덤 스크롤
        scroll_actions = [
            lambda: page.evaluate("window.scrollTo(0, Math.random() * 500)"),
            lambda: page.evaluate("window.scrollTo(0, document.body.scrollHeight * Math.random())"),
            lambda: page.evaluate("window.scrollBy(0, Math.random() * 200 - 100)"),
        ]
        
        action = random.choice(scroll_actions)
        await action()
        await asyncio.sleep(random.uniform(0.5, 2.0))
        
        # 랜덤 마우스 이동
        await page.mouse.move(
            random.randint(100, 800),
            random.randint(100, 600)
        )
        
    async def check_session_limits(self) -> bool:
        """세션 제한 확인"""
        self.request_count += 1
        
        # 요청 수 제한 확인
        if self.request_count >= CRAWLING_CONFIG["max_requests_per_session"]:
            logger.info("세션 요청 수 제한 도달, 세션 재시작 필요")
            return False
            
        # 세션 휴식 간격 확인
        if self.request_count % CRAWLING_CONFIG["session_break_interval"] == 0:
            logger.info(f"세션 휴식: {CRAWLING_CONFIG['session_break_duration']}초")
            await asyncio.sleep(CRAWLING_CONFIG["session_break_duration"])
            
        return True
        
    async def reset_session(self) -> None:
        """세션 리셋"""
        self.request_count = 0
        self.session_start_time = time.time()
        logger.info("세션 리셋 완료")
        
    async def handle_rate_limit(self, page: Page) -> bool:
        """레이트 리미트 감지 및 VPN 백업 처리"""
        try:
            # 차단 페이지 감지
            content = await page.content()
            rate_limit_indicators = [
                "차단되었습니다",
                "too many requests",
                "rate limit",
                "일시적으로 차단",
                "접근이 제한",
                "captcha",
            ]
            
            content_lower = content.lower()
            for indicator in rate_limit_indicators:
                if indicator in content_lower:
                    logger.warning(f"🚨 레이트 리미트 감지: {indicator}")
                    
                    # VPN 백업 시스템 활성화
                    try:
                        from .vpn_manager import handle_ip_blocked
                        
                        logger.info("🔄 VPN 백업 시스템 활성화...")
                        success, new_ip, vpn_type = await handle_ip_blocked(content)
                        
                        if success:
                            logger.info(f"✅ VPN 전환 성공: {vpn_type} - IP: {new_ip}")
                            
                            # 새로운 IP로 연결 안정화 대기
                            wait_time = random.uniform(10, 20)
                            logger.info(f"⏱️ 연결 안정화 대기: {wait_time:.1f}초")
                            await asyncio.sleep(wait_time)
                            
                            return True
                        else:
                            logger.error("❌ VPN 전환 실패")
                            
                            # 기존 방식으로 폴백
                            wait_time = random.uniform(30, 60)
                            logger.info(f"⏱️ 기존 방식 대기: {wait_time:.1f}초")
                            await asyncio.sleep(wait_time)
                            
                            # 프록시 변경 시도
                            await self.rotate_proxy()
                            return True
                            
                    except ImportError:
                        logger.warning("⚠️ VPN 매니저를 찾을 수 없음, 기존 방식 사용")
                        
                        # 기존 방식으로 처리
                        wait_time = random.uniform(30, 60)
                        logger.info(f"⏱️ 레이트 리미트 대기: {wait_time:.1f}초")
                        await asyncio.sleep(wait_time)
                        
                        # 프록시 변경 시도
                        await self.rotate_proxy()
                        return True
                    
            return False
            
        except Exception as e:
            logger.error(f"❌ 레이트 리미트 처리 오류: {e}")
            return False
            
    def get_session_stats(self) -> Dict[str, Any]:
        """세션 통계 반환"""
        current_time = time.time()
        session_duration = current_time - self.session_start_time
        
        return {
            "request_count": self.request_count,
            "session_duration": round(session_duration, 2),
            "requests_per_minute": round(self.request_count / (session_duration / 60), 2) if session_duration > 0 else 0,
            "current_proxy": self.current_proxy,
            "failed_proxies": len(self.failed_proxies),
        }