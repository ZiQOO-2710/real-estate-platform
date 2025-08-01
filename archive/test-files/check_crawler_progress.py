#!/usr/bin/env python3
"""
크롤링 진행 상황 모니터링 스크립트
"""

import sqlite3
import os
from datetime import datetime

def check_database_status():
    """데이터베이스 상태 확인"""
    db_path = "comprehensive_real_estate.db"
    
    if not os.path.exists(db_path):
        print("[ERROR] 데이터베이스 파일이 없습니다.")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("전국 아파트 단지 종합 크롤링 진행 상황")
        print("="*50)
        
        # 지역별 진행 상황
        cursor.execute("SELECT * FROM crawling_progress ORDER BY created_at DESC")
        progress_data = cursor.fetchall()
        
        if progress_data:
            print("\n지역별 진행 상황:")
            for row in progress_data:
                region_name = row[2]
                status = row[3]
                complexes = row[4]
                listings = row[5]
                print(f"  {region_name}: {status} - 단지: {complexes}개, 매물: {listings}개")
        
        # 아파트 단지 통계
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes")
        total_complexes = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(DISTINCT region_name) FROM apartment_complexes")
        regions_with_data = cursor.fetchone()[0]
        
        # 매물 통계
        cursor.execute("SELECT COUNT(*) FROM property_listings")
        total_listings = cursor.fetchone()[0]
        
        cursor.execute("SELECT deal_type, COUNT(*) FROM property_listings GROUP BY deal_type")
        deal_type_stats = cursor.fetchall()
        
        print(f"\n 수집 통계:")
        print(f"   총 아파트 단지: {total_complexes:,}개")
        print(f"   데이터 보유 지역: {regions_with_data}개")
        print(f"   총 매물: {total_listings:,}개")
        
        if deal_type_stats:
            print(f"   거래유형별:")
            for deal_type, count in deal_type_stats:
                print(f"    {deal_type}: {count:,}개")
        
        # 최근 크롤링 활동
        cursor.execute("SELECT COUNT(*) FROM apartment_complexes WHERE datetime(crawled_at) > datetime('now', '-1 hour')")
        recent_complexes = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM property_listings WHERE datetime(crawled_at) > datetime('now', '-1 hour')")
        recent_listings = cursor.fetchone()[0]
        
        print(f"\n 최근 1시간 활동:")
        print(f"   새 단지: {recent_complexes}개")
        print(f"   새 매물: {recent_listings}개")
        
        # 데이터베이스 파일 크기
        db_size = os.path.getsize(db_path) / (1024 * 1024)  # MB
        print(f"\n 데이터베이스 크기: {db_size:.1f}MB")
        
        # 샘플 데이터
        cursor.execute("SELECT complex_name, address, region_name FROM apartment_complexes ORDER BY created_at DESC LIMIT 5")
        sample_complexes = cursor.fetchall()
        
        if sample_complexes:
            print(f"\n 최근 수집된 단지 (샘플):")
            for complex_name, address, region_name in sample_complexes:
                print(f"  • {complex_name} ({region_name})")
                print(f"    {address}")
        
        conn.close()
        
    except Exception as e:
        print(f"[ERROR] 데이터베이스 확인 중 오류: {e}")

def main():
    print(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} - 크롤링 진행 상황 확인")
    check_database_status()

if __name__ == "__main__":
    main()