#!/usr/bin/env python3
"""
Supabase 데이터 다운로드 스크립트
- REST API를 사용하여 데이터 다운로드
- JSON 형태로 백업 생성
"""

import json
import requests
from datetime import datetime
from pathlib import Path

class SupabaseDataDownloader:
    def __init__(self, supabase_url, supabase_key):
        self.url = supabase_url
        self.key = supabase_key
        self.headers = {
            'apikey': supabase_key,
            'Authorization': f'Bearer {supabase_key}',
            'Content-Type': 'application/json'
        }
        
    def get_table_data(self, table_name):
        """테이블 데이터 가져오기"""
        try:
            # Supabase REST API 엔드포인트
            api_url = f"{self.url}/rest/v1/{table_name}"
            
            response = requests.get(api_url, headers=self.headers)
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ {table_name}: {len(data)} 개 레코드")
                return data
            else:
                print(f"❌ {table_name} 조회 실패: {response.status_code}")
                print(f"응답: {response.text}")
                return []
                
        except Exception as e:
            print(f"❌ {table_name} 조회 오류: {e}")
            return []
    
    def get_all_tables(self):
        """모든 테이블 목록 가져오기"""
        # 일반적인 테이블들 시도
        common_tables = [
            'apartment_complexes',
            'current_listings', 
            'transaction_history',
            'complexes',
            'listings',
            'naver_complexes',
            'real_estate_data'
        ]
        
        existing_tables = []
        
        for table in common_tables:
            print(f"🔍 테이블 확인: {table}")
            data = self.get_table_data(table)
            if data or data == []:  # 빈 배열도 유효한 테이블
                existing_tables.append(table)
        
        return existing_tables
    
    def download_all_data(self, output_file):
        """모든 데이터 다운로드"""
        print("🚀 Supabase 데이터 다운로드 시작")
        print(f"📍 URL: {self.url}")
        print("=" * 50)
        
        # 모든 테이블 데이터 수집
        all_data = {}
        tables = self.get_all_tables()
        
        if not tables:
            print("❌ 접근 가능한 테이블을 찾을 수 없습니다.")
            return False
            
        for table in tables:
            print(f"📥 {table} 다운로드 중...")
            data = self.get_table_data(table)
            all_data[table] = data
        
        # 메타데이터 추가
        backup_info = {
            'backup_timestamp': datetime.now().isoformat(),
            'supabase_url': self.url,
            'total_tables': len(tables),
            'tables': list(tables)
        }
        all_data['_backup_info'] = backup_info
        
        # JSON 파일로 저장
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, ensure_ascii=False, indent=2, default=str)
            
            print(f"🎉 백업 완료: {output_file}")
            print(f"📊 총 {len(tables)} 개 테이블 백업됨")
            
            # 파일 크기 표시
            file_size = Path(output_file).stat().st_size
            print(f"📁 파일 크기: {file_size / 1024 / 1024:.2f} MB")
            
            return True
            
        except Exception as e:
            print(f"❌ 파일 저장 실패: {e}")
            return False

def main():
    """메인 실행 함수"""
    # 실제 사용 중인 Supabase 설정
    supabase_url = "https://heatmxifhwxppprdzaqf.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o"
    
    # 출력 파일명 (타임스탬프 포함)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"supabase_backup_{timestamp}.json"
    
    # 다운로더 실행
    downloader = SupabaseDataDownloader(supabase_url, supabase_key)
    success = downloader.download_all_data(output_file)
    
    if success:
        print("\n✅ 다운로드 완료!")
        print(f"📄 백업 파일: {output_file}")
    else:
        print("\n❌ 다운로드 실패")

if __name__ == "__main__":
    main()