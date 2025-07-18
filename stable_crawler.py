#!/usr/bin/env python3
"""
안정적인 크롤러 - 간단하고 확실한 실행
"""

import asyncio
import time
import sqlite3
from datetime import datetime
from ultimate_real_estate_crawler import UltimateRealEstateCrawler, CrawlingConfig

def main():
    print("=== 안정적인 크롤러 시작 ===")
    print(f"시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 현재 데이터베이스 상태 확인
    try:
        conn = sqlite3.connect('real_estate_crawling.db')
        cursor = conn.cursor()
        cursor.execute('SELECT COUNT(*) FROM apartment_complexes')
        before_count = cursor.fetchone()[0]
        print(f"시작 전 아파트 단지: {before_count}개")
        conn.close()
    except Exception as e:
        print(f"데이터베이스 확인 오류: {e}")
        before_count = 0
    
    # 안정적인 설정
    config = CrawlingConfig(
        molit_service_key="UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ==",
        min_delay=5.0,  # 매우 안전한 딜레이
        max_delay=10.0,
        error_delay=30.0,
        max_concurrent_naver=1,  # 순차 처리
        max_concurrent_molit=1
    )
    
    print("설정:")
    print(f"  - 딜레이: {config.min_delay}-{config.max_delay}초")
    print(f"  - 동시 처리: 네이버 {config.max_concurrent_naver}개")
    print(f"  - 예상 소요 시간: 1-2시간")
    
    async def run_crawler():
        try:
            crawler = UltimateRealEstateCrawler(config)
            
            # 소규모 안전 실행
            print("\n크롤링 시작...")
            stats = await crawler.run_ultimate_crawling(
                max_naver_regions=100,  # 안전한 100개 지역
                max_molit_regions=10    # 안전한 10개 지역
            )
            
            print(f"\n=== 크롤링 완료 ===")
            print(f"완료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"저장 효율: {stats['success_rate']:.1f}%")
            
            # 결과 확인
            conn = sqlite3.connect('real_estate_crawling.db')
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM apartment_complexes')
            after_count = cursor.fetchone()[0]
            cursor.execute('SELECT COUNT(*) FROM apartment_transactions')
            transaction_count = cursor.fetchone()[0]
            conn.close()
            
            print(f"\n=== 수집 결과 ===")
            print(f"이전: {before_count}개")
            print(f"현재: {after_count}개")
            print(f"증가: {after_count - before_count}개")
            print(f"실거래가: {transaction_count}개")
            
        except Exception as e:
            print(f"크롤링 오류: {e}")
    
    # 실행
    try:
        asyncio.run(run_crawler())
    except Exception as e:
        print(f"실행 오류: {e}")

if __name__ == "__main__":
    main()