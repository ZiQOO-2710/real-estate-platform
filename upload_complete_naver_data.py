#!/usr/bin/env python3
"""
네이버 크롤링 데이터 완전 업로드
- 단지 기본 정보
- 현재 매물 정보 
- 실거래가 정보
"""

import json
import re
from pathlib import Path
from datetime import datetime, date
from setup_supabase_complete import SupabaseCompleteSetup

class NaverDataUploader:
    def __init__(self):
        self.setup = SupabaseCompleteSetup(
            'https://heatmxifhwxppprdzaqf.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o'
        )
        
    def parse_price(self, price_str):
        """가격 파싱 (만원 단위)"""
        if not price_str or price_str == '-':
            return None
            
        # 숫자만 추출
        numbers = re.findall(r'[\d,]+', str(price_str))
        if not numbers:
            return None
            
        try:
            # 쉼표 제거 후 숫자 변환
            num_str = numbers[0].replace(',', '')
            amount = int(num_str)
            
            # 단위 확인
            price_str = str(price_str)
            if '억' in price_str:
                if '천' in price_str or '만' in price_str:
                    # "14억 5,000" 형태
                    if len(numbers) > 1:
                        decimal = int(numbers[1].replace(',', ''))
                        amount = amount * 10000 + decimal
                    else:
                        amount = amount * 10000
                else:
                    # "14억" 형태
                    amount = amount * 10000
            elif '만' in price_str:
                # "5,000만" 형태 - 이미 만원 단위
                pass
            elif '천' in price_str:
                # "3천만원" 형태  
                amount = amount * 1000
                
            return amount
            
        except Exception:
            return None
    
    def parse_area(self, area_str):
        """면적 파싱 (㎡, 평)"""
        if not area_str or area_str == '-':
            return None, None
            
        try:
            # 숫자 추출
            numbers = re.findall(r'[\d.]+', str(area_str))
            if not numbers:
                return None, None
                
            area_num = float(numbers[0])
            
            if '㎡' in str(area_str):
                # ㎡ -> 평 변환
                sqm = area_num
                pyeong = sqm / 3.3058
            elif '평' in str(area_str):
                # 평 -> ㎡ 변환  
                pyeong = area_num
                sqm = pyeong * 3.3058
            else:
                # 단위 없으면 ㎡로 가정
                sqm = area_num
                pyeong = sqm / 3.3058
                
            return round(sqm, 2), round(pyeong, 2)
            
        except Exception:
            return None, None
    
    def parse_floor(self, floor_str):
        """층 정보 파싱"""
        if not floor_str:
            return None
            
        # "1/14층" 형태에서 현재층/총층 추출
        floor_match = re.search(r'(\d+)/(\d+)층', str(floor_str))
        if floor_match:
            current_floor = int(floor_match.group(1))
            total_floors = int(floor_match.group(2))
            return f"{current_floor}/{total_floors}"
        
        # "14층" 형태
        floor_match = re.search(r'(\d+)층', str(floor_str))
        if floor_match:
            return floor_match.group(1)
            
        return None
    
    def upload_complex_info(self, data):
        """단지 기본 정보 업로드"""
        print("🏢 단지 기본 정보 업로드 중...")
        
        basic_info = data.get('complex_basic_info', {})
        
        # 기본 정보 추출
        complex_data = {
            'complex_id': str(basic_info.get('complex_id', '')),
            'complex_name': basic_info.get('complexName', ''),
            'construction_year': None,
            'total_units': None,
            'source_url': basic_info.get('source_url', ''),
            'address_road': '경기도 성남시 분당구 정자일로 95',  # 임시 주소
            'city': '경기도',
            'gu': '성남시',
            'dong': '분당구',
            'latitude': 37.36286,  # 임시 좌표
            'longitude': 127.115578
        }
        
        # 건축년도 파싱
        completion_year = basic_info.get('completionYear')
        if completion_year:
            year_match = re.search(r'(\d{4})', str(completion_year))
            if year_match:
                complex_data['construction_year'] = int(year_match.group(1))
        
        # 세대수 파싱
        total_households = basic_info.get('totalHouseholds')
        if total_households:
            households_match = re.search(r'(\d+)', str(total_households))
            if households_match:
                complex_data['total_units'] = int(households_match.group(1))
        
        try:
            # upsert로 중복 방지
            result = self.setup.supabase.table('apartment_complexes')\
                .upsert(complex_data, on_conflict='complex_id')\
                .execute()
            
            print(f"✅ 단지 정보 업로드 완료: {complex_data['complex_name']}")
            return True
            
        except Exception as e:
            print(f"❌ 단지 정보 업로드 실패: {e}")
            return False
    
    def upload_current_listings(self, data):
        """현재 매물 정보 업로드"""
        print("🏷️ 현재 매물 정보 업로드 중...")
        
        basic_info = data.get('complex_basic_info', {})
        complex_id = str(basic_info.get('complex_id', ''))
        listings = data.get('current_listings', [])
        
        if not complex_id or not listings:
            print("⚠️ 단지 ID 또는 매물 정보가 없습니다.")
            return False
        
        uploaded_count = 0
        
        for listing in listings:
            try:
                # 가격 정보 파싱
                price = self.parse_price(listing.get('price', ''))
                monthly_rent = self.parse_price(listing.get('monthly_rent', ''))
                
                # 면적 정보 파싱
                area_sqm, area_pyeong = self.parse_area(listing.get('area', ''))
                
                # 층 정보 파싱
                floor_info = self.parse_floor(listing.get('floor', ''))
                
                listing_data = {
                    'complex_id': complex_id,
                    'deal_type': listing.get('deal_type', ''),
                    'price_amount': price,
                    'monthly_rent': monthly_rent,
                    'area_sqm': area_sqm,
                    'area_pyeong': area_pyeong,
                    'floor_info': floor_info,
                    'description': listing.get('text', ''),
                    'listing_date': date.today().isoformat()
                }
                
                # 전세/월세 구분
                if listing_data['deal_type'] == '전세' and price:
                    listing_data['deposit_amount'] = price
                    listing_data['price_amount'] = None
                
                result = self.setup.supabase.table('current_listings')\
                    .insert(listing_data)\
                    .execute()
                
                uploaded_count += 1
                
            except Exception as e:
                print(f"⚠️ 매물 업로드 오류: {e}")
                continue
        
        print(f"✅ 현재 매물 업로드 완료: {uploaded_count}/{len(listings)}개")
        return uploaded_count > 0
    
    def upload_transaction_history(self, data):
        """실거래가 정보 업로드"""
        print("💰 실거래가 정보 업로드 중...")
        
        basic_info = data.get('complex_basic_info', {})
        complex_id = str(basic_info.get('complex_id', ''))
        transactions = data.get('transaction_history', [])
        
        if not complex_id or not transactions:
            print("⚠️ 단지 ID 또는 거래 정보가 없습니다.")
            return False
        
        uploaded_count = 0
        
        for transaction in transactions:
            try:
                match_text = transaction.get('match_text', '')
                if not match_text:
                    continue
                
                # 거래 정보 파싱 (예: "2024.01 매매 14억 5,000만원 121㎡")
                # 날짜 파싱
                date_match = re.search(r'(\d{4})\.(\d{1,2})', match_text)
                transaction_date = None
                if date_match:
                    year = int(date_match.group(1))
                    month = int(date_match.group(2))
                    transaction_date = date(year, month, 1)
                
                # 거래 타입 파싱
                transaction_type = '매매'
                if '전세' in match_text:
                    transaction_type = '전세'
                elif '월세' in match_text:
                    transaction_type = '월세'
                
                # 가격 파싱
                price = self.parse_price(match_text)
                
                # 면적 파싱
                area_sqm, area_pyeong = self.parse_area(match_text)
                
                # 층 정보 파싱
                floor_info = self.parse_floor(match_text)
                
                transaction_data = {
                    'complex_id': complex_id,
                    'transaction_type': transaction_type,
                    'price_amount': price,
                    'area_sqm': area_sqm,
                    'area_pyeong': area_pyeong,
                    'floor_info': floor_info,
                    'transaction_date': transaction_date.isoformat() if transaction_date else None
                }
                
                # 유효한 데이터만 업로드
                if price and price > 0:
                    result = self.setup.supabase.table('transaction_history')\
                        .insert(transaction_data)\
                        .execute()
                    
                    uploaded_count += 1
                
            except Exception as e:
                print(f"⚠️ 거래 내역 업로드 오류: {e}")
                continue
        
        print(f"✅ 실거래가 업로드 완료: {uploaded_count}/{len(transactions)}개")
        return uploaded_count > 0
    
    def upload_complete_data(self):
        """전체 데이터 업로드"""
        print("🚀 네이버 크롤링 데이터 완전 업로드 시작!")
        print("=" * 50)
        
        # 크롤링 데이터 로드
        data_file = Path("modules/naver-crawler/data/output/complex_2592_comprehensive_20250714_104354.json")
        
        if not data_file.exists():
            print("❌ 크롤링 데이터 파일을 찾을 수 없습니다.")
            return False
        
        with open(data_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        print(f"📊 크롤링 데이터 로드 완료")
        
        # 1. 단지 기본 정보 업로드
        complex_success = self.upload_complex_info(data)
        
        # 2. 현재 매물 정보 업로드
        listings_success = self.upload_current_listings(data)
        
        # 3. 실거래가 정보 업로드
        transactions_success = self.upload_transaction_history(data)
        
        # 결과 출력
        print("\n" + "=" * 50)
        if complex_success and listings_success and transactions_success:
            print("🎉 모든 데이터 업로드 완료!")
            print("\n📊 업로드 결과:")
            print("✅ 단지 기본 정보")
            print("✅ 현재 매물 정보")
            print("✅ 실거래가 정보")
        else:
            print("⚠️ 일부 데이터 업로드에 문제가 있었습니다.")
            print(f"단지 정보: {'✅' if complex_success else '❌'}")
            print(f"매물 정보: {'✅' if listings_success else '❌'}")
            print(f"거래 정보: {'✅' if transactions_success else '❌'}")
        
        return True

def main():
    uploader = NaverDataUploader()
    uploader.upload_complete_data()

if __name__ == "__main__":
    main()