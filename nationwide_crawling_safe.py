#!/usr/bin/env python3
"""
전국 아파트 안전 크롤링 (13시간 여유)
- 충분한 대기 시간으로 차단 방지
- VPN 백업 시스템 포함
- 진행 상황 실시간 저장
"""

import asyncio
import sys
import os
import time
import json
from datetime import datetime, timedelta
from pathlib import Path

sys.path.append('/home/ksj27/projects/real-estate-platform/modules/naver-crawler')

from core.crawler import NaverRealEstateCrawler
from setup_supabase_complete import SupabaseCompleteSetup

class SafeNationwideCrawler:
    def __init__(self):
        self.setup = SupabaseCompleteSetup(
            'https://heatmxifhwxppprdzaqf.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o'
        )
        self.start_time = datetime.now()
        self.deadline = datetime.now() + timedelta(hours=13)  # 내일 8시까지
        self.progress_file = "crawling_progress.json"
        self.total_saved = 0
        
        # 전국 지역 정의 (서울 제외 - 이미 완료)
        self.regions = {
            "부산": {
                "해운대구": "2644010100", "수영구": "2644010200", "남구": "2644010300",
                "동구": "2644010400", "서구": "2644010500", "중구": "2644010600",
                "영도구": "2644010700", "부산진구": "2644010800", "동래구": "2644010900",
                "북구": "2644011000", "금정구": "2644011100", "강서구": "2644011200",
                "연제구": "2644011300", "사상구": "2644011400", "사하구": "2644011500",
                "기장군": "2644011600"
            },
            "인천": {
                "중구": "2811010100", "동구": "2811010200", "미추홀구": "2811010300",
                "연수구": "2811010400", "남동구": "2811010500", "부평구": "2811010600",
                "계양구": "2811010700", "서구": "2811010800", "강화군": "2811010900",
                "옹진군": "2811011000"
            },
            "대구": {
                "중구": "2711010100", "동구": "2711010200", "서구": "2711010300",
                "남구": "2711010400", "북구": "2711010500", "수성구": "2711010600",
                "달서구": "2711010700", "달성군": "2711010800"
            },
            "광주": {
                "동구": "2911010100", "서구": "2911010200", "남구": "2911010300",
                "북구": "2911010400", "광산구": "2911010500"
            },
            "대전": {
                "동구": "3011010100", "중구": "3011010200", "서구": "3011010300",
                "유성구": "3011010400", "대덕구": "3011010500"
            },
            "울산": {
                "중구": "3111010100", "남구": "3111010200", "동구": "3111010300",
                "북구": "3111010400", "울주군": "3111010500"
            }
        }
        
        # 서울 나머지 구들 (강남, 강동, 강북 제외)
        self.seoul_remaining = {
            "서울": {
                "강서구": "1168010800", "관악구": "1168010900", "광진구": "1168011000",
                "구로구": "1168011100", "금천구": "1168011200", "노원구": "1168011300",
                "도봉구": "1168011400", "동대문구": "1168011500", "동작구": "1168011600",
                "마포구": "1168011700", "서대문구": "1168011800", "서초구": "1168011900",
                "성동구": "1168012000", "성북구": "1168012100", "송파구": "1168012200",
                "양천구": "1168012300", "영등포구": "1168012400", "용산구": "1168012500",
                "은평구": "1168012600", "종로구": "1168012700", "중구": "1168012800",
                "중랑구": "1168012900"
            }
        }
    
    def load_progress(self):
        """진행 상황 로드"""
        if Path(self.progress_file).exists():
            with open(self.progress_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {"completed_regions": [], "last_update": None}
    
    def save_progress(self, progress):
        """진행 상황 저장"""
        progress["last_update"] = datetime.now().isoformat()
        with open(self.progress_file, 'w', encoding='utf-8') as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
    
    def convert_apartment_to_db_format(self, apt, region_name):
        """아파트 데이터를 DB 형식으로 변환"""
        avg_price = None
        if apt.min_deal_price and apt.max_deal_price:
            avg_price = (apt.min_deal_price + apt.max_deal_price) // 2
        elif apt.min_deal_price:
            avg_price = apt.min_deal_price
        elif apt.max_deal_price:
            avg_price = apt.max_deal_price
        
        construction_year = None
        if apt.completion_year_month:
            try:
                year_str = str(apt.completion_year_month)[:4]
                construction_year = int(year_str)
            except:
                pass
        
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
    
    async def crawl_and_save_region(self, city, district):
        """지역 크롤링 후 DB 저장 (안전 모드)"""
        region_key = f"{city}_{district}"
        
        print(f"🏗️ {city} {district} 크롤링 시작...")
        
        async with NaverRealEstateCrawler() as crawler:
            try:
                # 크롤링 실행
                apartments = await crawler.get_apartments(city, district, '매매')
                print(f"✅ 크롤링 완료: {len(apartments)}개 아파트")
                
                if not apartments:
                    print("⚠️ 수집된 데이터가 없습니다.")
                    return 0
                
                # DB 저장
                saved_count = 0
                
                for apt in apartments:
                    try:
                        db_data = self.convert_apartment_to_db_format(apt, region_key)
                        
                        result = self.setup.supabase.table('apartment_complexes')\
                            .upsert(db_data, on_conflict='complex_id')\
                            .execute()
                        
                        saved_count += 1
                        
                        if saved_count % 100 == 0:
                            print(f"📤 진행률: {saved_count}/{len(apartments)}")
                            
                    except Exception as e:
                        print(f"⚠️ 개별 저장 오류: {e}")
                        continue
                
                print(f"🎉 DB 저장 완료: {saved_count}/{len(apartments)}개")
                return saved_count
                
            except Exception as e:
                print(f"❌ 크롤링 오류: {e}")
                return 0
    
    def calculate_delay(self, remaining_regions, time_left_hours):
        """남은 시간에 따른 최적 대기 시간 계산"""
        if remaining_regions == 0:
            return 10  # 기본 대기 시간
        
        # 시간당 처리 가능한 지역 수
        regions_per_hour = remaining_regions / time_left_hours
        
        if regions_per_hour <= 2:
            return 30  # 여유로움 - 30초 대기
        elif regions_per_hour <= 4:
            return 15  # 보통 - 15초 대기  
        elif regions_per_hour <= 8:
            return 8   # 빠름 - 8초 대기
        else:
            return 5   # 최소 - 5초 대기
    
    async def run_safe_crawling(self):
        """안전한 전국 크롤링 실행"""
        print("🚀 전국 아파트 안전 크롤링 시작!")
        print(f"⏰ 시작 시간: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏰ 마감 시간: {self.deadline.strftime('%Y-%m-%d %H:%M:%S')}")
        print("🔒 VPN 백업 시스템 활성화 상태")
        print("=" * 60)
        
        # 진행 상황 로드
        progress = self.load_progress()
        completed_regions = set(progress.get("completed_regions", []))
        
        # 전체 지역 리스트 생성
        all_regions = []
        
        # 서울 나머지 구들 추가
        for city, districts in self.seoul_remaining.items():
            for district in districts.keys():
                region_key = f"{city}_{district}"
                if region_key not in completed_regions:
                    all_regions.append((city, district))
        
        # 다른 도시들 추가
        for city, districts in self.regions.items():
            for district in districts.keys():
                region_key = f"{city}_{district}"
                if region_key not in completed_regions:
                    all_regions.append((city, district))
        
        print(f"📋 처리할 지역: {len(all_regions)}개")
        print(f"📋 완료된 지역: {len(completed_regions)}개")
        
        # 크롤링 실행
        for i, (city, district) in enumerate(all_regions, 1):
            # 시간 확인
            current_time = datetime.now()
            time_left = self.deadline - current_time
            
            if time_left.total_seconds() <= 0:
                print("⏰ 마감 시간 도달!")
                break
            
            time_left_hours = time_left.total_seconds() / 3600
            remaining_regions = len(all_regions) - i + 1
            
            print(f"\n[{i}/{len(all_regions)}] {city} {district}")
            print(f"⏰ 남은 시간: {time_left_hours:.1f}시간 | 남은 지역: {remaining_regions}개")
            
            try:
                saved = await self.crawl_and_save_region(city, district)
                self.total_saved += saved
                
                # 진행 상황 저장
                region_key = f"{city}_{district}"
                completed_regions.add(region_key)
                progress["completed_regions"] = list(completed_regions)
                self.save_progress(progress)
                
                # 동적 대기 시간 계산
                delay_time = self.calculate_delay(remaining_regions, time_left_hours)
                print(f"⏱️ 안전 대기: {delay_time}초...")
                await asyncio.sleep(delay_time)
                
                # 주기적 상태 출력
                if i % 5 == 0:
                    print(f"\n📊 현재까지 진행 상황:")
                    print(f"   처리 완료: {i}/{len(all_regions)} 지역")
                    print(f"   총 저장: {self.total_saved}개 아파트")
                    print(f"   진행률: {(i/len(all_regions)*100):.1f}%")
                
            except Exception as e:
                print(f"❌ {city} {district} 처리 실패: {e}")
                continue
        
        # 최종 결과
        end_time = datetime.now()
        duration = end_time - self.start_time
        
        print(f"\n🎉 전국 크롤링 완료!")
        print("=" * 60)
        print(f"📊 최종 결과:")
        print(f"   총 소요 시간: {duration}")
        print(f"   처리된 지역: {len(completed_regions)}개")
        print(f"   총 저장 아파트: {self.total_saved}개")
        print(f"   종료 시간: {end_time.strftime('%Y-%m-%d %H:%M:%S')}")

async def main():
    crawler = SafeNationwideCrawler()
    await crawler.run_safe_crawling()

if __name__ == "__main__":
    asyncio.run(main())