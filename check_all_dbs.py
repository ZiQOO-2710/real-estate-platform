#!/usr/bin/env python3
"""
전체 데이터베이스 현황 점검 스크립트
"""
import sqlite3
import os
from datetime import datetime

def check_database(db_path):
    """데이터베이스 정보 조회"""
    if not os.path.exists(db_path):
        return None
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # 파일 크기
        file_size = os.path.getsize(db_path)
        file_size_mb = file_size / (1024 * 1024)
        
        # 테이블 목록
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        table_info = {}
        for table in tables:
            table_name = table[0]
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            table_info[table_name] = count
        
        conn.close()
        
        return {
            'file_size_mb': round(file_size_mb, 2),
            'tables': table_info
        }
    except Exception as e:
        return {'error': str(e)}

# 데이터베이스 목록
databases = [
    'molit_complete_data.db',
    'naver_property_listings.db', 
    'real_estate_crawling.db',
    'real_estate_crawling_backup.db',
    'real_estate_crawling_complete_20250725_111816.db'
]

print("=" * 80)
print("전체 데이터베이스 현황 점검")
print("=" * 80)

total_size = 0
total_records = 0

for db_name in databases:
    print(f"\n[DB] {db_name}")
    print("-" * 60)
    
    info = check_database(db_name)
    if info is None:
        print("파일이 존재하지 않습니다")
        continue
    
    if 'error' in info:
        print(f"오류: {info['error']}")
        continue
    
    print(f"파일 크기: {info['file_size_mb']} MB")
    total_size += info['file_size_mb']
    
    if info['tables']:
        print("테이블 정보:")
        for table_name, count in info['tables'].items():
            print(f"   - {table_name}: {count:,}개 레코드")
            total_records += count
    else:
        print("   테이블이 없습니다")

print("\n" + "=" * 80)
print("전체 요약")
print("=" * 80)
print(f"총 데이터베이스 크기: {total_size:.2f} MB")
print(f"총 레코드 수: {total_records:,}개")
print(f"점검 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")