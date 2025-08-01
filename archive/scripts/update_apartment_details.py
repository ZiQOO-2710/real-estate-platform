#!/usr/bin/env python3
"""
크롤링 데이터의 상세 정보로 데이터베이스 업데이트
"""

import json
import re
from pathlib import Path
from setup_supabase_complete import SupabaseCompleteSetup

def parse_number(text):
    """문자열에서 숫자 추출"""
    if not text:
        return None
    numbers = re.findall(r'\d+', str(text))
    return int(numbers[0]) if numbers else None

def update_apartment_details():
    print("🔄 아파트 상세 정보 업데이트 시작...")
    
    # Supabase 연결
    setup = SupabaseCompleteSetup(
        'https://heatmxifhwxppprdzaqf.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o'
    )
    
    # 크롤링 데이터 로드
    data_file = Path("modules/naver-crawler/data/output/complex_2592_comprehensive_20250714_104354.json")
    
    if not data_file.exists():
        print("❌ 크롤링 데이터 파일을 찾을 수 없습니다.")
        return
    
    with open(data_file, 'r', encoding='utf-8') as f:
        crawling_data = json.load(f)
    
    print(f"📊 크롤링 데이터 로드 완료")
    
    # 기본 정보 추출
    basic_info = crawling_data.get('complex_basic_info', {})
    complex_name = basic_info.get('complexName', '')
    
    if not complex_name:
        print("❌ 아파트 이름을 찾을 수 없습니다.")
        return
    
    # 상세 정보 파싱
    construction_year = parse_number(basic_info.get('completionYear'))
    total_units = parse_number(basic_info.get('totalHouseholds'))
    
    # 층수 정보는 current_listings에서 추출
    floors = None
    listings = crawling_data.get('current_listings', [])
    for listing in listings:
        floor_info = listing.get('floor', '')
        if floor_info:
            # "1/14층" 형태에서 최대 층수 추출
            floor_nums = re.findall(r'(\d+)/(\d+)층', floor_info)
            if floor_nums:
                floors = int(floor_nums[0][1])  # 두 번째 숫자가 최대 층수
                break
    
    print(f"📋 추출된 정보:")
    print(f"   이름: {complex_name}")
    print(f"   건축년도: {construction_year}")
    print(f"   세대수: {total_units}")  
    print(f"   층수: {floors}")
    
    # 데이터베이스 업데이트
    update_data = {}
    if construction_year:
        update_data['construction_year'] = construction_year
    if total_units:
        update_data['total_units'] = total_units
    if floors:
        update_data['floors'] = floors
    
    if update_data:
        try:
            # complex_name으로 찾아서 업데이트
            result = setup.supabase.table('apartment_complexes')\
                .update(update_data)\
                .eq('complex_name', complex_name)\
                .execute()
            
            print(f"✅ 데이터베이스 업데이트 완료!")
            print(f"   업데이트된 레코드: {len(result.data)}개")
            
        except Exception as e:
            print(f"❌ 데이터베이스 업데이트 실패: {e}")
    else:
        print("⚠️ 업데이트할 정보가 없습니다.")

if __name__ == "__main__":
    update_apartment_details()