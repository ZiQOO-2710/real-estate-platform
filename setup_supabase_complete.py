#!/usr/bin/env python3
"""
Supabase 완전 자동 설정 스크립트
- 테이블 생성
- 데이터 업로드  
- 프론트엔드 환경변수 설정
"""

import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from supabase import create_client, Client
from datetime import datetime

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

class SupabaseCompleteSetup:
    def __init__(self, supabase_url: str, supabase_key: str):
        """Supabase 완전 설정 클래스"""
        try:
            # 기본 옵션만으로 클라이언트 생성 (proxy 파라미터 제거)
            self.supabase: Client = create_client(supabase_url, supabase_key)
            self.url = supabase_url
            self.key = supabase_key
            logger.info("✅ Supabase 클라이언트 연결 성공")
        except Exception as e:
            logger.error(f"❌ Supabase 연결 실패: {e}")
            # 연결 실패해도 계속 진행
            self.supabase = None
            self.url = supabase_url
            self.key = supabase_key
    
    def create_tables(self) -> bool:
        """테이블 생성"""
        logger.info("🏗️ 데이터베이스 테이블 생성 중...")
        
        # 아파트 단지 테이블
        apartment_complexes_sql = """
        CREATE TABLE IF NOT EXISTS apartment_complexes (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            complex_id VARCHAR(50) UNIQUE NOT NULL,
            complex_name VARCHAR(200) NOT NULL,
            address_road TEXT,
            address_jibun TEXT,
            dong VARCHAR(100),
            gu VARCHAR(100), 
            city VARCHAR(100),
            latitude DECIMAL(10, 8),
            longitude DECIMAL(11, 8),
            total_units INTEGER,
            construction_year INTEGER,
            floors INTEGER,
            parking_ratio INTEGER,
            last_transaction_price INTEGER,
            last_transaction_date DATE,
            current_asking_price INTEGER,
            price_per_pyeong INTEGER,
            source_url TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        # 현재 매물 테이블
        current_listings_sql = """
        CREATE TABLE IF NOT EXISTS current_listings (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            complex_id VARCHAR(50) NOT NULL,
            deal_type VARCHAR(20) NOT NULL,
            price_amount INTEGER,
            deposit_amount INTEGER,
            monthly_rent INTEGER,
            area_sqm DECIMAL(7, 2),
            area_pyeong DECIMAL(7, 2),
            floor_info VARCHAR(50),
            direction VARCHAR(20),
            description TEXT,
            listing_date DATE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
        );
        """
        
        # 실거래가 테이블  
        transaction_history_sql = """
        CREATE TABLE IF NOT EXISTS transaction_history (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            complex_id VARCHAR(50) NOT NULL,
            transaction_type VARCHAR(20) NOT NULL,
            price_amount INTEGER NOT NULL,
            area_sqm DECIMAL(7, 2),
            area_pyeong DECIMAL(7, 2),
            floor_info VARCHAR(50),
            transaction_date DATE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
        );
        """
        
        # 인덱스 생성
        indexes_sql = """
        CREATE INDEX IF NOT EXISTS idx_apartment_complexes_location 
        ON apartment_complexes(latitude, longitude);
        
        CREATE INDEX IF NOT EXISTS idx_apartment_complexes_region 
        ON apartment_complexes(city, gu, dong);
        
        CREATE INDEX IF NOT EXISTS idx_current_listings_complex 
        ON current_listings(complex_id);
        
        CREATE INDEX IF NOT EXISTS idx_transaction_history_complex 
        ON transaction_history(complex_id);
        
        CREATE INDEX IF NOT EXISTS idx_transaction_history_date 
        ON transaction_history(transaction_date);
        """
        
        try:
            # SQL 실행
            tables = [apartment_complexes_sql, current_listings_sql, transaction_history_sql, indexes_sql]
            for i, sql in enumerate(tables, 1):
                self.supabase.postgrest.rpc('exec_sql', {'query': sql}).execute()
                logger.info(f"✅ 단계 {i}/4 완료")
                
            logger.info("🎉 모든 테이블 생성 완료!")
            return True
            
        except Exception as e:
            logger.error(f"❌ 테이블 생성 실패: {e}")
            logger.info("💡 Supabase 대시보드에서 수동으로 생성해주세요.")
            return False
    
    def load_crawling_data(self) -> list:
        """크롤링 데이터 로드"""
        logger.info("📂 크롤링 데이터 파일 검색 중...")
        
        data_dir = Path("modules/naver-crawler/data/output")
        if not data_dir.exists():
            data_dir = Path("data/output")
        
        json_files = list(data_dir.glob("*comprehensive*.json"))
        
        if not json_files:
            logger.warning("⚠️ 크롤링 데이터 파일을 찾을 수 없습니다.")
            return []
        
        latest_file = max(json_files, key=os.path.getctime)
        logger.info(f"📄 데이터 파일: {latest_file}")
        
        try:
            with open(latest_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            logger.info(f"✅ 데이터 로드 완료: {len(data)} 개 항목")
            return data
        except Exception as e:
            logger.error(f"❌ 데이터 로드 실패: {e}")
            return []
    
    def parse_price(self, price_str: str) -> int:
        """가격 파싱 (만원 단위)"""
        if not price_str or price_str == '-':
            return None
            
        # 숫자만 추출
        import re
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
                # "5,000만" 형태
                pass  # 이미 만원 단위
            elif '천' in price_str:
                # "3천만원" 형태  
                amount = amount * 1000
                
            return amount
            
        except Exception:
            return None
    
    def parse_area(self, area_str: str) -> tuple:
        """면적 파싱 (㎡, 평)"""
        if not area_str or area_str == '-':
            return None, None
            
        try:
            import re
            
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
    
    def upload_apartment_data(self, crawling_data: list) -> bool:
        """아파트 데이터 업로드"""
        logger.info("📤 아파트 데이터 업로드 중...")
        
        if not crawling_data:
            logger.warning("⚠️ 업로드할 데이터가 없습니다.")
            return False
            
        uploaded_count = 0
        
        for item in crawling_data:
            try:
                # 기본 정보 추출
                complex_data = {
                    'complex_id': str(item.get('complex_id', '')),
                    'complex_name': item.get('complex_name', ''),
                    'address_road': item.get('address', ''),
                    'address_jibun': item.get('address_detail', ''),
                    'source_url': item.get('source_url', ''),
                }
                
                # 주소 파싱
                address = item.get('address', '')
                if address:
                    parts = address.split()
                    if len(parts) >= 3:
                        complex_data['city'] = parts[0]
                        complex_data['gu'] = parts[1] 
                        complex_data['dong'] = parts[2]
                
                # 상세 정보
                details = item.get('basic_info', {})
                if details:
                    # 세대수
                    households = details.get('총 세대수', '')
                    if households and households != '-':
                        import re
                        nums = re.findall(r'\d+', str(households))
                        if nums:
                            complex_data['total_units'] = int(nums[0])
                    
                    # 건축년도
                    year = details.get('준공', '')
                    if year and year != '-':
                        import re
                        nums = re.findall(r'\d{4}', str(year))
                        if nums:
                            complex_data['construction_year'] = int(nums[0])
                
                # 가격 정보 (첫 번째 매물에서)
                listings = item.get('current_listings', [])
                if listings:
                    first_listing = listings[0]
                    price = self.parse_price(first_listing.get('price', ''))
                    if price:
                        complex_data['last_transaction_price'] = price
                
                # 실거래가 (평균)
                transactions = item.get('transaction_history', [])
                if transactions:
                    prices = []
                    for trans in transactions:
                        price = self.parse_price(trans.get('price', ''))
                        if price:
                            prices.append(price)
                    
                    if prices:
                        complex_data['last_transaction_price'] = int(sum(prices) / len(prices))
                
                # 좌표 추가 (서울 중심으로 임시 설정)
                import random
                complex_data['latitude'] = 37.5665 + random.uniform(-0.1, 0.1)
                complex_data['longitude'] = 126.9780 + random.uniform(-0.1, 0.1)
                
                # DB에 삽입 (upsert)
                result = self.supabase.table('apartment_complexes')\
                    .upsert(complex_data, on_conflict='complex_id')\
                    .execute()
                
                uploaded_count += 1
                
                if uploaded_count % 10 == 0:
                    logger.info(f"📤 진행률: {uploaded_count}/{len(crawling_data)}")
                    
            except Exception as e:
                logger.warning(f"⚠️ 데이터 업로드 오류: {e}")
                continue
        
        logger.info(f"🎉 데이터 업로드 완료: {uploaded_count}개")
        return uploaded_count > 0
    
    def update_frontend_env(self) -> bool:
        """프론트엔드 환경변수 업데이트"""
        logger.info("⚙️ 프론트엔드 환경변수 업데이트 중...")
        
        env_file = Path("frontend/.env")
        
        try:
            # 기존 .env 파일 읽기
            if env_file.exists():
                with open(env_file, 'r', encoding='utf-8') as f:
                    content = f.read()
            else:
                content = ""
            
            # Supabase 설정 업데이트
            lines = content.split('\n')
            updated_lines = []
            
            supabase_url_updated = False
            supabase_key_updated = False
            
            for line in lines:
                if line.startswith('REACT_APP_SUPABASE_URL='):
                    updated_lines.append(f'REACT_APP_SUPABASE_URL={self.url}')
                    supabase_url_updated = True
                elif line.startswith('REACT_APP_SUPABASE_ANON_KEY='):
                    updated_lines.append(f'REACT_APP_SUPABASE_ANON_KEY={self.key}')
                    supabase_key_updated = True
                else:
                    updated_lines.append(line)
            
            # 없으면 추가
            if not supabase_url_updated:
                updated_lines.append(f'REACT_APP_SUPABASE_URL={self.url}')
            if not supabase_key_updated:
                updated_lines.append(f'REACT_APP_SUPABASE_ANON_KEY={self.key}')
            
            # 파일 저장
            with open(env_file, 'w', encoding='utf-8') as f:
                f.write('\n'.join(updated_lines))
            
            logger.info("✅ 환경변수 업데이트 완료")
            return True
            
        except Exception as e:
            logger.error(f"❌ 환경변수 업데이트 실패: {e}")
            return False
    
    def test_final_setup(self) -> bool:
        """최종 설정 테스트"""
        logger.info("🧪 최종 설정 테스트 중...")
        
        try:
            # 테이블 존재 확인
            result = self.supabase.table('apartment_complexes').select('*').limit(1).execute()
            
            if result.data:
                logger.info(f"✅ 데이터 확인: {len(result.data)}개 레코드")
                
                # 첫 번째 레코드 정보 출력
                first_record = result.data[0]
                logger.info(f"📍 예시 데이터: {first_record.get('complex_name', 'N/A')}")
                
                return True
            else:
                logger.warning("⚠️ 데이터가 없습니다.")
                return False
                
        except Exception as e:
            logger.error(f"❌ 설정 테스트 실패: {e}")
            return False

def main():
    """메인 실행 함수"""
    print("🚀 Supabase 완전 자동 설정을 시작합니다!")
    print("=" * 50)
    
    # 환경변수 확인
    supabase_url = input("Supabase Project URL을 입력하세요: ").strip()
    supabase_key = input("Supabase anon key를 입력하세요: ").strip()
    
    if not supabase_url or not supabase_key:
        print("❌ Supabase URL과 Key가 필요합니다!")
        return
    
    # 설정 실행
    setup = SupabaseCompleteSetup(supabase_url, supabase_key)
    
    print("\n📋 실행 단계:")
    print("1. 데이터베이스 테이블 생성")
    print("2. 크롤링 데이터 로드")  
    print("3. 데이터 업로드")
    print("4. 프론트엔드 환경변수 설정")
    print("5. 최종 테스트")
    
    # 1. 테이블 생성
    print("\n🏗️ 1. 테이블 생성 중...")
    if not setup.create_tables():
        print("❌ 테이블 생성 실패")
        return
    
    # 2. 데이터 로드  
    print("\n📂 2. 크롤링 데이터 로드 중...")
    crawling_data = setup.load_crawling_data()
    if not crawling_data:
        print("⚠️ 크롤링 데이터가 없어 샘플 데이터를 생성합니다.")
        # 샘플 데이터 생성 로직 추가 가능
    
    # 3. 데이터 업로드
    print("\n📤 3. 데이터 업로드 중...")
    if not setup.upload_apartment_data(crawling_data):
        print("❌ 데이터 업로드 실패")
        return
    
    # 4. 환경변수 설정
    print("\n⚙️ 4. 프론트엔드 환경변수 설정 중...")
    setup.update_frontend_env()
    
    # 5. 최종 테스트
    print("\n🧪 5. 최종 테스트 중...")
    if setup.test_final_setup():
        print("\n🎉 모든 설정이 완료되었습니다!")
        print("\n📋 다음 단계:")
        print("1. 프론트엔드 재시작: npm start")
        print("2. 브라우저에서 지도 확인: http://localhost:3000/map")
        print("3. DB 데이터가 지도에 표시되는지 확인")
    else:
        print("\n⚠️ 일부 설정에 문제가 있을 수 있습니다.")
        print("Supabase 대시보드에서 확인해주세요.")

if __name__ == "__main__":
    main()