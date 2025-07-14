#!/usr/bin/env python3
"""
서울 지역 아파트 크롤링 후 DB 저장
"""

import asyncio
import sys
import os
sys.path.append('/home/ksj27/projects/real-estate-platform/modules/naver-crawler')

from core.crawler import NaverRealEstateCrawler
from setup_supabase_complete import SupabaseCompleteSetup

class SeoulCrawlerWithDB:
    def __init__(self):
        self.setup = SupabaseCompleteSetup(
            'https://heatmxifhwxppprdzaqf.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o'
        )
    
    def convert_apartment_to_db_format(self, apt, region_name):
        """아파트 데이터를 DB 형식으로 변환"""
        
        # 평균 가격 계산
        avg_price = None
        if apt.min_deal_price and apt.max_deal_price:
            avg_price = (apt.min_deal_price + apt.max_deal_price) // 2
        elif apt.min_deal_price:
            avg_price = apt.min_deal_price
        elif apt.max_deal_price:
            avg_price = apt.max_deal_price
        
        # 건축년도 추출 (201305 -> 2013)
        construction_year = None
        if apt.completion_year_month:
            try:
                year_str = str(apt.completion_year_month)[:4]
                construction_year = int(year_str)
            except:
                pass
        
        # 지역 정보 파싱
        city, gu = region_name.split('_') if '_' in region_name else (region_name, '')
        
        return {
            'complex_id': f"naver_{apt.complex_no}" if apt.complex_no else f"naver_unknown_{id(apt)}",
            'complex_name': apt.complex_name or '이름없음',
            'address_road': apt.address or '',
            'city': city,
            'gu': gu,
            'latitude': apt.latitude,
            'longitude': apt.longitude,
            'total_units': apt.total_household_count,
            'construction_year': construction_year,
            'last_transaction_price': avg_price,
            'source_url': f"https://new.land.naver.com/complexes/{apt.complex_no}" if apt.complex_no else ""
        }
    
    async def crawl_and_save_region(self, city, district, trade_type='매매'):
        """지역 크롤링 후 DB 저장"""
        print(f"🏗️ {city} {district} {trade_type} 크롤링 시작...")
        
        async with NaverRealEstateCrawler() as crawler:
            try:
                # 크롤링 실행
                apartments = await crawler.get_apartments(city, district, trade_type)
                print(f"✅ 크롤링 완료: {len(apartments)}개 아파트")
                
                if not apartments:
                    print("⚠️ 수집된 데이터가 없습니다.")
                    return
                
                # DB 저장
                region_name = f"{city}_{district}"
                saved_count = 0
                
                for apt in apartments:
                    try:
                        db_data = self.convert_apartment_to_db_format(apt, region_name)
                        
                        # upsert로 중복 방지
                        result = self.setup.supabase.table('apartment_complexes')\
                            .upsert(db_data, on_conflict='complex_id')\
                            .execute()
                        
                        saved_count += 1
                        
                        if saved_count % 50 == 0:
                            print(f"📤 진행률: {saved_count}/{len(apartments)}")
                            
                    except Exception as e:
                        print(f"⚠️ 개별 저장 오류: {e}")
                        continue
                
                print(f"🎉 DB 저장 완료: {saved_count}/{len(apartments)}개")
                return saved_count
                
            except Exception as e:
                print(f"❌ 크롤링 오류: {e}")
                return 0
    
    async def crawl_seoul_districts(self, limit_districts=None):
        """서울 전체 구 크롤링"""
        seoul_districts = [
            "강남구", "강동구", "강북구", "강서구", "관악구",
            "광진구", "구로구", "금천구", "노원구", "도봉구",
            "동대문구", "동작구", "마포구", "서대문구", "서초구",
            "성동구", "성북구", "송파구", "양천구", "영등포구",
            "용산구", "은평구", "종로구", "중구", "중랑구"
        ]
        
        if limit_districts:
            seoul_districts = seoul_districts[:limit_districts]
        
        print(f"🏙️ 서울 {len(seoul_districts)}개 구 크롤링 시작")
        print("🔒 WARP 활성화 상태")
        print("=" * 50)
        
        total_saved = 0
        
        for i, district in enumerate(seoul_districts, 1):
            print(f"\n[{i}/{len(seoul_districts)}] {district}")
            
            try:
                saved = await self.crawl_and_save_region("서울", district)
                total_saved += saved
                
                # 너무 빠른 요청 방지 (3초 대기)
                print("⏱️ 3초 대기...")
                await asyncio.sleep(3)
                
            except Exception as e:
                print(f"❌ {district} 크롤링 실패: {e}")
                continue
        
        print(f"\n🎉 전체 크롤링 완료!")
        print(f"📊 총 저장된 아파트: {total_saved}개")
        
        return total_saved

async def main():
    print("🚀 서울 아파트 크롤링 + DB 저장 시작!")
    print("=" * 50)
    
    crawler_db = SeoulCrawlerWithDB()
    
    # 먼저 3개 구만 테스트
    total_saved = await crawler_db.crawl_seoul_districts(limit_districts=3)
    
    print(f"\n📈 최종 결과: {total_saved}개 아파트 DB 저장 완료")

if __name__ == "__main__":
    asyncio.run(main())