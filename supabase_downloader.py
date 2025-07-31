#!/usr/bin/env python3
"""
Supabase 데이터베이스 다운로드 스크립트
46,539개 레코드를 효율적으로 다운로드
"""

import psycopg2
import pandas as pd
import json
import os
from datetime import datetime
import sys

# Supabase 연결 정보
SUPABASE_CONFIG = {
    'host': 'db.dbwcpgdpjeiezwgbijcj.supabase.co',
    'database': 'postgres',
    'user': 'postgres',
    'password': '2pf5S38cjaIL9Sj3',
    'port': 5432
}

def connect_to_supabase():
    """Supabase PostgreSQL 데이터베이스에 연결"""
    try:
        print("Supabase 데이터베이스 연결 중...")
        conn = psycopg2.connect(**SUPABASE_CONFIG)
        print("연결 성공!")
        return conn
    except Exception as e:
        print(f"연결 실패: {e}")
        return None

def get_table_info(conn):
    """데이터베이스 테이블 정보 조회"""
    try:
        cursor = conn.cursor()
        
        # 모든 테이블 목록 조회
        cursor.execute("""
            SELECT table_name, table_type
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        """)
        
        tables = cursor.fetchall()
        print(f"\n발견된 테이블: {len(tables)}개")
        
        table_info = {}
        for table_name, table_type in tables:
            # 각 테이블의 레코드 수 조회
            cursor.execute(f"SELECT COUNT(*) FROM public.{table_name};")
            count = cursor.fetchone()[0]
            table_info[table_name] = count
            print(f"- {table_name}: {count:,}개 레코드")
        
        return table_info
    except Exception as e:
        print(f"❌ 테이블 정보 조회 실패: {e}")
        return {}

def download_table_data(conn, table_name, output_dir="supabase_backup"):
    """특정 테이블 데이터 다운로드"""
    try:
        print(f"\n'{table_name}' 테이블 다운로드 중...")
        
        # 출력 디렉토리 생성
        os.makedirs(output_dir, exist_ok=True)
        
        # pandas를 사용한 효율적인 데이터 읽기
        query = f"SELECT * FROM public.{table_name};"
        df = pd.read_sql_query(query, conn)
        
        print(f"{len(df):,}개 레코드 로드 완료")
        
        # 여러 형식으로 저장
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # 1. CSV 형식
        csv_file = os.path.join(output_dir, f"{table_name}_{timestamp}.csv")
        df.to_csv(csv_file, index=False, encoding='utf-8')
        print(f"CSV 저장: {csv_file}")
        
        # 2. JSON 형식 (작은 테이블의 경우)
        if len(df) < 10000:
            json_file = os.path.join(output_dir, f"{table_name}_{timestamp}.json")
            df.to_json(json_file, orient='records', indent=2, ensure_ascii=False)
            print(f"JSON 저장: {json_file}")
        
        # 3. Parquet 형식 (대용량 데이터에 효율적)
        try:
            parquet_file = os.path.join(output_dir, f"{table_name}_{timestamp}.parquet")
            df.to_parquet(parquet_file, index=False)
            print(f"Parquet 저장: {parquet_file}")
        except ImportError:
            print("Parquet 저장 실패 (pyarrow 패키지 필요)")
        
        return df
        
    except Exception as e:
        print(f"'{table_name}' 다운로드 실패: {e}")
        return None

def create_sql_dump(conn, output_dir="supabase_backup"):
    """SQL 덤프 파일 생성"""
    try:
        print(f"\n📝 SQL 덤프 생성 중...")
        
        cursor = conn.cursor()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        sql_file = os.path.join(output_dir, f"supabase_dump_{timestamp}.sql")
        
        # 테이블 목록 조회
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' ORDER BY table_name;
        """)
        tables = [row[0] for row in cursor.fetchall()]
        
        with open(sql_file, 'w', encoding='utf-8') as f:
            f.write("-- Supabase Database Dump\n")
            f.write(f"-- Generated: {datetime.now()}\n")
            f.write("-- Total Tables: {}\n\n".format(len(tables)))
            
            for table_name in tables:
                f.write(f"-- Table: {table_name}\n")
                
                # 테이블 스키마
                cursor.execute(f"""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns 
                    WHERE table_name = '{table_name}' AND table_schema = 'public'
                    ORDER BY ordinal_position;
                """)
                columns = cursor.fetchall()
                
                f.write(f"CREATE TABLE IF NOT EXISTS {table_name} (\n")
                col_definitions = []
                for col_name, data_type, is_nullable in columns:
                    nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
                    col_definitions.append(f"    {col_name} {data_type} {nullable}")
                f.write(",\n".join(col_definitions))
                f.write("\n);\n\n")
        
        print(f"✅ SQL 덤프 저장: {sql_file}")
        return sql_file
        
    except Exception as e:
        print(f"❌ SQL 덤프 생성 실패: {e}")
        return None

def main():
    """메인 실행 함수"""
    print("🚀 Supabase 데이터베이스 다운로드 시작")
    
    # 데이터베이스 연결
    conn = connect_to_supabase()
    if not conn:
        return
    
    try:
        # 테이블 정보 조회
        table_info = get_table_info(conn)
        
        if not table_info:
            print("❌ 테이블을 찾을 수 없습니다.")
            return
        
        # 사용자 선택
        print(f"\n📋 다운로드 옵션:")
        print("1. 모든 테이블 다운로드")
        print("2. 특정 테이블 선택")
        print("3. SQL 덤프만 생성")
        
        choice = input("\n선택하세요 (1-3): ").strip()
        
        if choice == "1":
            # 모든 테이블 다운로드
            for table_name in table_info.keys():
                download_table_data(conn, table_name)
            create_sql_dump(conn)
            
        elif choice == "2":
            # 특정 테이블 선택
            print("\n사용 가능한 테이블:")
            for i, (table_name, count) in enumerate(table_info.items(), 1):
                print(f"{i}. {table_name} ({count:,}개 레코드)")
            
            try:
                table_idx = int(input("\n테이블 번호를 선택하세요: ")) - 1
                table_names = list(table_info.keys())
                if 0 <= table_idx < len(table_names):
                    selected_table = table_names[table_idx]
                    download_table_data(conn, selected_table)
                else:
                    print("❌ 잘못된 테이블 번호입니다.")
            except ValueError:
                print("❌ 올바른 숫자를 입력하세요.")
                
        elif choice == "3":
            # SQL 덤프만 생성
            create_sql_dump(conn)
            
        else:
            print("❌ 잘못된 선택입니다.")
        
        print("\n🎉 다운로드 완료!")
        
    finally:
        conn.close()
        print("🔒 데이터베이스 연결 종료")

if __name__ == "__main__":
    main()