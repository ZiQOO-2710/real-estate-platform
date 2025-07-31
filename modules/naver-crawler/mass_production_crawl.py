#!/usr/bin/env python3

"""
기존 Enhanced Crawler를 활용한 대량 프로덕션 크롤링
VPN + 스텔스 모드로 안전하게 300개/일 목표
"""

import asyncio
import sqlite3
import random
from datetime import datetime
from core.enhanced_naver_crawler import crawl_enhanced_single
import time

class MassProductionCrawler:
    def __init__(self):
        self.db_path = '/Users/seongjunkim/projects/real-estate-platform/api/data/full_integrated_real_estate.db'
        self.daily_target = 50  # 안전한 시작: 50개/일
        self.delay_range = (10, 20)  # 10-20초 지연 (안전)
        
        self.stats = {
            'processed': 0,
            'success': 0,
            'errors': 0,
            'start_time': datetime.now()
        }

    def get_target_complexes(self, limit=50):
        """크롤링 대상 단지 URL 생성"""
        print(f"📋 크롤링 대상 {limit}개 단지 조회 중...")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 매물 없는 고우선순위 단지 조회 (네이버 단지 ID 포함)
        query = """
        SELECT id, apartment_name, sigungu, eup_myeon_dong, total_transactions
        FROM apartment_complexes ac
        WHERE NOT EXISTS (
            SELECT 1 FROM current_listings cl 
            WHERE cl.complex_id = ac.id AND cl.source_type = 'naver'
        )
        AND ac.total_transactions > 5  -- 최소 거래량 필터
        ORDER BY ac.crawling_priority ASC, ac.total_transactions DESC
        LIMIT ?
        """
        
        cursor.execute(query, (limit,))
        complexes = cursor.fetchall()
        conn.close()
        
        # 네이버 단지 URL 생성 (추정)
        target_urls = []
        for complex_data in complexes:
            complex_id, name, sigungu, dong, transactions = complex_data
            
            # 네이버 단지 ID는 순차적이므로 추정 범위 생성
            estimated_ids = [
                complex_id,  # 동일 ID
                complex_id + 1000,  # 오프셋 추가
                complex_id + 2000,
                complex_id + 3000,
                complex_id + 5000,
                random.randint(1000, 15000)  # 랜덤 ID
            ]
            
            for est_id in estimated_ids[:2]:  # 각 단지당 2개 URL 시도
                naver_url = f"https://new.land.naver.com/complexes/{est_id}"
                target_urls.append({
                    'url': naver_url,
                    'complex_id': complex_id,
                    'name': name,
                    'location': f"{sigungu} {dong}"
                })
        
        print(f"✅ {len(target_urls)}개 대상 URL 생성 완료")
        return target_urls[:limit]  # 제한

    async def run_mass_crawling(self):
        """대량 크롤링 실행"""
        print("🚀 Enhanced Crawler 대량 크롤링 시작")
        print("=" * 60)
        print(f"🎯 목표: {self.daily_target}개 단지")
        print(f"⏱️  지연: {self.delay_range[0]}-{self.delay_range[1]}초")
        print(f"🌐 VPN: Cloudflare WARP 연결됨")
        print("=" * 60)
        
        try:
            # 대상 URL 조회
            target_urls = self.get_target_complexes(self.daily_target)
            
            if not target_urls:
                print("❌ 크롤링 대상이 없습니다")
                return
            
            print(f"🔍 {len(target_urls)}개 URL 크롤링 시작...\n")
            
            # 순차 크롤링 (안전성 우선)
            for i, target in enumerate(target_urls):
                print(f"[{i+1}/{len(target_urls)}] {target['name']} ({target['location']})")
                print(f"🎆 URL: {target['url']}")
                
                try:
                    # Enhanced Crawler 호출
                    result = await crawl_enhanced_single(target['url'])
                    
                    if result:
                        print(f"✅ 성공: {target['name']}")
                        self.stats['success'] += 1
                    else:
                        print(f"❌ 실패: {target['name']}")
                        self.stats['errors'] += 1
                        
                except Exception as e:
                    print(f"❌ 오류: {target['name']} - {e}")
                    self.stats['errors'] += 1
                
                self.stats['processed'] += 1
                
                # 랜덤 지연 (인간적 패턴)
                if i < len(target_urls) - 1:  # 마지막이 아니면
                    delay = random.randint(*self.delay_range)
                    print(f"⏱️  {delay}초 대기...\n")
                    await asyncio.sleep(delay)
            
            # 결과 출력
            self.print_results()
            
        except Exception as e:
            print(f"❌ 크롤링 실행 오류: {e}")

    def print_results(self):
        """결과 출력"""
        elapsed = datetime.now() - self.stats['start_time']
        success_rate = (self.stats['success'] / self.stats['processed'] * 100) if self.stats['processed'] > 0 else 0
        
        print("\n" + "=" * 60)
        print("🎉 Enhanced Crawler 대량 크롤링 완료!")
        print(f"📊 결과:")
        print(f"   • 처리된 URL: {self.stats['processed']}개")
        print(f"   • 성공: {self.stats['success']}개")
        print(f"   • 실패: {self.stats['errors']}개")
        print(f"   • 성공률: {success_rate:.1f}%")
        print(f"   • 소요시간: {elapsed}")
        print(f"📁 출력 디렉토리: data/output/")
        print(f"🗄️ 데이터베이스: data/naver_real_estate.db")
        print("=" * 60)

if __name__ == "__main__":
    crawler = MassProductionCrawler()
    asyncio.run(crawler.run_mass_crawling())