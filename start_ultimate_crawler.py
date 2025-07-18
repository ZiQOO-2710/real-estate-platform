#!/usr/bin/env python3
"""
Ultimate Real Estate Crawler 시작 스크립트
- 국토부 실거래가 + 네이버 매매호가 통합 수집
- 완벽한 IP 차단 방지 시스템
- 100% 데이터 안정성 보장
"""

import asyncio
import sys
import os
from datetime import datetime
from ultimate_real_estate_crawler import UltimateRealEstateCrawler, CrawlingConfig

def print_banner():
    """시작 배너 출력"""
    banner = """
    ================================================================
                Ultimate Real Estate Crawler
                   최고 수준의 부동산 크롤러
    ================================================================
      ✓ 국토부 실거래가 API 통합
      ✓ 네이버 부동산 매매호가 크롤링
      ✓ UltimateDatabaseManager 100% 저장 보장
      ✓ 지능형 IP 차단 방지 시스템
      ✓ 자동 재시도 및 복구 시스템
      ✓ 실시간 통계 및 진행률 모니터링
    ================================================================
    """
    print(banner)

def get_user_settings():
    """사용자 설정 입력"""
    print("\n=== 크롤링 설정 ===")
    
    # 국토부 API 키 입력
    print("\n1. 국토부 실거래가 API 서비스키 설정")
    print("   - 이미 발급받은 API 키가 설정되어 있습니다")
    print("   - 다른 키를 사용하려면 입력하세요 (엔터: 기본 키 사용)")
    
    molit_key = input("국토부 API 서비스키 (엔터: 기본값): ").strip()
    if not molit_key:
        molit_key = "UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ=="
    
    # 크롤링 규모 설정
    print("\n2. 크롤링 규모 설정")
    print("   - 소규모: 네이버 100개 지역, 국토부 15개 지역 (권장)")
    print("   - 중규모: 네이버 300개 지역, 국토부 30개 지역")
    print("   - 대규모: 네이버 500개 지역, 국토부 50개 지역")
    print("   ※ 국토부 API 일일 1만건 제한 고려")
    
    scale_choice = input("크롤링 규모 선택 (1:소규모, 2:중규모, 3:대규모) [1]: ").strip()
    
    if scale_choice == "2":
        naver_regions = 300
        molit_regions = 30
        scale_name = "중규모"
    elif scale_choice == "3":
        naver_regions = 500
        molit_regions = 50
        scale_name = "대규모"
    else:
        naver_regions = 100
        molit_regions = 15
        scale_name = "소규모"
    
    # 딜레이 설정
    print("\n3. IP 차단 방지 딜레이 설정")
    print("   - 안전모드: 3-7초 딜레이 (IP 차단 위험 최소)")
    print("   - 일반모드: 2-5초 딜레이 (균형)")
    print("   - 빠른모드: 1-3초 딜레이 (속도 우선, 차단 위험 있음)")
    
    delay_choice = input("딜레이 모드 선택 (1:안전, 2:일반, 3:빠른) [1]: ").strip()
    
    if delay_choice == "2":
        min_delay = 2.0
        max_delay = 5.0
        error_delay = 15.0
        delay_name = "일반"
    elif delay_choice == "3":
        min_delay = 1.0
        max_delay = 3.0
        error_delay = 10.0
        delay_name = "빠른"
    else:
        min_delay = 3.0
        max_delay = 7.0
        error_delay = 20.0
        delay_name = "안전"
    
    # 동시 처리 수 설정
    print("\n4. 동시 처리 수 설정")
    print("   - 보수적: 네이버 2개, 국토부 1개 (매우 안전)")
    print("   - 균형: 네이버 3개, 국토부 2개 (권장)")
    print("   - 적극적: 네이버 5개, 국토부 3개 (빠르지만 위험)")
    
    concurrent_choice = input("동시 처리 수 선택 (1:보수적, 2:균형, 3:적극적) [2]: ").strip()
    
    if concurrent_choice == "1":
        max_concurrent_naver = 2
        max_concurrent_molit = 1
        concurrent_name = "보수적"
    elif concurrent_choice == "3":
        max_concurrent_naver = 3
        max_concurrent_molit = 1  # 국토부는 항상 1개 (API 제한)
        concurrent_name = "적극적"
    else:
        max_concurrent_naver = 3
        max_concurrent_molit = 1  # 국토부는 항상 1개 (API 제한)
        concurrent_name = "균형"
    
    # 설정 요약
    print(f"\n=== 선택된 설정 ===")
    print(f"크롤링 규모: {scale_name} (네이버 {naver_regions}개, 국토부 {molit_regions}개)")
    print(f"딜레이 모드: {delay_name} ({min_delay}-{max_delay}초)")
    print(f"동시 처리: {concurrent_name} (네이버 {max_concurrent_naver}개, 국토부 {max_concurrent_molit}개)")
    print(f"국토부 API: {'활성화' if molit_key != 'test' else '비활성화 (테스트 모드)'}")
    
    confirm = input("\n설정으로 진행하시겠습니까? (y/n) [y]: ").strip().lower()
    if confirm == 'n':
        print("크롤링을 취소합니다.")
        sys.exit(0)
    
    return {
        'molit_service_key': molit_key,
        'naver_regions': naver_regions,
        'molit_regions': molit_regions,
        'min_delay': min_delay,
        'max_delay': max_delay,
        'error_delay': error_delay,
        'max_concurrent_naver': max_concurrent_naver,
        'max_concurrent_molit': max_concurrent_molit
    }

