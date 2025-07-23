#!/usr/bin/env python3
"""
대용량 Supabase 데이터 다운로드 스크립트
- 46,539개 레코드 전체 다운로드
- 페이지네이션으로 대용량 데이터 처리
- JSON 형태로 백업 생성
"""

import json
import requests
from datetime import datetime
from pathlib import Path
import time

class LargeSupabaseDownloader:
    def __init__(self, supabase_url, supabase_key):
        self.url = supabase_url
        self.key = supabase_key
        self.headers = {
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json',
            'Range-Unit': 'items'
        }
        
    def get_table_count(self, table_name):
        """테이블 총 레코드 수 확인"""
        try:
            api_url = f"{self.url}/rest/v1/{table_name}"
            headers = {**self.headers, 'Prefer': 'count=exact'}
            
            response = requests.head(api_url, headers=headers)
            
            if response.status_code == 200:
                content_range = response.headers.get('Content-Range', '')
                if content_range:
                    # Content-Range: items 0-999/46539 형태에서 총 개수 추출
                    total = content_range.split('/')[-1]
                    if total != '*':
                        return int(total)
            
            # HEAD 방식이 안되면 GET으로 시도
            response = requests.get(api_url + "?select=count", headers=headers)
            if response.status_code == 200:
                content_range = response.headers.get('Content-Range', '')
                if content_range:
                    total = content_range.split('/')[-1]
                    if total != '*':
                        return int(total)
                        
            return None
            
        except Exception as e:
            print(f"❌ {table_name} 개수 확인 오류: {e}")
            return None
    
    def get_table_data_paginated(self, table_name, batch_size=1000):
        """페이지네이션으로 대용량 테이블 데이터 가져오기"""
        try:
            print(f"📊 {table_name} 총 레코드 수 확인 중...")
            total_count = self.get_table_count(table_name)
            
            if total_count is None:
                print(f"⚠️ {table_name} 개수를 확인할 수 없습니다. 기본 다운로드 시도...")
                total_count = 50000  # 추정치
            else:
                print(f"✅ {table_name}: 총 {total_count:,}개 레코드")
            
            all_data = []
            offset = 0
            page = 1
            
            while offset < total_count:
                print(f"📥 {table_name} 페이지 {page} 다운로드 중... ({offset+1}-{min(offset+batch_size, total_count):,}/{total_count:,})")
                
                # Range 헤더로 페이지네이션
                range_header = f"{offset}-{offset + batch_size - 1}"
                headers = {**self.headers, 'Range': range_header}
                
                api_url = f"{self.url}/rest/v1/{table_name}"
                response = requests.get(api_url, headers=headers)
                
                if response.status_code == 200:
                    page_data = response.json()
                    
                    if not page_data:  # 빈 페이지면 종료
                        break
                        
                    all_data.extend(page_data)
                    print(f"   ✅ {len(page_data)}개 레코드 추가 (누적: {len(all_data):,}개)")
                    
                    # 다음 페이지로
                    offset += batch_size
                    page += 1
                    
                    # API 레이트 리밋 방지
                    time.sleep(0.1)
                    
                elif response.status_code == 416:  # Range Not Satisfiable
                    print(f"📋 {table_name} 다운로드 완료 (더 이상 데이터 없음)")
                    break
                    
                else:
                    print(f"❌ {table_name} 페이지 {page} 다운로드 실패: {response.status_code}")
                    print(f"응답: {response.text[:200]}...")
                    break
            
            print(f"🎉 {table_name} 다운로드 완료: {len(all_data):,}개 레코드")
            return all_data
            
        except Exception as e:
            print(f"❌ {table_name} 다운로드 오류: {e}")
            return []
    
    def get_all_tables(self):
        """모든 테이블 목록 시도"""
        # 일반적인 테이블들 시도
        common_tables = [
            # 부동산 관련
            'apartments',
            'apartment_complexes', 
            'complexes',
            'listings',
            'current_listings',
            'transaction_history',
            'real_estate_data',
            'naver_complexes',
            'naver_data',
            'crawling_data',
            'property_data',
            # 일반적인 이름들
            'data',
            'items',
            'records'
        ]
        
        existing_tables = []
        
        for table in common_tables:
            print(f"🔍 테이블 확인: {table}")
            
            try:
                # 작은 샘플로 테이블 존재 확인
                api_url = f"{self.url}/rest/v1/{table}"
                headers = {**self.headers, 'Range': '0-0'}  # 첫 번째 레코드만
                
                response = requests.get(api_url, headers=headers)
                
                if response.status_code == 200:
                    count = self.get_table_count(table)
                    if count and count > 0:
                        print(f"   ✅ {table}: {count:,}개 레코드")
                        existing_tables.append((table, count))
                    else:
                        print(f"   📋 {table}: 빈 테이블")
                        existing_tables.append((table, 0))
                        
                elif response.status_code == 404:
                    print(f"   ❌ {table}: 테이블 없음")
                else:
                    print(f"   ⚠️ {table}: 확인 불가 ({response.status_code})")
                    
            except Exception as e:
                print(f"   ❌ {table}: 오류 ({e})")
                
            time.sleep(0.1)  # API 레이트 리밋 방지
        
        # 레코드 수 기준으로 정렬 (가장 큰 테이블부터)
        existing_tables.sort(key=lambda x: x[1], reverse=True)
        
        return existing_tables
    
    def download_all_data(self, output_file, batch_size=1000):
        """모든 데이터 다운로드"""
        print("🚀 대용량 Supabase 데이터 다운로드 시작")
        print(f"📍 URL: {self.url}")
        print(f"📦 배치 크기: {batch_size:,}개")
        print("=" * 60)
        
        # 모든 테이블 찾기
        tables_info = self.get_all_tables()
        
        if not tables_info:
            print("❌ 접근 가능한 테이블을 찾을 수 없습니다.")
            return False
        
        print(f"\n📋 발견된 테이블 ({len(tables_info)}개):")
        for table, count in tables_info:
            print(f"   - {table}: {count:,}개 레코드")
        
        # 모든 테이블 데이터 수집
        all_data = {}
        total_records = 0
        
        for table, expected_count in tables_info:
            if expected_count == 0:
                print(f"\n⏭️ {table} 건너뛰기 (빈 테이블)")
                all_data[table] = []
                continue
                
            print(f"\n📥 {table} 다운로드 시작...")
            start_time = time.time()
            
            data = self.get_table_data_paginated(table, batch_size)
            all_data[table] = data
            total_records += len(data)
            
            elapsed = time.time() - start_time
            print(f"   ⏱️ 소요시간: {elapsed:.1f}초")
            print(f"   📊 다운로드: {len(data):,}개/{expected_count:,}개")
        
        # 메타데이터 추가
        backup_info = {
            'backup_timestamp': datetime.now().isoformat(),
            'supabase_url': self.url,
            'total_tables': len(tables_info),
            'total_records': total_records,
            'tables_info': {table: count for table, count in tables_info},
            'batch_size': batch_size
        }
        all_data['_backup_info'] = backup_info
        
        # JSON 파일로 저장
        try:
            print(f"\n💾 백업 파일 저장 중: {output_file}")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, ensure_ascii=False, indent=2, default=str)
            
            print(f"🎉 백업 완료!")
            print(f"📊 총 {len(tables_info)}개 테이블, {total_records:,}개 레코드")
            
            # 파일 크기 표시
            file_size = Path(output_file).stat().st_size
            print(f"📁 파일 크기: {file_size / 1024 / 1024:.2f} MB")
            
            return True
            
        except Exception as e:
            print(f"❌ 파일 저장 실패: {e}")
            return False

def main():
    """메인 실행 함수"""
    # 올바른 Supabase 설정 (46,539개 레코드)
    supabase_url = "https://dbwcpgdpjeiezwgbijcj.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid2NwZ2RwamVpZXp3Z2JpamNqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MTcwMDIsImV4cCI6MjA2NzA5MzAwMn0.Or7jCm4tYfYcyPDP3S_nhkWcUElSG7kwxGsHy2Ss4iU"
    
    # 출력 파일명 (타임스탬프 포함)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"supabase_large_backup_{timestamp}.json"
    
    print("🎯 46,539개 레코드 대용량 다운로드!")
    
    # 다운로더 실행
    downloader = LargeSupabaseDownloader(supabase_url, supabase_key)
    success = downloader.download_all_data(output_file, batch_size=1000)
    
    if success:
        print("\n✅ 대용량 다운로드 완료!")
        print(f"📄 백업 파일: {output_file}")
        print("\n📋 다음 단계:")
        print("1. 백업 파일 확인")
        print("2. 필요시 다른 형식으로 변환")
        print("3. 데이터 분석 및 활용")
    else:
        print("\n❌ 다운로드 실패")

if __name__ == "__main__":
    main()