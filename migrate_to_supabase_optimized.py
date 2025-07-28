#!/usr/bin/env python3
"""
SQLite to Supabase 최적화 마이그레이션 스크립트
- 용량 제한 고려하여 주요 데이터만 선별
- 거래량 상위 단지 위주로 마이그레이션
- PostGIS 좌표 변환 및 최적화
"""

import os
import sys
import sqlite3
import logging
from datetime import datetime
import json
import time

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OptimizedSupabaseMigration:
    def __init__(self):
        """최적화된 Supabase 마이그레이션 초기화"""
        self.supabase_url = "https://heatmxifhwxppprdzaqf.supabase.co"
        self.supabase_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYXRteGlmaHd4cHBwcmR6YXFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0NzQ3OTMsImV4cCI6MjA2ODA1MDc5M30.NRcHrm5Y7ooHGkCxrD2QdStea-KnyVBIUCTpFB9x89o"
        
        # SQLite 데이터베이스 경로
        self.sqlite_path = "molit_complete_data.db"
        if not os.path.exists(self.sqlite_path):
            self.sqlite_path = "modules/naver-crawler/data/molit_complete_data.db"
        
        # 마이그레이션 설정
        self.target_records = 50000  # 목표 레코드 수 (용량 제한 고려)
        self.min_transactions_per_complex = 5  # 단지별 최소 거래 건수
        
        logger.info(f"📂 SQLite: {self.sqlite_path}")
        logger.info(f"🎯 목표: {self.target_records:,}개 레코드")

    def analyze_data_distribution(self):
        """데이터 분포 분석 및 선별 기준 결정"""
        logger.info("📊 데이터 분포 분석 중...")
        
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            
            # 총 데이터 현황
            cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
            total_count = cursor.fetchone()[0]
            
            cursor.execute("""
                SELECT COUNT(*) FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL
            """)
            geo_count = cursor.fetchone()[0]
            
            logger.info(f"📋 전체: {total_count:,}개, 좌표: {geo_count:,}개")
            
            # 지역별 분포 (거래량 상위 10개 지역)
            cursor.execute("""
                SELECT region_name, COUNT(*) as count
                FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL
                GROUP BY region_name 
                ORDER BY count DESC 
                LIMIT 10
            """)
            
            region_stats = cursor.fetchall()
            logger.info("🏘️ 지역별 거래량 TOP 10:")
            for region, count in region_stats:
                logger.info(f"  {region}: {count:,}개")
            
            # 단지별 거래량 분포
            cursor.execute("""
                SELECT apartment_name, region_name, COUNT(*) as transactions
                FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL
                GROUP BY apartment_name, region_name
                HAVING transactions >= ?
                ORDER BY transactions DESC
                LIMIT 20
            """, (self.min_transactions_per_complex,))
            
            complex_stats = cursor.fetchall()
            logger.info(f"🏢 거래량 {self.min_transactions_per_complex}건 이상 단지 TOP 20:")
            for apt_name, region, transactions in complex_stats[:10]:
                logger.info(f"  {apt_name} ({region}): {transactions}건")
            
            # 선별 기준 결정
            cursor.execute("""
                SELECT COUNT(DISTINCT apartment_name)
                FROM apartment_transactions 
                WHERE longitude IS NOT NULL AND latitude IS NOT NULL
            """)
            unique_complexes = cursor.fetchone()[0]
            
            # 평균 거래량 계산
            avg_transactions = geo_count / unique_complexes
            recommended_min = max(3, int(avg_transactions * 0.5))  # 평균의 50% 이상
            
            logger.info(f"📈 분석 결과:")
            logger.info(f"  고유 단지: {unique_complexes:,}개")
            logger.info(f"  평균 거래량: {avg_transactions:.1f}건/단지")
            logger.info(f"  권장 최소 거래량: {recommended_min}건")
            
            conn.close()
            
            # 선별 기준 조정
            self.min_transactions_per_complex = max(self.min_transactions_per_complex, recommended_min)
            
            return True
            
        except Exception as e:
            logger.error(f"❌ 데이터 분석 실패: {e}")
            return False

    def select_priority_data(self):
        """우선순위 기준으로 데이터 선별"""
        logger.info(f"🎯 우선순위 데이터 선별 중 (최소 {self.min_transactions_per_complex}건/단지)...")
        
        try:
            conn = sqlite3.connect(self.sqlite_path)
            cursor = conn.cursor()
            
            # 거래량 기준 상위 단지들의 데이터 선별
            cursor.execute("""
                WITH ranked_complexes AS (
                    SELECT 
                        apartment_name, 
                        region_name,
                        COUNT(*) as transaction_count,
                        AVG(CAST(longitude AS REAL)) as avg_lng,
                        AVG(CAST(latitude AS REAL)) as avg_lat
                    FROM apartment_transactions 
                    WHERE longitude IS NOT NULL 
                      AND latitude IS NOT NULL
                      AND apartment_name IS NOT NULL
                    GROUP BY apartment_name, region_name
                    HAVING transaction_count >= ?
                    ORDER BY transaction_count DESC
                )
                SELECT 
                    at.apartment_name, at.region_name, at.legal_dong, 
                    at.jibun, at.road_name, at.deal_type, 
                    at.deal_year, at.deal_month, at.deal_day, 
                    at.deal_amount, at.area, at.floor, 
                    at.longitude, at.latitude, at.coordinate_source, 
                    at.api_data, rc.transaction_count
                FROM apartment_transactions at
                INNER JOIN ranked_complexes rc 
                    ON at.apartment_name = rc.apartment_name 
                    AND at.region_name = rc.region_name
                WHERE at.longitude IS NOT NULL 
                  AND at.latitude IS NOT NULL
                ORDER BY rc.transaction_count DESC, at.apartment_name
                LIMIT ?
            """, (self.min_transactions_per_complex, self.target_records))
            
            selected_data = cursor.fetchall()
            conn.close()
            
            logger.info(f"✅ {len(selected_data):,}개 레코드 선별 완료")
            
            if selected_data:
                # 선별된 데이터 통계
                complexes_set = set()
                regions_set = set()
                
                for row in selected_data:
                    complexes_set.add((row[0], row[1]))  # apartment_name, region_name
                    regions_set.add(row[1])  # region_name
                
                logger.info(f"📊 선별 결과:")
                logger.info(f"  단지 수: {len(complexes_set):,}개")
                logger.info(f"  지역 수: {len(regions_set):,}개")
                logger.info(f"  평균 거래량: {len(selected_data)/len(complexes_set):.1f}건/단지")
            
            return selected_data
            
        except Exception as e:
            logger.error(f"❌ 데이터 선별 실패: {e}")
            return []

    def create_supabase_schema_manually(self):
        """Supabase 스키마 수동 생성 안내"""
        logger.info("📋 Supabase 스키마 수동 생성이 필요합니다.")
        
        schema_file = "database/schemas/supabase_map_schema.sql"
        
        if os.path.exists(schema_file):
            logger.info(f"📄 스키마 파일 위치: {schema_file}")
            logger.info("💡 다음 단계:")
            logger.info("  1. Supabase 대시보드 → SQL Editor 접속")
            logger.info("  2. 위 스키마 파일 내용을 복사하여 실행")
            logger.info("  3. PostGIS 확장이 활성화되었는지 확인")
            
            # 핵심 스키마만 출력
            logger.info("\n🔑 핵심 테이블 생성 SQL:")
            print("""
-- PostGIS 확장 활성화
CREATE EXTENSION IF NOT EXISTS postgis;

-- 아파트 실거래가 테이블
CREATE TABLE IF NOT EXISTS apartment_transactions (
    id BIGSERIAL PRIMARY KEY,
    apartment_name VARCHAR(200) NOT NULL,
    region_name VARCHAR(100) NOT NULL,
    deal_type VARCHAR(20) NOT NULL,
    deal_amount NUMERIC(15,2),
    coordinates GEOGRAPHY(POINT, 4326),
    coordinate_source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 지리공간 인덱스
CREATE INDEX IF NOT EXISTS idx_coordinates_gist ON apartment_transactions USING GIST (coordinates);
            """)
        
        return True

    def export_to_csv(self, data):
        """CSV 파일로 내보내기 (Supabase 수동 업로드용)"""
        logger.info("📝 CSV 파일 생성 중...")
        
        try:
            import csv
            
            csv_file = f"supabase_migration_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            with open(csv_file, 'w', newline='', encoding='utf-8') as file:
                writer = csv.writer(file)
                
                # 헤더 작성
                headers = [
                    'apartment_name', 'region_name', 'legal_dong', 'jibun', 
                    'road_name', 'deal_type', 'deal_year', 'deal_month', 'deal_day', 
                    'deal_amount', 'area', 'floor', 'longitude', 'latitude', 
                    'coordinate_source', 'coordinates_wkt'
                ]
                writer.writerow(headers)
                
                # 데이터 작성
                for row in data:
                    # PostGIS POINT 형식으로 변환
                    coordinates_wkt = f"POINT({row[12]} {row[13]})" if row[12] and row[13] else None
                    
                    csv_row = [
                        row[0] or '',  # apartment_name
                        row[1] or '',  # region_name
                        row[2] or '',  # legal_dong
                        row[3] or '',  # jibun
                        row[4] or '',  # road_name
                        row[5] or '',  # deal_type
                        row[6] or '',  # deal_year
                        row[7] or '',  # deal_month
                        row[8] or '',  # deal_day
                        row[9] or '',  # deal_amount
                        row[10] or '',  # area
                        row[11] or '',  # floor
                        row[12] or '',  # longitude
                        row[13] or '',  # latitude
                        row[14] or '',  # coordinate_source
                        coordinates_wkt or ''  # coordinates_wkt
                    ]
                    writer.writerow(csv_row)
            
            logger.info(f"✅ CSV 파일 생성 완료: {csv_file}")
            logger.info(f"📁 파일 크기: {os.path.getsize(csv_file) / 1024 / 1024:.1f} MB")
            
            return csv_file
            
        except Exception as e:
            logger.error(f"❌ CSV 생성 실패: {e}")
            return None

def main():
    """메인 실행 함수"""
    logger.info("🚀 SQLite → Supabase 최적화 마이그레이션 시작")
    
    migration = OptimizedSupabaseMigration()
    
    # 1. 데이터 분포 분석
    if not migration.analyze_data_distribution():
        logger.error("❌ 데이터 분석 실패")
        return
    
    # 2. 우선순위 데이터 선별
    selected_data = migration.select_priority_data()
    
    if not selected_data:
        logger.error("❌ 데이터 선별 실패")
        return
    
    # 3. 스키마 생성 안내
    migration.create_supabase_schema_manually()
    
    # 4. CSV 파일 생성
    csv_file = migration.export_to_csv(selected_data)
    
    if csv_file:
        logger.info("\n🎉 마이그레이션 준비 완료!")
        logger.info("📋 다음 단계:")
        logger.info("  1. Supabase 대시보드에서 스키마 생성")
        logger.info(f"  2. CSV 파일 업로드: {csv_file}")
        logger.info("  3. API 코드를 Supabase로 전환")
        logger.info("  4. 마커 표시 문제 해결 완료!")
    else:
        logger.error("❌ 마이그레이션 준비 실패")

if __name__ == "__main__":
    main()