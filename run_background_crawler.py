#!/usr/bin/env python3
"""
백그라운드 크롤러 실행 스크립트
국토부 API 일일 1만건 제한 고려한 자동 실행
"""

import asyncio
import sys
import os
from datetime import datetime
from ultimate_real_estate_crawler import UltimateRealEstateCrawler, CrawlingConfig

def main():
    """백그라운드 실행을 위한 메인 함수"""
    print("=== Ultimate Real Estate Crawler 백그라운드 실행 ===")
    print(f"시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("국토부 API 일일 1만건 제한 고려한 안전 설정")
    print()
    
    # 국토부 API 제한 고려한 안전한 설정
    config = CrawlingConfig(
        molit_service_key="UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ==",
        min_delay=3.0,          # 안전한 딜레이
        max_delay=7.0,
        error_delay=20.0,
        max_concurrent_naver=2,  # 보수적 설정
        max_concurrent_molit=1   # 국토부는 순차 처리
    )
    
    # 크롤러 생성
    crawler = UltimateRealEstateCrawler(config)
    
    async def run_crawler():
        """크롤러 실행"""
        try:
            print("크롤링 시작...")
            print("- 네이버 부동산: 200개 지역")
            print("- 국토부 실거래가: 20개 지역 (API 제한 고려)")
            print("- 예상 소요 시간: 2-3시간")
            print()
            
            # 크롤링 실행
            stats = await crawler.run_ultimate_crawling(
                max_naver_regions=200,  # 네이버 200개 지역
                max_molit_regions=20    # 국토부 20개 지역 (API 제한 고려)
            )
            
            print(f"\n=== 크롤링 완료 ===")
            print(f"완료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"데이터베이스 저장 효율: {stats['success_rate']:.1f}%")
            
            # 결과 확인
            import sqlite3
            conn = sqlite3.connect(config.db_path)
            cursor = conn.cursor()
            
            cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
            complex_count = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
            transaction_count = cursor.fetchone()[0]
            
            conn.close()
            
            print(f"\n=== 수집 결과 ===")
            print(f"아파트 단지 (네이버): {complex_count:,}개")
            print(f"실거래가 (국토부): {transaction_count:,}개")
            print(f"총 데이터: {complex_count + transaction_count:,}개")
            
            if stats['success_rate'] >= 95:
                print("✅ 크롤링 성공!")
            else:
                print("⚠️ 일부 오류 발생, 로그 확인 필요")
            
            print(f"\n로그 파일: ultimate_crawling.log")
            print(f"데이터베이스: {config.db_path}")
            
        except Exception as e:
            print(f"❌ 크롤링 오류: {str(e)}")
            
    # Windows 이벤트 루프 정책 설정
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    # 크롤러 실행
    asyncio.run(run_crawler())

if __name__ == "__main__":
    main()