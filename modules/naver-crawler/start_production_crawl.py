#!/usr/bin/env python3

"""
실제 프로덕션 크롤링 시작
VPN 멀티레이어 환경에서 안전하게 크롤링 실행
"""

import asyncio
import sys
import json
import sqlite3
from pathlib import Path
from playwright.async_api import async_playwright
from datetime import datetime
import random

class ProductionCrawler:
    def __init__(self):
        self.db_path = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
        self.output_dir = Path('/Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler/data/output')
        self.daily_target = 20  # 안전한 시작: 하루 20개
        self.delay_range = (3, 7)  # 3-7초 랜덤 지연
        
        self.stats = {
            'processed': 0,
            'success': 0,
            'errors': 0,
            'start_time': datetime.now()
        }

    async def get_target_complexes(self, limit=20):
        """크롤링 대상 단지 조회"""
        print(f"📋 크롤링 대상 {limit}개 단지 조회 중...")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 매물 없는 고우선순위 단지 조회
        query = """
        SELECT id, apartment_name, sigungu, eup_myeon_dong, total_transactions
        FROM apartment_complexes ac
        WHERE NOT EXISTS (
            SELECT 1 FROM current_listings cl 
            WHERE cl.complex_id = ac.id
        )
        ORDER BY crawling_priority ASC, total_transactions DESC
        LIMIT ?
        """
        
        cursor.execute(query, (limit,))
        complexes = cursor.fetchall()
        conn.close()
        
        print(f"✅ {len(complexes)}개 대상 단지 선정 완료")
        return complexes

    async def crawl_single_complex(self, browser, complex_data):
        """단일 단지 크롤링"""
        complex_id, name, sigungu, dong, transactions = complex_data
        
        try:
            print(f"🏢 크롤링 시작: {name} ({sigungu} {dong})")
            
            page = await browser.new_page()
            
            # 랜덤 User-Agent 설정
            user_agents = [
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
            ]
            
            await page.set_extra_http_headers({
                'User-Agent': random.choice(user_agents)
            })
            
            # 네이버 부동산 검색
            search_url = f"https://new.land.naver.com/search?keyword={name}+{sigungu}"
            await page.goto(search_url, wait_until='domcontentloaded')
            
            # 페이지 로딩 대기
            await asyncio.sleep(2)
            
            # 검색 결과 확인
            try:
                # 단지 링크 찾기
                complex_links = await page.query_selector_all('a[href*="/complexes/"]')
                
                if complex_links:
                    # 첫 번째 매칭 단지 선택
                    first_link = complex_links[0]
                    href = await first_link.get_attribute('href')
                    
                    if href:
                        complex_url = f"https://new.land.naver.com{href}"
                        print(f"🔗 단지 페이지 발견: {complex_url}")
                        
                        # 단지 상세 페이지로 이동
                        await page.goto(complex_url, wait_until='domcontentloaded')
                        await asyncio.sleep(3)
                        
                        # 기본 단지 정보 추출
                        complex_info = await self.extract_complex_info(page, complex_id, name)
                        
                        if complex_info:
                            # 파일 저장
                            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                            filename = f"complex_{complex_id}_{timestamp}.json"
                            filepath = self.output_dir / filename
                            
                            with open(filepath, 'w', encoding='utf-8') as f:
                                json.dump(complex_info, f, ensure_ascii=False, indent=2)
                            
                            print(f"✅ 저장 완료: {filename}")
                            self.stats['success'] += 1
                        else:
                            print("⚠️  단지 정보 추출 실패")
                            self.stats['errors'] += 1
                    else:
                        print("⚠️  단지 링크 없음")
                        self.stats['errors'] += 1
                else:
                    print("⚠️  검색 결과 없음")
                    self.stats['errors'] += 1
                    
            except Exception as e:
                print(f"❌ 크롤링 오류: {e}")
                self.stats['errors'] += 1
            
            await page.close()
            self.stats['processed'] += 1
            
            # 랜덤 지연
            delay = random.randint(*self.delay_range)
            print(f"⏱️  {delay}초 대기...")
            await asyncio.sleep(delay)
            
        except Exception as e:
            print(f"❌ 전체 오류: {e}")
            self.stats['errors'] += 1

    async def extract_complex_info(self, page, complex_id, name):
        """단지 정보 추출"""
        try:
            # 기본 정보
            complex_info = {
                'complex_id': complex_id,
                'name': name,
                'crawled_at': datetime.now().isoformat(),
                'source': 'naver_production',
                'basic_info': {},
                'listings': []
            }
            
            # 단지명 재확인
            try:
                title_element = await page.query_selector('h1, .complex_title, [class*="title"]')
                if title_element:
                    title = await title_element.text_content()
                    complex_info['basic_info']['confirmed_name'] = title.strip()
            except:
                pass
            
            # 주소 정보
            try:
                address_element = await page.query_selector('[class*="address"], [class*="location"]')
                if address_element:
                    address = await address_element.text_content()
                    complex_info['basic_info']['address'] = address.strip()
            except:
                pass
            
            # 매물 정보 (간단한 추출)
            try:
                listing_elements = await page.query_selector_all('[class*="item"], [class*="listing"]')
                
                for i, listing in enumerate(listing_elements[:5]):  # 최대 5개만
                    try:
                        listing_text = await listing.text_content()
                        if listing_text and ('억' in listing_text or '만' in listing_text):
                            complex_info['listings'].append({
                                'index': i,
                                'raw_text': listing_text.strip()
                            })
                    except:
                        continue
                        
            except:
                pass
            
            return complex_info if complex_info['basic_info'] else None
            
        except Exception as e:
            print(f"정보 추출 오류: {e}")
            return None

    async def run_production_crawl(self):
        """프로덕션 크롤링 실행"""
        print("🚀 프로덕션 크롤링 시작")
        print("=" * 60)
        
        try:
            # 대상 단지 조회
            complexes = await self.get_target_complexes(self.daily_target)
            
            if not complexes:
                print("❌ 크롤링 대상이 없습니다")
                return
            
            # 브라우저 시작
            async with async_playwright() as p:
                browser = await p.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage']
                )
                
                print(f"🔍 {len(complexes)}개 단지 크롤링 시작...")
                
                # 각 단지 크롤링
                for i, complex_data in enumerate(complexes):
                    print(f"\n[{i+1}/{len(complexes)}] ", end="")
                    await self.crawl_single_complex(browser, complex_data)
                
                await browser.close()
            
            # 결과 출력
            self.print_results()
            
        except Exception as e:
            print(f"❌ 크롤링 실행 오류: {e}")

    def print_results(self):
        """결과 출력"""
        elapsed = datetime.now() - self.stats['start_time']
        success_rate = (self.stats['success'] / self.stats['processed'] * 100) if self.stats['processed'] > 0 else 0
        
        print("\n" + "=" * 60)
        print("🎉 크롤링 완료!")
        print(f"📊 결과:")
        print(f"   • 처리된 단지: {self.stats['processed']}개")
        print(f"   • 성공: {self.stats['success']}개")
        print(f"   • 실패: {self.stats['errors']}개")
        print(f"   • 성공률: {success_rate:.1f}%")
        print(f"   • 소요시간: {elapsed}")
        print(f"📁 출력 디렉토리: {self.output_dir}")

if __name__ == "__main__":
    crawler = ProductionCrawler()
    asyncio.run(crawler.run_production_crawl())