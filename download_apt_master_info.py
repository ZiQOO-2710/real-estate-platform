#!/usr/bin/env python3
"""
apt_master_info 테이블 대용량 다운로드
- 46,539개 레코드 전체 다운로드
"""

import json
import requests
from datetime import datetime
from pathlib import Path
import time

def download_apt_master_info():
    """apt_master_info 테이블 데이터 다운로드"""
    
    supabase_url = "https://dbwcpgdpjeiezwgbijcj.supabase.co"
    service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid2NwZ2RwamVpZXp3Z2JpamNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUxNzAwMiwiZXhwIjoyMDY3MDkzMDAyfQ.j3k-D58hiYQgzfdLpER1Btf3yD1JmGamw-R7Li3NrQQ"
    
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json'
    }
    
    table_name = "apt_master_info"
    api_url = f"{supabase_url}/rest/v1/{table_name}"
    
    print("🎯 apt_master_info 테이블 다운로드 시작!")
    print(f"📍 URL: {supabase_url}")
    print("=" * 60)
    
    # 1. 먼저 총 레코드 수 확인
    print("📊 총 레코드 수 확인 중...")
    try:
        count_headers = {**headers, 'Prefer': 'count=exact'}
        response = requests.head(api_url, headers=count_headers)
        
        content_range = response.headers.get('Content-Range', '')
        print(f"Content-Range: {content_range}")
        
        if content_range and '/' in content_range:
            total_count = content_range.split('/')[-1]
            if total_count != '*':
                total_count = int(total_count)
                print(f"✅ 총 레코드 수: {total_count:,}개")
            else:
                total_count = 50000  # 추정치
                print(f"⚠️ 정확한 개수 확인 불가, 추정치: {total_count:,}개")
        else:
            total_count = 50000
            print(f"⚠️ Content-Range 헤더 없음, 추정치: {total_count:,}개")
            
    except Exception as e:
        print(f"❌ 레코드 수 확인 오류: {e}")
        total_count = 50000
    
    # 2. 페이지네이션으로 전체 데이터 다운로드
    all_data = []
    batch_size = 1000
    offset = 0
    page = 1
    
    print(f"\n📥 데이터 다운로드 시작 (배치 크기: {batch_size:,}개)")
    
    while offset < total_count:
        print(f"📄 페이지 {page} 다운로드 중... ({offset+1:,}-{min(offset+batch_size, total_count):,}/{total_count:,})")
        
        try:
            # Range 헤더로 페이지네이션
            range_header = f"{offset}-{offset + batch_size - 1}"
            page_headers = {**headers, 'Range': range_header}
            
            response = requests.get(api_url, headers=page_headers)
            
            if response.status_code == 200:
                page_data = response.json()
                
                if not page_data:  # 빈 페이지면 종료
                    print("📋 더 이상 데이터가 없습니다.")
                    break
                    
                all_data.extend(page_data)
                print(f"   ✅ {len(page_data):,}개 레코드 추가 (누적: {len(all_data):,}개)")
                
                # 첫 번째 페이지에서 데이터 구조 확인
                if page == 1 and page_data:
                    print(f"   🔑 데이터 필드: {list(page_data[0].keys())}")
                
                # 다음 페이지로
                offset += batch_size
                page += 1
                
                # API 레이트 리밋 방지
                time.sleep(0.1)
                
            elif response.status_code == 416:  # Range Not Satisfiable
                print("📋 모든 데이터 다운로드 완료!")
                break
                
            else:
                print(f"❌ 페이지 {page} 다운로드 실패: {response.status_code}")
                print(f"응답: {response.text[:200]}...")
                
                # 일시적 오류라면 재시도
                if response.status_code in [502, 503, 504]:
                    print("⏳ 5초 후 재시도...")
                    time.sleep(5)
                    continue
                else:
                    break
                    
        except Exception as e:
            print(f"❌ 페이지 {page} 다운로드 오류: {e}")
            print("⏳ 3초 후 재시도...")
            time.sleep(3)
            continue
    
    print(f"\n🎉 다운로드 완료: {len(all_data):,}개 레코드")
    
    # 3. JSON 파일로 저장
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = f"apt_master_info_{timestamp}.json"
    
    # 메타데이터 추가
    backup_data = {
        'table_name': table_name,
        'download_timestamp': datetime.now().isoformat(),
        'total_records': len(all_data),
        'supabase_url': supabase_url,
        'data': all_data
    }
    
    try:
        print(f"\n💾 파일 저장 중: {output_file}")
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2, default=str)
        
        # 파일 크기 확인
        file_size = Path(output_file).stat().st_size
        print(f"✅ 저장 완료!")
        print(f"📁 파일 크기: {file_size / 1024 / 1024:.2f} MB")
        print(f"📄 파일명: {output_file}")
        
        # 데이터 샘플 확인
        if all_data:
            print(f"\n📋 데이터 샘플:")
            sample = all_data[0]
            for key, value in list(sample.items())[:5]:
                print(f"   {key}: {value}")
            if len(sample) > 5:
                print(f"   ... (총 {len(sample)}개 필드)")
        
        return True
        
    except Exception as e:
        print(f"❌ 파일 저장 실패: {e}")
        return False

def main():
    success = download_apt_master_info()
    
    if success:
        print("\n✅ apt_master_info 테이블 다운로드 성공!")
        print("\n📋 다음 단계:")
        print("1. 백업 파일 확인")
        print("2. 데이터 분석")
        print("3. 필요시 다른 형식으로 변환")
    else:
        print("\n❌ 다운로드 실패")

if __name__ == "__main__":
    main()