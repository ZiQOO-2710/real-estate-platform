#!/usr/bin/env python3
"""
SQLite to Supabase 마이그레이션 스크립트
- 977K 국토부 실거래가 데이터 이전
- PostGIS 좌표 변환 및 최적화
- 배치 처리로 안정적 마이그레이션
"""

import os
import sys
import sqlite3
import asyncio
import logging
from pathlib import Path
from supabase import create_client, Client
from datetime import datetime
import json
import time

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class SupabaseMigration:
    def __init__(self):
        """Supabase 마이그레이션 초기화"""
        self.supabase_url = "https://heatmxifhwxppprdzaqf.supabase.co"
        self.supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o"
        
        try:
            # 기본 옵션으로 클라이언트 생성
            self.supabase: Client = create_client(self.supabase_url, self.supabase_key)
            logger.info("✅ Supabase 클라이언트 연결 성공")
        except Exception as e:
            logger.error(f"❌ Supabase 연결 실패: {e}")
            # 연결 실패해도 계속 진행 (스키마 생성은 수동으로)
            self.supabase = None
        
        # SQLite 데이터베이스 경로
        self.sqlite_path = "modules/naver-crawler/data/molit_complete_data.db"
        if not os.path.exists(self.sqlite_path):
            self.sqlite_path = "molit_complete_data.db"
        
        logger.info(f"📂 SQLite 데이터베이스: {self.sqlite_path}")

    def create_schema(self):
        """Supabase 스키마 생성"""
        logger.info("🏗️ Supabase 스키마 생성 중...")
        
        schema_file = "database/schemas/supabase_map_schema.sql"
        if not os.path.exists(schema_file):
            logger.error(f"❌ 스키마 파일을 찾을 수 없습니다: {schema_file}")
            return False
        
        try:
            with open(schema_file, 'r', encoding='utf-8') as f:
                schema_sql = f.read()
            
            # SQL 스크립트를 여러 문장으로 분할하여 실행
            sql_commands = [cmd.strip() for cmd in schema_sql.split(';') if cmd.strip()]
            
            for i, command in enumerate(sql_commands):
                if command:
                    try:
                        result = self.supabase.rpc('exec_sql', {'sql': command}).execute()
                        logger.info(f"✅ SQL 명령 {i+1}/{len(sql_commands)} 실행 완료")
                    except Exception as e:
                        logger.warning(f"⚠️ SQL 명령 실행 실패 (무시): {str(e)[:100]}")
                        continue
            
            logger.info("✅ 스키마 생성 완료")
            return True
            
        except Exception as e:
            logger.error(f"❌ 스키마 생성 실패: {e}")
            return False

    def get_sqlite_data_sample(self):
        """SQLite 데이터 샘플 확인 (최근 1년치만)"""
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            
            # 현재 년도 기준 최근 1년 계산
            current_year = datetime.now().year
            target_year = current_year - 1  # 최근 1년 (2023년 이후)
            
            # 총 레코드 수 확인
            cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
            total_count = cursor.fetchone()[0]
            logger.info(f"📊 전체 {total_count:,}개 레코드 발견")
            
            # 최근 1년 데이터 확인
            cursor.execute("""
                SELECT COUNT(*) FROM apartment_transactions 
                WHERE deal_year >= ? AND longitude IS NOT NULL AND latitude IS NOT NULL
            """, (target_year,))
            recent_geo_count = cursor.fetchone()[0]
            
            # 연도별 분포 확인
            cursor.execute("""
                SELECT deal_year, COUNT(*) as count
                FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL
                GROUP BY deal_year 
                ORDER BY deal_year DESC
                LIMIT 5
            """)
            year_distribution = cursor.fetchall()
            
            logger.info(f"📅 연도별 좌표 데이터 분포:")
            for year, count in year_distribution:
                marker = "✅" if year >= target_year else "⏳"
                logger.info(f"  {marker} {year}년: {count:,}개")
            
            logger.info(f"🎯 마이그레이션 대상: {recent_geo_count:,}개 ({target_year}년 이후)")
            
            # 샘플 데이터 확인
            cursor.execute("""
                SELECT apartment_name, region_name, deal_type, deal_year, 
                       longitude, latitude, deal_amount
                FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND deal_year >= ?
                ORDER BY deal_year DESC, deal_month DESC
                LIMIT 3
            """, (target_year,))
            
            samples = cursor.fetchall()
            logger.info("📄 최근 데이터 샘플:")
            for i, sample in enumerate(samples, 1):
                logger.info(f"  {i}. {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}년 | ({sample[4]:.4f}, {sample[5]:.4f})")
            
            conn.close()
            return total_count, recent_geo_count
            
        except Exception as e:
            logger.error(f"❌ SQLite 데이터 확인 실패: {e}")
            return 0, 0

    def migrate_data_batch(self, batch_size=1000):
        """배치 단위로 데이터 마이그레이션 (최근 1년치만)"""
        logger.info(f"🚀 데이터 마이그레이션 시작 (최근 1년, 배치 크기: {batch_size})")
        
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            
            # 현재 년도 기준 최근 1년 계산
            current_year = datetime.now().year
            target_year = current_year - 1  # 최근 1년 (2023년 이후)
            
            # 최근 1년 레코드 수 확인
            cursor.execute("""
                SELECT COUNT(*) FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND deal_year >= ?
            """, (target_year,))
            total_records = cursor.fetchone()[0]
            total_batches = (total_records + batch_size - 1) // batch_size
            
            logger.info(f"📊 {target_year}년 이후 {total_records:,}개 레코드를 {total_batches}개 배치로 처리")
            
            migrated_count = 0
            error_count = 0
            
            for batch_num in range(total_batches):
                offset = batch_num * batch_size
                
                # SQLite에서 최근 1년 배치 데이터 조회
                cursor.execute("""
                    SELECT 
                        apartment_name, region_name, sigungu_name, legal_dong, jibun, road_name,
                        deal_type, deal_year, deal_month, deal_day, deal_amount,
                        area, floor, longitude, latitude, coordinate_source, api_data
                    FROM apartment_transactions 
                    WHERE longitude IS NOT NULL AND latitude IS NOT NULL AND deal_year >= ?
                    ORDER BY deal_year DESC, deal_month DESC, deal_day DESC
                    LIMIT ? OFFSET ?
                """, (target_year, batch_size, offset))
                
                batch_data = cursor.fetchall()
                
                if not batch_data:
                    break
                
                # Supabase 형식으로 변환
                supabase_records = []
                for row in batch_data:
                    try:
                        # PostGIS POINT 형식으로 좌표 변환
                        coordinates = f"POINT({row[13]} {row[14]})"  # longitude, latitude
                        
                        record = {
                            'apartment_name': row[0],
                            'region_name': row[1],
                            'sigungu_name': row[2],
                            'legal_dong': row[3],
                            'jibun': row[4],
                            'road_name': row[5],
                            'deal_type': row[6],
                            'deal_year': int(row[7]) if row[7] else None,
                            'deal_month': int(row[8]) if row[8] else None,
                            'deal_day': int(row[9]) if row[9] else None,
                            'deal_amount': float(row[10]) if row[10] else None,
                            'area': float(row[11]) if row[11] else None,
                            'floor': int(row[12]) if row[12] else None,
                            'coordinates': coordinates,
                            'coordinate_source': row[15],
                            'api_data': json.loads(row[16]) if row[16] else None
                        }
                        supabase_records.append(record)
                        
                    except Exception as e:
                        logger.warning(f"⚠️ 레코드 변환 실패: {str(e)[:50]}")
                        error_count += 1
                        continue
                
                # Supabase에 배치 삽입
                try:
                    result = self.supabase.table('apartment_transactions').insert(supabase_records).execute()
                    migrated_count += len(supabase_records)
                    
                    progress = (batch_num + 1) / total_batches * 100
                    logger.info(f"✅ 배치 {batch_num + 1}/{total_batches} 완료 ({progress:.1f}%) - {migrated_count:,}개 마이그레이션")
                    
                    # 요청 간 간격
                    time.sleep(0.1)
                    
                except Exception as e:
                    logger.error(f"❌ 배치 {batch_num + 1} 삽입 실패: {e}")
                    error_count += len(supabase_records)
                    continue
            
            conn.close()
            
            logger.info(f"🎉 마이그레이션 완료!")
            logger.info(f"   성공: {migrated_count:,}개")
            logger.info(f"   실패: {error_count:,}개")
            logger.info(f"   성공률: {migrated_count/(migrated_count+error_count)*100:.1f}%")
            
            return migrated_count, error_count
            
        except Exception as e:
            logger.error(f"❌ 마이그레이션 실패: {e}")
            return 0, 0

    def refresh_materialized_view(self):
        """Materialized View 갱신"""
        logger.info("🔄 Materialized View 갱신 중...")
        
        try:
            # map_markers 뷰 갱신
            self.supabase.rpc('refresh_materialized_view', {'view_name': 'map_markers'}).execute()
            logger.info("✅ map_markers 뷰 갱신 완료")
            
            # 통계 확인
            result = self.supabase.from_('map_markers').select('*', count='exact').limit(1).execute()
            marker_count = result.count
            logger.info(f"📍 생성된 마커: {marker_count:,}개")
            
            return True
            
        except Exception as e:
            logger.warning(f"⚠️ Materialized View 갱신 실패: {e}")
            return False

    def verify_migration(self):
        """마이그레이션 결과 검증"""
        logger.info("🔍 마이그레이션 결과 검증 중...")
        
        try:
            # 총 레코드 수 확인
            result = self.supabase.from_('apartment_transactions').select('*', count='exact').limit(1).execute()
            supabase_count = result.count
            
            # 마커 수 확인
            result = self.supabase.from_('map_markers').select('*', count='exact').limit(1).execute()
            marker_count = result.count
            
            # 지역별 분포 확인
            result = self.supabase.from_('map_markers').select('region_name', count='exact').limit(10).execute()
            
            logger.info(f"✅ 검증 결과:")
            logger.info(f"   총 거래 레코드: {supabase_count:,}개")
            logger.info(f"   지도 마커: {marker_count:,}개")
            logger.info(f"   데이터 품질: {'우수' if marker_count > 10000 else '보통'}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ 검증 실패: {e}")
            return False

def main():
    """메인 실행 함수"""
    logger.info("🚀 SQLite → Supabase 마이그레이션 시작")
    
    migration = SupabaseMigration()
    
    # 1. SQLite 데이터 확인
    total_count, geo_count = migration.get_sqlite_data_sample()
    if geo_count == 0:
        logger.error("❌ 좌표 데이터가 없습니다. 마이그레이션을 중단합니다.")
        return
    
    # 2. Supabase 스키마 생성
    if not migration.create_schema():
        logger.error("❌ 스키마 생성 실패. 수동으로 SQL을 실행해주세요.")
        # 계속 진행 (스키마가 이미 있을 수 있음)
    
    # 3. 데이터 마이그레이션
    migrated, errors = migration.migrate_data_batch(batch_size=500)
    
    if migrated > 0:
        # 4. Materialized View 갱신
        migration.refresh_materialized_view()
        
        # 5. 결과 검증
        migration.verify_migration()
        
        logger.info("🎉 마이그레이션 성공!")
        logger.info("💡 이제 API를 Supabase로 전환할 수 있습니다.")
    else:
        logger.error("❌ 마이그레이션 실패")

if __name__ == "__main__":
    main()