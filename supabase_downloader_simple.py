#!/usr/bin/env python3
"""
Supabase 데이터베이스 다운로드 스크립트 (간단 버전)
"""

import psycopg2
import pandas as pd
import os
from datetime import datetime

# Supabase 연결 정보
SUPABASE_CONFIG = {
    'host': 'db.dbwcpgdpjeiezwgbijcj.supabase.co',
    'database': 'postgres',
    'user': 'postgres',
    'password': '2pf5S38cjaIL9Sj3',
    'port': 5432
}

def main():
    print("Supabase 데이터베이스 다운로드 시작")
    
    try:
        # 데이터베이스 연결
        print("데이터베이스 연결 중...")
        conn = psycopg2.connect(**SUPABASE_CONFIG)
        print("연결 성공!")
        
        cursor = conn.cursor()
        
        # 테이블 목록 조회
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        
        tables = [row[0] for row in cursor.fetchall()]
        print(f"발견된 테이블 수: {len(tables)}개")
        
        # 각 테이블의 레코드 수 확인
        for table_name in tables:
            cursor.execute(f"SELECT COUNT(*) FROM public.{table_name};")
            count = cursor.fetchone()[0]
            print(f"- {table_name}: {count:,}개 레코드")
        
        # 출력 디렉토리 생성
        output_dir = "supabase_backup"
        os.makedirs(output_dir, exist_ok=True)
        
        # 모든 테이블 다운로드
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        for table_name in tables:
            print(f"\n'{table_name}' 다운로드 중...")
            
            # 데이터 읽기
            query = f"SELECT * FROM public.{table_name};"
            df = pd.read_sql_query(query, conn)
            
            # CSV로 저장
            csv_file = os.path.join(output_dir, f"{table_name}_{timestamp}.csv")
            df.to_csv(csv_file, index=False, encoding='utf-8')
            
            print(f"저장 완료: {csv_file} ({len(df):,}개 레코드)")
        
        print("\n모든 테이블 다운로드 완료!")
        
    except Exception as e:
        print(f"오류 발생: {e}")
    
    finally:
        if 'conn' in locals():
            conn.close()
            print("데이터베이스 연결 종료")

if __name__ == "__main__":
    main()