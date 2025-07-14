#!/usr/bin/env python3
"""
제공된 Supabase 정보로 자동 설정 실행
"""

import os
import sys
from setup_supabase_complete import SupabaseCompleteSetup

def main():
    print("🚀 Supabase 자동 설정을 시작합니다!")
    print("=" * 50)
    
    # 제공받은 Supabase 정보
    supabase_url = "https://heatmxifhwxppprdzaqf.supabase.co"
    supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o"
    
    print(f"📡 연결 정보:")
    print(f"   URL: {supabase_url}")
    print(f"   Key: {supabase_key[:20]}...")
    
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
    tables_created = setup.create_tables()
    if not tables_created:
        print("⚠️ 테이블 생성 실패했지만 계속 진행합니다.")
    
    # 2. 데이터 로드  
    print("\n📂 2. 크롤링 데이터 로드 중...")
    crawling_data = setup.load_crawling_data()
    print(f"📊 로드된 데이터: {len(crawling_data)}개")
    
    # 3. 데이터 업로드
    print("\n📤 3. 데이터 업로드 중...")
    if crawling_data:
        upload_success = setup.upload_apartment_data(crawling_data)
        if not upload_success:
            print("⚠️ 데이터 업로드 실패했지만 계속 진행합니다.")
    else:
        print("⚠️ 크롤링 데이터가 없어 업로드를 건너뜁니다.")
    
    # 4. 환경변수 설정
    print("\n⚙️ 4. 프론트엔드 환경변수 설정 중...")
    env_success = setup.update_frontend_env()
    
    # 5. 최종 테스트
    print("\n🧪 5. 최종 테스트 중...")
    test_success = setup.test_final_setup()
    
    # 결과 출력
    print("\n" + "=" * 50)
    if env_success:
        print("🎉 설정이 완료되었습니다!")
        print("\n📋 다음 단계:")
        print("1. 프론트엔드 재시작: cd frontend && npm start")
        print("2. 브라우저에서 지도 확인: http://localhost:3000/map")
        print("3. DB 데이터가 지도에 표시되는지 확인")
        
        if test_success:
            print("\n✅ 데이터베이스 연결 및 데이터 확인 완료")
        else:
            print("\n⚠️ 데이터베이스에 데이터가 없거나 연결 문제가 있을 수 있습니다.")
            print("하지만 환경변수는 설정되었으므로 프론트엔드에서 확인해보세요.")
    else:
        print("❌ 일부 설정에 문제가 있었습니다.")
        print("수동으로 확인해주세요.")

if __name__ == "__main__":
    main()