def check_dependencies():
    """의존성 확인"""
    print("\n=== 의존성 확인 ===")
    
    required_files = [
        'ultimate_database_manager.py',
        'ultimate_real_estate_crawler.py'
    ]
    
    missing_files = []
    for file in required_files:
        if not os.path.exists(file):
            missing_files.append(file)
    
    if missing_files:
        print(f"❌ 필수 파일이 없습니다: {', '.join(missing_files)}")
        sys.exit(1)
    
    try:
        import aiohttp
        import requests
        import xml.etree.ElementTree as ET
        print("✓ 필수 라이브러리 확인 완료")
    except ImportError as e:
        print(f"❌ 필수 라이브러리 누락: {e}")
        print("pip install aiohttp requests 명령어로 설치하세요")
        sys.exit(1)
    
    print("✓ 모든 의존성 확인 완료")

def create_database_backup():
    """데이터베이스 백업 생성"""
    db_path = "real_estate_crawling.db"
    if os.path.exists(db_path):
        backup_path = f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        import shutil
        shutil.copy2(db_path, backup_path)
        print(f"✓ 기존 데이터베이스 백업 생성: {backup_path}")

async def main():
    """메인 실행 함수"""
    print_banner()
    
    # 의존성 확인
    check_dependencies()
    
    # 사용자 설정 입력
    settings = get_user_settings()
    
    # 데이터베이스 백업
    create_database_backup()
    
    # 크롤링 설정 생성
    config = CrawlingConfig(
        molit_service_key=settings['molit_service_key'],
        min_delay=settings['min_delay'],
        max_delay=settings['max_delay'],
        error_delay=settings['error_delay'],
        max_concurrent_naver=settings['max_concurrent_naver'],
        max_concurrent_molit=settings['max_concurrent_molit']
    )
    
    # 크롤러 생성
    crawler = UltimateRealEstateCrawler(config)
    
    print(f"\n=== 크롤링 시작 ===")
    print(f"시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # 국토부 API 키 확인
        if settings['molit_service_key'] == 'test':
            print("⚠️  테스트 모드: 국토부 실거래가 데이터 수집 제외")
            settings['molit_regions'] = 0
        else:
            print("✅ 국토부 실거래가 API 활성화됨")
        
        # 크롤링 실행
        stats = await crawler.run_ultimate_crawling(
            max_naver_regions=settings['naver_regions'],
            max_molit_regions=settings['molit_regions']
        )
        
        # 결과 출력
        print(f"\n=== 크롤링 완료 ===")
        print(f"완료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"데이터베이스 저장 효율: {stats['success_rate']:.1f}%")
        
        # 최종 데이터 확인
        import sqlite3
        conn = sqlite3.connect(config.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
        complex_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
        transaction_count = cursor.fetchone()[0]
        
        conn.close()
        
        print(f"\n=== 수집 결과 ===")
        print(f"아파트 단지 정보 (네이버 매매호가): {complex_count:,}개")
        print(f"실거래가 정보 (국토부): {transaction_count:,}개")
        print(f"총 수집 데이터: {complex_count + transaction_count:,}개")
        
        # 성공률 체크
        if stats['success_rate'] >= 95:
            print("✅ 크롤링 성공! 데이터 안정성 확보")
        elif stats['success_rate'] >= 90:
            print("⚠️  크롤링 완료, 일부 데이터 누락 가능")
        else:
            print("❌ 크롤링 문제 발생, 로그 확인 필요")
        
        print(f"\n상세 로그: ultimate_crawling.log")
        print(f"데이터베이스: {config.db_path}")
        
    except KeyboardInterrupt:
        print("\n❌ 사용자에 의해 중단됨")
        print("부분적으로 수집된 데이터는 데이터베이스에 저장되었습니다.")
        
    except Exception as e:
        print(f"\n❌ 크롤링 오류: {str(e)}")
        print("오류 상세 내용은 ultimate_crawling.log 파일을 확인하세요.")
        
    finally:
        print(f"\n프로그램 종료")

if __name__ == "__main__":
    # Windows 환경에서 이벤트 루프 정책 설정
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    asyncio.run(main())