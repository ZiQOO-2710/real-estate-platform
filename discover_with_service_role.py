#!/usr/bin/env python3
"""
Service Role 키로 Supabase 테이블 탐색
"""

import requests
import json

def discover_with_service_role(supabase_url, service_key):
    """Service Role 키로 테이블 구조 탐색"""
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json'
    }
    
    print("🔍 Service Role로 Supabase 테이블 탐색...")
    print(f"📍 URL: {supabase_url}")
    print("=" * 50)
    
    # 1. OpenAPI 스키마 확인
    try:
        schema_url = f"{supabase_url}/rest/v1/"
        response = requests.get(schema_url, headers=headers)
        
        if response.status_code == 200:
            print("✅ OpenAPI 스키마 접근 성공")
            
            schema_data = response.json()
            
            # paths에서 테이블 정보 추출
            if 'paths' in schema_data:
                print("📋 발견된 엔드포인트:")
                for path in schema_data['paths'].keys():
                    if path.startswith('/') and not path.startswith('/rpc/'):
                        table_name = path.strip('/')
                        if table_name and '/' not in table_name:
                            print(f"   - {table_name}")
                            
                            # 실제 데이터 확인
                            try:
                                test_url = f"{supabase_url}/rest/v1/{table_name}"
                                test_response = requests.get(test_url, headers={**headers, 'Range': '0-0'})
                                
                                if test_response.status_code == 200:
                                    content_range = test_response.headers.get('Content-Range', '')
                                    print(f"     ✅ 접근 가능 - {content_range}")
                                    
                                    # 46,539개 레코드를 찾았다면 이 테이블이 목표!
                                    if '46539' in content_range or '46,539' in content_range:
                                        print(f"     🎯 목표 테이블 발견! {table_name}")
                                        return table_name
                                        
                                else:
                                    print(f"     ❌ 접근 불가: {test_response.status_code}")
                                    
                            except Exception as e:
                                print(f"     ❌ 테스트 오류: {e}")
            else:
                print("⚠️ paths 정보 없음")
                print(f"스키마 키: {list(schema_data.keys())}")
                
        else:
            print(f"❌ OpenAPI 스키마 접근 실패: {response.status_code}")
            print(f"응답: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ 스키마 확인 오류: {e}")
    
    # 2. 더 많은 테이블 이름 시도
    print(f"\n🔍 확장된 테이블 이름 검색...")
    extended_tables = [
        # 기본
        'apartments', 'apartment_complexes', 'complexes', 'listings', 
        'properties', 'real_estate', 'naver_data', 'molit_data',
        # 확장
        'apartment_data', 'complex_data', 'listing_data', 'property_listings',
        'realestate_data', 'apartment_info', 'building_info', 'housing_data',
        'naver_complexes', 'naver_listings', 'naver_apartments',
        'molit_complexes', 'molit_listings', 'molit_transactions',
        'crawling_data', 'crawled_data', 'scraped_data',
        'real_estate_complexes', 'real_estate_listings',
        # 한국어 관련
        'apt_data', 'apt_complex', 'apt_listing',
        # 일반적
        'data', 'items', 'records', 'contents', 'info',
        # 테이블 변형
        'tbl_apartments', 'tb_apartments', 't_apartments',
        # PostreSQL 기본
        'public'
    ]
    
    found_tables = []
    
    for table in extended_tables:
        try:
            api_url = f"{supabase_url}/rest/v1/{table}"
            response = requests.get(api_url, headers={**headers, 'Range': '0-0'})
            
            if response.status_code == 200:
                content_range = response.headers.get('Content-Range', '')
                print(f"✅ {table}: {content_range}")
                
                # 46,539개 레코드를 찾았다면!
                if '46539' in content_range or '46,539' in content_range:
                    print(f"🎯 목표 테이블 발견! {table}")
                    return table
                    
                found_tables.append((table, content_range))
                
            elif response.status_code == 404:
                continue  # 조용히 넘어감
            else:
                print(f"⚠️ {table}: {response.status_code} - {response.text[:50]}")
                
        except Exception as e:
            continue  # 조용히 넘어감
    
    if found_tables:
        print(f"\n🎉 발견된 테이블들:")
        for table, content_range in found_tables:
            print(f"   - {table}: {content_range}")
    
    return found_tables

def main():
    """메인 실행 함수"""
    supabase_url = "https://dbwcpgdpjeiezwgbijcj.supabase.co"
    service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid2NwZ2RwamVpZXp3Z2JpamNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUxNzAwMiwiZXhwIjoyMDY3MDkzMDAyfQ.j3k-D58hiYQgzfdLpER1Btf3yD1JmGamw-R7Li3NrQQ"
    
    result = discover_with_service_role(supabase_url, service_key)
    
    if isinstance(result, str):
        print(f"\n🎯 목표 테이블: {result}")
    elif result:
        print(f"\n📋 발견된 테이블: {len(result)}개")
    else:
        print(f"\n❌ 테이블을 찾을 수 없습니다")

if __name__ == "__main__":
    main()