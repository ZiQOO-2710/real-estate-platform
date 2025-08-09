#!/usr/bin/env python3
"""
실거래가 및 매물 데이터 샘플 생성 스크립트
빈 데이터베이스에 테스트용 실제 데이터를 추가합니다.
"""

import sqlite3
import random
from datetime import datetime, timedelta
import json

# 서울시 실제 단지명과 지역 데이터
SEOUL_COMPLEXES = [
    {"name": "래미안 강남 팰리스", "region": "강남구", "address": "서울특별시 강남구 삼성동", "lat": 37.5132, "lng": 127.0548},
    {"name": "아크로 서울 포레스트", "region": "성동구", "address": "서울특별시 성동구 성수동1가", "lat": 37.5494, "lng": 127.0457},
    {"name": "롯데캐슬 골드파크", "region": "구로구", "address": "서울특별시 구로구 구로동", "lat": 37.4954, "lng": 126.8871},
    {"name": "힐스테이트 청담", "region": "강남구", "address": "서울특별시 강남구 청담동", "lat": 37.5172, "lng": 127.0473},
    {"name": "자이 한남", "region": "용산구", "address": "서울특별시 용산구 한남동", "lat": 37.5347, "lng": 127.0026},
    {"name": "래미안 대치 팰리스", "region": "강남구", "address": "서울특별시 강남구 대치동", "lat": 37.4951, "lng": 127.0587},
    {"name": "디에이치 자이개포", "region": "강남구", "address": "서울특별시 강남구 개포동", "lat": 37.4838, "lng": 127.0648},
    {"name": "트리마제 송파", "region": "송파구", "address": "서울특별시 송파구 송파동", "lat": 37.5048, "lng": 127.1139},
    {"name": "헬리오시티", "region": "송파구", "address": "서울특별시 송파구 문정동", "lat": 37.4842, "lng": 127.1223},
    {"name": "잠실 리센츠", "region": "송파구", "address": "서울특별시 송파구 잠실동", "lat": 37.5133, "lng": 127.0983},
    {"name": "아크로비스타", "region": "동작구", "address": "서울특별시 동작구 흑석동", "lat": 37.5066, "lng": 126.9615},
    {"name": "래미안 원베일리", "region": "서초구", "address": "서울특별시 서초구 원지동", "lat": 37.4659, "lng": 127.0465},
    {"name": "힐스테이트 광교", "region": "강남구", "address": "서울특별시 강남구 논현동", "lat": 37.5109, "lng": 127.0284},
    {"name": "푸르지오 시티", "region": "영등포구", "address": "서울특별시 영등포구 여의도동", "lat": 37.5219, "lng": 126.9245},
    {"name": "상암 DMC 자이", "region": "마포구", "address": "서울특별시 마포구 상암동", "lat": 37.5794, "lng": 126.8895}
]

def add_sample_molit_data(db_path):
    """MOLIT 실거래 데이터 추가"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("MOLIT 실거래 데이터 추가 중...")
    
    # 기존 데이터 삭제
    cursor.execute("DELETE FROM apartment_transactions;")
    
    sample_data = []
    
    for i in range(500):  # 500개 샘플 데이터
        complex_data = random.choice(SEOUL_COMPLEXES)
        
        # 랜덤 거래 정보 생성
        deal_date = datetime.now() - timedelta(days=random.randint(1, 730))  # 2년 이내
        deal_type = random.choice(['매매', '전세', '월세'])
        
        # 가격 설정 (강남 지역은 더 비싸게)
        if complex_data["region"] in ["강남구", "서초구", "송파구"]:
            base_price = random.randint(80000, 200000)  # 8억~20억
        else:
            base_price = random.randint(40000, 120000)  # 4억~12억
            
        if deal_type == '매매':
            deal_amount = f"{base_price:,}"
        elif deal_type == '전세':
            deal_amount = f"{int(base_price * 0.7):,}"
        else:  # 월세
            deposit = int(base_price * 0.3)
            monthly = random.randint(100, 300)
            deal_amount = f"{deposit:,}/{monthly}"
        
        area = random.choice([59, 84, 101, 134, 168])  # 일반적인 아파트 면적
        floor = random.randint(1, 30)
        built_year = random.randint(2000, 2023)
        
        sample_data.append((
            i + 1,  # id
            "서울특별시",  # sido
            complex_data["region"],  # sigungu
            "동",  # dong
            complex_data["address"],  # address
            complex_data["region"],  # region_name
            complex_data["name"],  # apartment_name
            deal_type,  # deal_type
            deal_amount,  # deal_amount
            str(area),  # area
            complex_data["lat"],  # latitude
            complex_data["lng"],  # longitude
            deal_date.year,  # deal_year
            deal_date.month,  # deal_month
            deal_date.strftime('%Y-%m-%d'),  # deal_date
            datetime.now().isoformat(),  # crawled_at
            datetime.now().isoformat()   # created_at
        ))
    
    cursor.executemany("""
        INSERT INTO apartment_transactions (
            id, sido, sigungu, dong, address, region_name, apartment_name,
            deal_type, deal_amount, area, latitude, longitude, 
            deal_year, deal_month, deal_date, crawled_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, sample_data)
    
    conn.commit()
    
    # 결과 확인
    cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
    count = cursor.fetchone()[0]
    print(f"MOLIT 실거래 데이터 {count}개 추가 완료")
    
    conn.close()

