#!/usr/bin/env python3
"""
Supabase 테이블 구조 탐색 스크립트
- PostgreSQL 메타데이터 쿼리로 실제 테이블 이름 찾기
"""

import requests
import json

def discover_supabase_tables(supabase_url, supabase_key):
    """Supabase 테이블 구조 탐색"""
    headers = {
        'apikey': supabase_key,
        'Authorization': f'Bearer {supabase_key}',
        'Content-Type': 'application/json'
    }
    
    print("🔍 Supabase 테이블 구조 탐색 중...")
    print(f"📍 URL: {supabase_url}")
    print("=" * 50)
    
    # 1. PostgreSQL 시스템 테이블에서 사용자 테이블 목록 조회
    try:
        # pg_tables 시스템 뷰로 테이블 목록 조회
        rpc_url = f"{supabase_url}/rest/v1/rpc/get_table_list"
        
        # RPC 함수가 없을 수 있으므로 다른 방법 시도
        # information_schema를 직접 쿼리
        query_url = f"{supabase_url}/rest/v1/rpc/exec_sql"
        
        sql_query = """
        SELECT table_name, table_type 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name;
        """
        
        payload = {"query": sql_query}
        response = requests.post(query_url, headers=headers, json=payload)
        
        if response.status_code == 200:
            result = response.json()
            print("✅ SQL 쿼리 성공!")
            print(f"결과: {result}")
            return result
        else:
            print(f"❌ SQL 쿼리 실패: {response.status_code}")
            print(f"응답: {response.text}")
            
    except Exception as e:
        print(f"❌ 메타데이터 쿼리 오류: {e}")
    
    # 2. 일반적인 REST API 엔드포인트 스캔
    print("\n🔍 일반적인 엔드포인트 스캔...")
    
    # OpenAPI/Swagger 스키마 확인
    try:
        schema_url = f"{supabase_url}/rest/v1/"
        response = requests.get(schema_url, headers=headers)
        
        if response.status_code == 200:
            print("✅ REST API 루트 접근 성공")
            print(f"응답 헤더: {dict(response.headers)}")
        else:
            print(f"❌ REST API 루트 접근 실패: {response.status_code}")
            
    except Exception as e:
        print(f"❌ REST API 스캔 오류: {e}")
    
    # 3. 공통 테이블 이름들을 하나씩 시도 (더 상세한 오류 정보 수집)
    print("\n🔍 개별 테이블 접근 시도...")
    common_tables = [
        'apartments', 'apartment_complexes', 'complexes', 'listings', 
        'properties', 'real_estate', 'naver_data', 'molit_data',
        'crawling_results', 'apartment_listings', 'property_data',
        'real_estate_data', 'transaction_data', 'building_data'
    ]
    
    found_tables = []
    
    for table in common_tables:
        try:
            api_url = f"{supabase_url}/rest/v1/{table}"
            response = requests.get(api_url, headers={**headers, 'Range': '0-0'})
            
            print(f"📋 {table}: {response.status_code}")
            
            if response.status_code == 200:
                print(f"   ✅ 접근 가능!")
                # 응답 헤더에서 총 개수 확인
                content_range = response.headers.get('Content-Range', '')
                if content_range:
                    print(f"   📊 Content-Range: {content_range}")
                
                data = response.json()
                print(f"   📝 샘플 데이터: {len(data)}개 레코드")
                if data:
                    print(f"   🔑 첫 번째 레코드 키: {list(data[0].keys())}")
                
                found_tables.append(table)
                
            elif response.status_code == 404:
                print(f"   ❌ 테이블 없음")
            elif response.status_code == 401:
                print(f"   🔒 인증 실패")
            elif response.status_code == 403:
                print(f"   🚫 권한 없음")
            else:
                print(f"   ⚠️ 기타 오류")
                print(f"      응답: {response.text[:100]}")
                
        except Exception as e:
            print(f"   ❌ 오류: {e}")
    
    return found_tables

def main():
    """메인 실행 함수"""
    supabase_url = "https://dbwcpgdpjeiezwgbijcj.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid2NwZ2RwamVpZXp3Z2JpamNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MTcwMDIsImV4cCI6MjA2NzA5MzAwMn0.Or7jCm4tYfYcyPDP3S_nhkWcUElSG7kwxGsHy2Ss4iU"
    
    found_tables = discover_supabase_tables(supabase_url, supabase_key)
    
    print(f"\n🎉 발견된 테이블: {len(found_tables)}개")
    for table in found_tables:
        print(f"   - {table}")
    
    if not found_tables:
        print("\n💡 추가 시도 방법:")
        print("1. Supabase 대시보드에서 테이블 이름 확인")
        print("2. 다른 API 키 (service_role) 시도")
        print("3. PostgreSQL 직접 연결 시도")

if __name__ == "__main__":
    main()