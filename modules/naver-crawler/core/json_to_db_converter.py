#!/usr/bin/env python3
"""
JSON 크롤링 데이터를 네이버 전용 데이터베이스로 변환하는 시스템
크롤링된 JSON 파일들을 분석해서 정규화된 DB 스키마로 저장
"""

import sqlite3
import json
import os
import re
from datetime import datetime
from pathlib import Path
import logging

class JsonToDbConverter:
    def __init__(self):
        self.data_dir = Path(__file__).parent.parent / "data"
        self.output_dir = self.data_dir / "output"
        self.db_path = self.data_dir / "naver_crawled_data.db"
        
        # 로깅 설정
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
        self.stats = {
            'json_files_processed': 0,
            'complexes_created': 0,
            'listings_created': 0,
            'errors': 0
        }

    def initialize_database(self):
        """네이버 크롤링 데이터 전용 DB 스키마 생성"""
        self.logger.info("🔧 네이버 크롤링 DB 초기화 중...")
        
        # 기존 DB 삭제 (새로 시작)
        if self.db_path.exists():
            self.db_path.unlink()
        
        self.conn = sqlite3.connect(str(self.db_path))
        self.cursor = self.conn.cursor()
        
        # 아파트 단지 테이블
        self.cursor.execute("""
            CREATE TABLE apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT,
                address TEXT,
                latitude REAL,
                longitude REAL,
                completion_year INTEGER,
                total_households INTEGER,
                total_buildings INTEGER,
                area_range TEXT,
                source_url TEXT,
                crawled_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 매물 정보 테이블
        self.cursor.execute("""
            CREATE TABLE current_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT NOT NULL,
                listing_index INTEGER,
                deal_type TEXT,
                price_text TEXT,
                price_amount INTEGER,  -- 만원 단위
                area_info TEXT,
                floor_info TEXT,
                direction TEXT,
                description TEXT,
                original_text TEXT,
                extracted_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (complex_id) REFERENCES apartment_complexes(complex_id)
            )
        """)
        
        # 크롤링 메타데이터 테이블
        self.cursor.execute("""
            CREATE TABLE crawling_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT NOT NULL,
                json_filename TEXT,
                crawler_version TEXT,
                crawl_method TEXT,
                crawled_at TIMESTAMP,
                processing_status TEXT DEFAULT 'processed',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 인덱스 생성
        self.cursor.execute("CREATE INDEX idx_complex_id ON current_listings(complex_id)")
        self.cursor.execute("CREATE INDEX idx_deal_type ON current_listings(deal_type)")
        self.cursor.execute("CREATE INDEX idx_complex_name ON apartment_complexes(complex_name)")
        
        self.conn.commit()
        self.logger.info("✅ DB 스키마 생성 완료")

    def process_json_files(self, limit=None):
        """JSON 파일들을 처리해서 DB에 저장"""
        self.logger.info("🚀 JSON 파일 처리 시작")
        
        json_files = list(self.output_dir.glob("enhanced_complex_*.json"))
        
        if limit:
            json_files = json_files[:limit]
        
        self.logger.info(f"📊 {len(json_files)}개 파일 처리 예정")
        
        for json_file in json_files:
            try:
                self.process_single_json(json_file)
                self.stats['json_files_processed'] += 1
                
                if self.stats['json_files_processed'] % 50 == 0:
                    self.logger.info(f"✅ {self.stats['json_files_processed']}개 파일 처리 완료")
                    self.print_stats()
                    
            except Exception as e:
                self.logger.error(f"❌ 파일 처리 실패 ({json_file.name}): {e}")
                self.stats['errors'] += 1
                continue
        
        self.conn.commit()
        self.print_final_stats()

    def process_single_json(self, json_file):
        """단일 JSON 파일 처리"""
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 1. 단지 정보 추출
        complex_info = self.extract_complex_info(data)
        if not complex_info:
            return
        
        # 2. 단지 정보 저장
        self.save_complex_info(complex_info)
        
        # 3. 매물 정보 추출 및 저장
        listings = self.extract_listings(data, complex_info['complex_id'])
        for listing in listings:
            self.save_listing(listing)
        
        # 4. 메타데이터 저장
        self.save_metadata(data, json_file.name)

    def extract_complex_info(self, data):
        """JSON에서 단지 정보 추출"""
        basic_info = data.get('basic_info', {})
        crawler_info = data.get('crawler_info', {})
        listings = data.get('current_listings', [])
        
        complex_id = basic_info.get('complexId') or crawler_info.get('complex_id')
        if not complex_id:
            return None
        
        # 매물에서 단지명 추출
        complex_name = self.extract_complex_name_from_listings(listings)
        
        # 좌표 추출 (URL에서)
        lat, lng = self.extract_coordinates(basic_info.get('url', ''))
        
        return {
            'complex_id': str(complex_id),
            'complex_name': complex_name,
            'address': self.extract_address_from_url(basic_info.get('url', '')),
            'latitude': lat,
            'longitude': lng,
            'source_url': basic_info.get('source_url') or basic_info.get('url'),
            'crawled_at': crawler_info.get('crawled_at') or basic_info.get('extracted_at'),
            'listing_count': len(listings)
        }

    def extract_complex_name_from_listings(self, listings):
        """매물 텍스트에서 단지명 추출"""
        if not listings:
            return '정보없음'
        
        for listing in listings[:3]:  # 처음 3개 매물에서 시도
            text = listing.get('text', '')
            if text:
                # "정든한진6차 601동매매14억..." 패턴에서 단지명 추출
                match = re.match(r'^([^\s]+(?:\s*\d+차)?)', text)
                if match:
                    name = match.group(1).strip()
                    # 일반적이지 않은 이름 필터링
                    if len(name) > 2 and '동매매' not in name and '동전세' not in name:
                        return name
        
        return '정보없음'

    def extract_coordinates(self, url):
        """URL에서 좌표 추출"""
        if not url:
            return None, None
        
        # ms=37.36286,127.115578,17 패턴에서 좌표 추출
        match = re.search(r'ms=([0-9.]+),([0-9.]+)', url)
        if match:
            return float(match.group(1)), float(match.group(2))
        
        return None, None

    def extract_address_from_url(self, url):
        """URL에서 주소 정보 추출"""
        if not url:
            return ''
        
        lat, lng = self.extract_coordinates(url)
        if lat and lng:
            return f"추정좌표: {lat}, {lng}"
        
        return ''

    def extract_listings(self, data, complex_id):
        """JSON에서 매물 정보 추출"""
        listings = data.get('current_listings', [])
        result = []
        
        for listing in listings:
            deal_type = self.normalize_deal_type(listing.get('deal_type'))
            if not deal_type:
                continue
            
            price_amount = self.parse_price(listing.get('price'))
            
            result.append({
                'complex_id': complex_id,
                'listing_index': listing.get('index'),
                'deal_type': deal_type,
                'price_text': listing.get('price'),
                'price_amount': price_amount,
                'area_info': listing.get('area'),
                'floor_info': listing.get('floor'),
                'description': self.clean_text(listing.get('text', '')),
                'original_text': listing.get('text'),
                'extracted_at': listing.get('extracted_at')
            })
        
        return result

    def normalize_deal_type(self, deal_type):
        """거래유형 정규화"""
        if not deal_type:
            return None
        
        deal_type = deal_type.lower().strip()
        if '매매' in deal_type or deal_type == 'sale':
            return '매매'
        elif '전세' in deal_type or deal_type == 'jeonse':
            return '전세'
        elif '월세' in deal_type or deal_type == 'monthly':
            return '월세'
        
        return None

    def parse_price(self, price_str):
        """가격 문자열을 숫자로 변환 (만원 단위)"""
        if not price_str:
            return None
        
        # "14억 5,000", "8억", "22억" 등의 형식 파싱
        clean_price = re.sub(r'[,\s]', '', price_str)
        
        # 억원 단위 추출
        billion_match = re.search(r'(\d+(?:\.\d+)?)억', clean_price)
        if billion_match:
            amount = float(billion_match.group(1)) * 10000  # 만원 단위로 변환
            
            # 천만원 단위 추가
            thousand_match = re.search(r'(\d+)천', clean_price)
            if thousand_match:
                amount += int(thousand_match.group(1)) * 1000
            
            return int(amount)
        
        # 만원 단위만 있는 경우
        million_match = re.search(r'(\d+)만', clean_price)
        if million_match:
            return int(million_match.group(1))
        
        return None

    def clean_text(self, text):
        """텍스트 정리"""
        if not text:
            return ''
        
        # 단지명 부분 제거하고 설명만 추출
        parts = text.split(' ', 2)
        if len(parts) >= 3:
            return parts[2]  # 단지명과 동호수 제거
        
        return text

    def save_complex_info(self, complex_info):
        """단지 정보 DB 저장"""
        try:
            self.cursor.execute("""
                INSERT OR REPLACE INTO apartment_complexes 
                (complex_id, complex_name, address, latitude, longitude, 
                 source_url, crawled_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                complex_info['complex_id'],
                complex_info['complex_name'],
                complex_info['address'],
                complex_info['latitude'],
                complex_info['longitude'],
                complex_info['source_url'],
                complex_info['crawled_at']
            ))
            
            self.stats['complexes_created'] += 1
            
        except sqlite3.IntegrityError:
            # 이미 존재하는 경우 업데이트
            self.cursor.execute("""
                UPDATE apartment_complexes 
                SET complex_name = ?, address = ?, latitude = ?, longitude = ?
                WHERE complex_id = ?
            """, (
                complex_info['complex_name'],
                complex_info['address'],
                complex_info['latitude'],
                complex_info['longitude'],
                complex_info['complex_id']
            ))

    def save_listing(self, listing):
        """매물 정보 DB 저장"""
        self.cursor.execute("""
            INSERT INTO current_listings 
            (complex_id, listing_index, deal_type, price_text, price_amount,
             area_info, floor_info, description, original_text, extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            listing['complex_id'],
            listing['listing_index'],
            listing['deal_type'],
            listing['price_text'],
            listing['price_amount'],
            listing['area_info'],
            listing['floor_info'],
            listing['description'],
            listing['original_text'],
            listing['extracted_at']
        ))
        
        self.stats['listings_created'] += 1

    def save_metadata(self, data, filename):
        """크롤링 메타데이터 저장"""
        basic_info = data.get('basic_info', {})
        crawler_info = data.get('crawler_info', {})
        
        complex_id = basic_info.get('complexId') or crawler_info.get('complex_id')
        
        self.cursor.execute("""
            INSERT INTO crawling_metadata 
            (complex_id, json_filename, crawler_version, crawl_method, crawled_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            str(complex_id),
            filename,
            crawler_info.get('version'),
            crawler_info.get('crawl_method'),
            crawler_info.get('crawled_at')
        ))

    def print_stats(self):
        """중간 통계 출력"""
        self.logger.info(f"   📊 현재까지: 단지 {self.stats['complexes_created']}개, "
                        f"매물 {self.stats['listings_created']}개")

    def print_final_stats(self):
        """최종 통계 출력"""
        print("\n" + "="*60)
        print("🎉 JSON → DB 변환 완료!")
        print("="*60)
        print(f"📊 최종 변환 결과:")
        print(f"   • JSON 파일 처리: {self.stats['json_files_processed']}개")
        print(f"   • 아파트 단지 생성: {self.stats['complexes_created']}개")
        print(f"   • 매물 정보 생성: {self.stats['listings_created']}개")
        print(f"   • 오류 발생: {self.stats['errors']}개")
        
        # DB 최종 확인
        complex_count = self.cursor.execute("SELECT COUNT(*) FROM apartment_complexes").fetchone()[0]
        listing_count = self.cursor.execute("SELECT COUNT(*) FROM current_listings").fetchone()[0]
        
        print(f"\n✅ DB 최종 상태:")
        print(f"   • 총 단지 수: {complex_count}개")
        print(f"   • 총 매물 수: {listing_count}개")
        print(f"   • DB 파일: {self.db_path}")
        print("="*60)

    def run(self, limit=100):
        """전체 변환 프로세스 실행"""
        try:
            self.initialize_database()
            self.process_json_files(limit=limit)
            
            # 샘플 데이터 확인
            self.logger.info("\n📋 샘플 데이터 확인:")
            self.cursor.execute("""
                SELECT complex_name, COUNT(*) as listing_count 
                FROM apartment_complexes c 
                LEFT JOIN current_listings l ON c.complex_id = l.complex_id 
                WHERE complex_name != '정보없음'
                GROUP BY c.complex_id 
                ORDER BY listing_count DESC 
                LIMIT 5
            """)
            
            for row in self.cursor.fetchall():
                self.logger.info(f"   • {row[0]}: {row[1]}개 매물")
            
        except Exception as e:
            self.logger.error(f"❌ 변환 실패: {e}")
        finally:
            if hasattr(self, 'conn'):
                self.conn.close()

if __name__ == "__main__":
    converter = JsonToDbConverter()
    converter.run(limit=100)  # 처음 100개 파일만 처리