def add_sample_naver_data(db_path):
    """Naver 매물 데이터 추가"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("네이버 매물 데이터 추가 중...")
    
    # 기존 데이터 삭제
    cursor.execute("DELETE FROM apartment_complexes;")
    cursor.execute("DELETE FROM current_listings;")
    
    complex_data = []
    listing_data = []
    
    for i, complex_info in enumerate(SEOUL_COMPLEXES):
        complex_id = f"complex_{i+1:04d}"
        
        # 단지 데이터 (실제 스키마에 맞춤)
        complex_data.append((
            i + 1,  # id
            complex_id,  # complex_id
            complex_info["name"],  # complex_name
            complex_info["name"],  # name (중복이지만 필수 컬럼)
            complex_info["address"],  # address
            complex_info["lat"],  # latitude
            complex_info["lng"],  # longitude
            datetime.now().isoformat(),  # created_at
            datetime.now().isoformat()   # updated_at
        ))
        
        # 각 단지마다 5-15개 매물 생성
        num_listings = random.randint(5, 15)
        
        for j in range(num_listings):
            listing_id = f"listing_{i+1:04d}_{j+1:03d}"
            deal_type = random.choice(['매매', '전세', '월세'])
            
            # 가격 설정
            if complex_info["region"] in ["강남구", "서초구", "송파구"]:
                base_price = random.randint(60000, 180000)
            else:
                base_price = random.randint(30000, 100000)
            
            if deal_type == '매매':
                price_amount = base_price
                price_unit = '만원'
            elif deal_type == '전세':
                price_amount = int(base_price * 0.6)
                price_unit = '만원'
            else:  # 월세
                price_amount = random.randint(80, 250)
                price_unit = '만원'
            
            area = random.choice([59, 84, 101, 134])
            floor = random.randint(1, 30)
            
            listing_data.append((
                len(listing_data) + 1,  # id
                complex_id,  # complex_id
                f"{area}㎡ | {floor}층 | {deal_type}",  # description
                f"매물정보: {deal_type} {price_amount}{price_unit}",  # raw_text
                price_amount,  # price
                price_amount,  # price_amount
                deal_type,  # deal_type
                datetime.now().isoformat(),  # crawled_at
                datetime.now().isoformat(),  # created_at
                datetime.now().isoformat()   # updated_at
            ))
    
    # 단지 데이터 삽입
    cursor.executemany("""
        INSERT INTO apartment_complexes (
            id, complex_id, complex_name, name, address, latitude, longitude, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, complex_data)
    
    # 매물 데이터 삽입
    cursor.executemany("""
        INSERT INTO current_listings (
            id, complex_id, description, raw_text, price, price_amount, deal_type, crawled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, listing_data)
    
    conn.commit()
    
    # 결과 확인
    cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
    complex_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM current_listings") 
    listing_count = cursor.fetchone()[0]
    
    print(f"네이버 단지 데이터 {complex_count}개 추가 완료")
    print(f"네이버 매물 데이터 {listing_count}개 추가 완료")
    
    conn.close()

def main():
    """메인 실행 함수"""
    print("샘플 부동산 데이터 생성 시작...")
    print("=" * 50)
    
    # MOLIT 데이터베이스 경로
    molit_db = "C:/Users/ksj27/Projects/real-estate-platform/molit_complete_data.db"
    
    # Naver 데이터베이스 경로  
    naver_db = "C:/Users/ksj27/Projects/real-estate-platform/modules/naver-crawler/data/naver_real_estate.db"
    
    try:
        # 샘플 데이터 추가
        add_sample_molit_data(molit_db)
        add_sample_naver_data(naver_db)
        
        print("=" * 50)
        print("샘플 데이터 생성 완료!")
        print("이제 대시보드에서 실거래가와 매물 호가를 확인할 수 있습니다.")
        print("API 서버를 재시작하면 새 데이터가 반영됩니다.")
        
    except Exception as e:
        print(f"오류 발생: {e}")
        return False
        
    return True

if __name__ == "__main__":
    main()