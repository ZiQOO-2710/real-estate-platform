#!/usr/bin/env python3
"""
apt_master_info 테이블을 CSV 형태로 다운로드
- 46,539개 레코드를 CSV 파일로 저장
"""

import csv
import requests
from datetime import datetime
import time

def download_apt_master_to_csv():
    """apt_master_info 테이블을 CSV로 다운로드"""
    
    supabase_url = "https://dbwcpgdpjeiezwgbijcj.supabase.co"
    service_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRid2NwZ2RwamVpZXp3Z2JpamNqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTUxNzAwMiwiZXhwIjoyMDY3MDkzMDAyfQ.j3k-D58hiYQgzfdLpER1Btf3yD1JmGamw-R7Li3NrQQ"
    
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json'
    }
    
    table_name = "apt_master_info"
    api_url = f"{supabase_url}/rest/v1/{table_name}"
    
    print("📊 apt_master_info → CSV 변환 다운로드 시작!")
    print(f"📍 URL: {supabase_url}")
    print("=" * 60)
    
    # 출력 파일명
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    csv_filename = f"apt_master_info_{timestamp}.csv"
    
    # 총 레코드 수 확인
    print("📊 총 레코드 수 확인 중...")
    try:
        count_headers = {**headers, 'Prefer': 'count=exact'}
        response = requests.head(api_url, headers=count_headers)
        content_range = response.headers.get('Content-Range', '')
        
        if content_range and '/' in content_range:
            total_count = int(content_range.split('/')[-1])
            print(f"✅ 총 레코드 수: {total_count:,}개")
        else:
            total_count = 50000
            print(f"⚠️ Content-Range 확인 불가, 추정치: {total_count:,}개")
    except Exception as e:
        print(f"❌ 레코드 수 확인 오류: {e}")
        total_count = 50000
    
    # CSV 파일로 스트리밍 다운로드
    batch_size = 1000
    offset = 0
    page = 1
    total_written = 0
    
    print(f"\n📥 CSV 파일 생성 중: {csv_filename}")
    
    # CSV 파일 열기
    with open(csv_filename, 'w', newline='', encoding='utf-8-sig') as csvfile:
        writer = None
        fieldnames = None
        
        while offset < total_count:
            print(f"📄 페이지 {page} 처리 중... ({offset+1:,}-{min(offset+batch_size, total_count):,}/{total_count:,})")
            
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
                    
                    # 첫 번째 페이지에서 CSV 헤더 설정
                    if writer is None:
                        fieldnames = list(page_data[0].keys())
                        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                        writer.writeheader()
                        print(f"   📝 CSV 헤더 생성: {len(fieldnames)}개 컬럼")
                        print(f"   🔑 컬럼명: {', '.join(fieldnames[:5])}{'...' if len(fieldnames) > 5 else ''}")
                    
                    # 데이터 행 쓰기
                    for row in page_data:
                        # None 값을 빈 문자열로 변환
                        cleaned_row = {k: (v if v is not None else '') for k, v in row.items()}
                        writer.writerow(cleaned_row)
                    
                    total_written += len(page_data)
                    print(f"   ✅ {len(page_data):,}개 행 추가 (누적: {total_written:,}개)")
                    
                    # 다음 페이지로
                    offset += batch_size
                    page += 1
                    
                    # API 레이트 리밋 방지
                    time.sleep(0.1)
                    
                elif response.status_code == 416:  # Range Not Satisfiable
                    print("📋 모든 데이터 처리 완료!")
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
                print(f"❌ 페이지 {page} 처리 오류: {e}")
                print("⏳ 3초 후 재시도...")
                time.sleep(3)
                continue
    
    print(f"\n🎉 CSV 변환 완료!")
    print(f"📊 총 {total_written:,}개 레코드 저장")
    print(f"📄 파일명: {csv_filename}")
    
    # 파일 크기 확인
    try:
        import os
        file_size = os.path.getsize(csv_filename)
        print(f"📁 파일 크기: {file_size / 1024 / 1024:.2f} MB")
        
        # CSV 파일 검증 (첫 5줄 미리보기)
        print(f"\n📋 CSV 파일 미리보기:")
        with open(csv_filename, 'r', encoding='utf-8-sig') as f:
            for i, line in enumerate(f):
                if i >= 5:
                    break
                print(f"   {i+1}: {line.strip()[:100]}{'...' if len(line.strip()) > 100 else ''}")
        
        return True
        
    except Exception as e:
        print(f"❌ 파일 확인 오류: {e}")
        return False

def main():
    success = download_apt_master_to_csv()
    
    if success:
        print("\n✅ CSV 다운로드 성공!")
        print("\n📋 사용법:")
        print("- Excel에서 열기: 텍스트 가져오기 → UTF-8 인코딩 선택")
        print("- Python pandas: pd.read_csv('파일명', encoding='utf-8-sig')")
        print("- 데이터 분석, 필터링, 정렬 등 가능")
    else:
        print("\n❌ CSV 다운로드 실패")

if __name__ == "__main__":
    main()