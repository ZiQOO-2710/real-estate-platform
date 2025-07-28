#!/usr/bin/env python3
"""
빠른 Supabase 마이그레이션 - 상위 단지만 선별
"""

import sqlite3
import csv
import os
from datetime import datetime

def quick_migration():
    print("🚀 빠른 마이그레이션 시작")
    
    try:
        conn = sqlite3.connect('molit_complete_data.db')
        cursor = conn.cursor()
        
        # 거래량 상위 단지들만 선별 (빠른 쿼리)
        cursor.execute("""
            SELECT 
                apartment_name, region_name, legal_dong, jibun, road_name,
                deal_type, deal_year, deal_month, deal_day, deal_amount,
                area, floor, longitude, latitude, coordinate_source
            FROM apartment_transactions 
            WHERE longitude IS NOT NULL 
              AND latitude IS NOT NULL
              AND apartment_name IS NOT NULL
              AND apartment_name != ''
            ORDER BY RANDOM()  -- 다양성을 위해 랜덤 선택
            LIMIT 20000
        """)
        
        data = cursor.fetchall()
        print(f"✅ {len(data):,}개 레코드 선별")
        
        # CSV 파일 생성
        csv_file = f"supabase_quick_migration_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        with open(csv_file, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            
            # 헤더
            headers = [
                'apartment_name', 'region_name', 'legal_dong', 'jibun', 
                'road_name', 'deal_type', 'deal_year', 'deal_month', 'deal_day',
                'deal_amount', 'area', 'floor', 'longitude', 'latitude', 
                'coordinate_source', 'coordinates_wkt'
            ]
            writer.writerow(headers)
            
            # 데이터
            for row in data:
                coordinates_wkt = f"POINT({row[12]} {row[13]})" if row[12] and row[13] else None
                
                csv_row = list(row) + [coordinates_wkt or '']
                writer.writerow(csv_row)
        
        file_size = os.path.getsize(csv_file) / 1024 / 1024
        print(f"✅ CSV 생성: {csv_file} ({file_size:.1f} MB)")
        
        # 통계
        regions = set(row[1] for row in data if row[1])
        complexes = set((row[0], row[1]) for row in data if row[0] and row[1])
        
        print(f"📊 통계:")
        print(f"  지역: {len(regions)}개")
        print(f"  단지: {len(complexes)}개")
        print(f"  평균: {len(data)/len(complexes):.1f}건/단지")
        
        conn.close()
        
        print("\n🎉 마이그레이션 준비 완료!")
        print("📋 다음 단계:")
        print("  1. Supabase 대시보드 → SQL Editor")
        print("  2. PostGIS 확장 및 테이블 생성")
        print(f"  3. CSV 업로드: {csv_file}")
        
        return csv_file
        
    except Exception as e:
        print(f"❌ 오류: {e}")
        return None

if __name__ == "__main__":
    quick_migration()