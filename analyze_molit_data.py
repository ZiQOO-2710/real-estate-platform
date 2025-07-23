#!/usr/bin/env python3
"""
국토부 실거래가 DB 데이터 구조 상세 분석
"""

import sqlite3
import json

def analyze_molit_data():
    """국토부 DB 실제 데이터 분석"""
    
    conn = sqlite3.connect("molit_complete_data.db")
    cursor = conn.cursor()
    
    print("🔍 국토부 실거래가 DB 상세 분석")
    print("=" * 50)
    
    # 1. 전체 구조 확인
    cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
    total = cursor.fetchone()[0]
    print(f"📊 총 레코드: {total:,}개")
    
    # 2. 각 컬럼의 NULL 비율 확인
    print("\n📋 컬럼별 데이터 현황:")
    cursor.execute("PRAGMA table_info(apartment_transactions)")
    columns = [row[1] for row in cursor.fetchall()]
    
    for col in columns[:10]:  # 주요 컬럼만
        cursor.execute(f"SELECT COUNT(*) FROM apartment_transactions WHERE {col} IS NOT NULL AND {col} != ''")
        not_null = cursor.fetchone()[0]
        ratio = (not_null / total) * 100
        print(f"   {col}: {not_null:,}개 ({ratio:.1f}%)")
    
    # 3. 실제 데이터 샘플 확인 (api_data 컬럼 포함)
    print("\n📄 실제 데이터 샘플:")
    cursor.execute("""
        SELECT apartment_name, legal_dong, jibun, road_name, api_data 
        FROM apartment_transactions 
        WHERE api_data IS NOT NULL 
        AND api_data != ''
        LIMIT 3
    """)
    
    samples = cursor.fetchall()
    for i, sample in enumerate(samples, 1):
        print(f"\n--- 샘플 {i} ---")
        print(f"아파트명: {sample[0]}")
        print(f"법정동: {sample[1]}")
        print(f"지번: {sample[2]}")
        print(f"도로명: {sample[3]}")
        
        # api_data JSON 파싱
        if sample[4]:
            try:
                api_json = json.loads(sample[4])
                print("API 데이터 구조:")
                for key, value in list(api_json.items())[:5]:
                    print(f"   {key}: {value}")
                if len(api_json) > 5:
                    print(f"   ... (총 {len(api_json)}개 필드)")
            except:
                print(f"API 데이터 (raw): {sample[4][:100]}...")
    
    # 4. 아파트명이 있는 레코드 확인
    cursor.execute("""
        SELECT COUNT(*) FROM apartment_transactions 
        WHERE apartment_name IS NOT NULL 
        AND apartment_name != ''
        AND length(trim(apartment_name)) > 0
    """)
    apt_with_name = cursor.fetchone()[0]
    print(f"\n🏢 아파트명이 있는 레코드: {apt_with_name:,}개")
    
    if apt_with_name > 0:
        cursor.execute("""
            SELECT apartment_name, legal_dong, jibun 
            FROM apartment_transactions 
            WHERE apartment_name IS NOT NULL 
            AND apartment_name != ''
            AND length(trim(apartment_name)) > 0
            LIMIT 5
        """)
        apt_samples = cursor.fetchall()
        print("아파트명 샘플:")
        for sample in apt_samples:
            print(f"   {sample[0]} | {sample[1]} | {sample[2]}")
    
    # 5. API 데이터에서 정보 추출 시도
    print("\n🔍 API 데이터에서 아파트 정보 추출:")
    cursor.execute("""
        SELECT api_data 
        FROM apartment_transactions 
        WHERE api_data IS NOT NULL 
        AND api_data != ''
        AND api_data LIKE '%아파트%'
        LIMIT 3
    """)
    
    api_samples = cursor.fetchall()
    for i, sample in enumerate(api_samples, 1):
        try:
            api_data = json.loads(sample[0])
            print(f"\nAPI 샘플 {i}:")
            
            # 아파트 관련 필드 찾기
            apt_fields = []
            for key, value in api_data.items():
                if any(keyword in key.lower() for keyword in ['apt', '아파트', 'name', '단지', 'complex']):
                    apt_fields.append((key, value))
            
            if apt_fields:
                for key, value in apt_fields:
                    print(f"   {key}: {value}")
            else:
                # 모든 필드 출력
                for key, value in list(api_data.items())[:3]:
                    print(f"   {key}: {value}")
                    
        except Exception as e:
            print(f"   JSON 파싱 오류: {e}")
    
    conn.close()
    return True

if __name__ == "__main__":
    analyze_molit_data()