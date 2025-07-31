"""
간단하고 안정적인 데이터 저장 프로세서
기존 스키마와 호환되도록 설계
"""

import json
import sqlite3
import re
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
import traceback

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SimpleDataProcessor:
    """간단하고 안정적인 데이터 처리 클래스"""
    
    def __init__(self, db_path: str = 'data/naver_real_estate.db'):
        self.db_path = db_path
        self.ensure_database_exists()
        
    def ensure_database_exists(self):
        """기존 스키마 기반 데이터베이스 생성"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 기존 스키마 재사용 (간단하게)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id VARCHAR(20) UNIQUE NOT NULL,
                complex_name VARCHAR(200),
                address VARCHAR(500),
                completion_year VARCHAR(20),
                total_households INTEGER,
                total_buildings INTEGER,
                area_range VARCHAR(100),
                source_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS current_listings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id VARCHAR(20) NOT NULL,
                listing_index INTEGER,
                selector_type VARCHAR(50),
                deal_type VARCHAR(20),
                price_text VARCHAR(50),
                price_amount BIGINT,
                monthly_rent INTEGER,
                deposit_amount BIGINT,
                area_sqm DECIMAL(8,2),
                area_pyeong DECIMAL(8,2),
                floor_info VARCHAR(20),
                direction VARCHAR(20),
                room_structure VARCHAR(50),
                description TEXT,
                raw_text TEXT,
                extracted_at TIMESTAMP,
                crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS crawling_metadata (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id VARCHAR(20) NOT NULL,
                crawler_version VARCHAR(50),
                crawl_method VARCHAR(50),
                success BOOLEAN DEFAULT TRUE,
                listings_count INTEGER DEFAULT 0,
                transactions_count INTEGER DEFAULT 0,
                screenshot_path TEXT,
                json_file_path TEXT,
                csv_file_path TEXT,
                error_message TEXT,
                execution_time_seconds INTEGER,
                crawled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        logger.info(f"데이터베이스 초기화 완료: {self.db_path}")
        
    def parse_price(self, price_text: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """가격 텍스트 파싱 (만원 단위)"""
        if not price_text:
            return None, None, None
            
        price_amount = None
        monthly_rent = None
        deposit_amount = None
        
        try:
            # 억 단위 처리
            if '억' in price_text:
                # 3억 4,500 형태
                match = re.search(r'(\d+)억\s*(\d+,?\d*)', price_text)
                if match:
                    eok = int(match.group(1))
                    man = int(match.group(2).replace(',', '')) if match.group(2) else 0
                    amount = eok * 10000 + man
                else:
                    # 22억 형태
                    match = re.search(r'(\d+)억', price_text)
                    if match:
                        eok = int(match.group(1))
                        amount = eok * 10000
                
                if '전세' in price_text:
                    deposit_amount = amount
                elif '월세' in price_text:
                    deposit_amount = amount
                else:
                    price_amount = amount
                    
            # 만원 단위 처리
            elif '만' in price_text:
                match = re.search(r'(\d+,?\d+)만', price_text)
                if match:
                    man = int(match.group(1).replace(',', ''))
                    if '월세' in price_text:
                        monthly_rent = man
                    else:
                        price_amount = man
                        
        except (ValueError, AttributeError) as e:
            logger.warning(f"가격 파싱 실패: {price_text} - {e}")
            
        return price_amount, monthly_rent, deposit_amount
        
    def parse_area(self, area_text: str) -> Tuple[Optional[float], Optional[float]]:
        """면적 텍스트 파싱"""
        if not area_text:
            return None, None
            
        area_sqm = None
        area_pyeong = None
        
        try:
            # 76/59m² 형태
            match = re.search(r'(\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)m²', area_text)
            if match:
                area_sqm = float(match.group(2))  # 전용면적
                area_pyeong = area_sqm / 3.3058
            # 87㎡ 형태
            elif '㎡' in area_text:
                match = re.search(r'(\d+(?:\.\d+)?)㎡', area_text)
                if match:
                    area_sqm = float(match.group(1))
                    area_pyeong = area_sqm / 3.3058
                    
        except (ValueError, AttributeError) as e:
            logger.warning(f"면적 파싱 실패: {area_text} - {e}")
            
        return area_sqm, area_pyeong
        
    def extract_floor_info(self, text: str) -> str:
        """층수 정보 추출"""
        if not text:
            return None
            
        # 10/19층 형태
        match = re.search(r'(\d+)/(\d+)층', text)
        if match:
            return f"{match.group(1)}/{match.group(2)}층"
        
        # 5층 형태
        match = re.search(r'(\d+)층', text)
        if match:
            return f"{match.group(1)}층"
            
        return None
        
    def extract_direction(self, text: str) -> str:
        """방향 정보 추출"""
        if not text:
            return None
            
        directions = ['남향', '동향', '서향', '북향', '남동향', '남서향', '북동향', '북서향']
        for direction in directions:
            if direction in text:
                return direction
        return None
        
    def save_complex_info(self, conn: sqlite3.Connection, data: Dict) -> None:
        """단지 기본 정보 저장"""
        cursor = conn.cursor()
        
        basic_info = data.get('basic_info', {})
        complex_id = basic_info.get('complex_id', data.get('crawler_info', {}).get('complex_id'))
        
        cursor.execute('''
            INSERT OR REPLACE INTO apartment_complexes 
            (complex_id, complex_name, source_url, updated_at)
            VALUES (?, ?, ?, ?)
        ''', (
            complex_id,
            '정보없음',  # 단지명은 현재 추출되지 않음
            basic_info.get('source_url'),
            datetime.now().isoformat()
        ))
        
    def save_listings(self, conn: sqlite3.Connection, data: Dict) -> int:
        """매물 정보 저장"""
        cursor = conn.cursor()
        
        complex_id = data.get('crawler_info', {}).get('complex_id')
        listings = data.get('current_listings', [])
        
        saved_count = 0
        for listing in listings:
            try:
                raw_text = listing.get('text', '')
                price_text = listing.get('price', '')
                area_text = listing.get('area', '')
                
                # 데이터 파싱
                price_amount, monthly_rent, deposit_amount = self.parse_price(price_text or raw_text)
                area_sqm, area_pyeong = self.parse_area(area_text or raw_text)
                floor_info = self.extract_floor_info(listing.get('floor', '') or raw_text)
                direction = self.extract_direction(raw_text)
                
                cursor.execute('''
                    INSERT INTO current_listings 
                    (complex_id, listing_index, selector_type, deal_type, 
                     price_text, price_amount, monthly_rent, deposit_amount,
                     area_sqm, area_pyeong, floor_info, direction,
                     description, raw_text, extracted_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    complex_id,
                    listing.get('index', 0),
                    listing.get('selector', ''),
                    listing.get('deal_type'),
                    price_text,
                    price_amount,
                    monthly_rent,
                    deposit_amount,
                    area_sqm,
                    area_pyeong,
                    floor_info,
                    direction,
                    raw_text[:500] if raw_text else None,  # 설명 (최대 500자)
                    raw_text,
                    listing.get('extracted_at', datetime.now().isoformat())
                ))
                saved_count += 1
                
            except Exception as e:
                logger.warning(f"매물 저장 실패: {e}")
                continue
                
        return saved_count
        
    def save_metadata(self, conn: sqlite3.Connection, data: Dict, json_file_path: str) -> None:
        """메타데이터 저장"""
        cursor = conn.cursor()
        
        crawler_info = data.get('crawler_info', {})
        listings_count = len(data.get('current_listings', []))
        
        cursor.execute('''
            INSERT INTO crawling_metadata 
            (complex_id, crawler_version, crawl_method, success, 
             listings_count, json_file_path, crawled_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            crawler_info.get('complex_id'),
            crawler_info.get('version'),
            crawler_info.get('crawl_method'),
            True,
            listings_count,
            json_file_path,
            crawler_info.get('crawled_at', datetime.now().isoformat())
        ))
        
    def process_json_file(self, json_file_path: str) -> bool:
        """JSON 파일 처리 및 DB 저장"""
        try:
            logger.info(f"JSON 파일 처리 시작: {json_file_path}")
            
            # JSON 파일 읽기
            with open(json_file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            conn = sqlite3.connect(self.db_path)
            conn.execute('BEGIN TRANSACTION')
            
            try:
                # 1. 단지 기본 정보 저장
                self.save_complex_info(conn, data)
                
                # 2. 매물 정보 저장
                saved_count = self.save_listings(conn, data)
                
                # 3. 메타데이터 저장
                self.save_metadata(conn, data, json_file_path)
                
                conn.commit()
                
                complex_id = data.get('crawler_info', {}).get('complex_id')
                logger.info(f"✅ DB 저장 완료: {complex_id} - 매물 {saved_count}개")
                return True
                
            except Exception as e:
                conn.rollback()
                logger.error(f"❌ DB 저장 실패: {e}")
                logger.error(traceback.format_exc())
                return False
                
            finally:
                conn.close()
                
        except Exception as e:
            logger.error(f"❌ JSON 파일 처리 실패: {json_file_path} - {e}")
            return False
            
    def get_statistics(self) -> Dict:
        """데이터베이스 통계 조회"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # 기본 통계
            cursor.execute('SELECT COUNT(*) FROM apartment_complexes')
            complexes_count = cursor.fetchone()[0]
            
            cursor.execute('SELECT COUNT(*) FROM current_listings')
            listings_count = cursor.fetchone()[0]
            
            # 거래 유형별 통계
            cursor.execute('''
                SELECT deal_type, COUNT(*) 
                FROM current_listings 
                WHERE deal_type IS NOT NULL 
                GROUP BY deal_type
            ''')
            deal_type_stats = dict(cursor.fetchall())
            
            # 가격 통계
            cursor.execute('''
                SELECT 
                    MIN(price_amount) as min_price,
                    MAX(price_amount) as max_price,
                    AVG(price_amount) as avg_price
                FROM current_listings 
                WHERE price_amount IS NOT NULL AND price_amount > 0
            ''')
            price_stats = cursor.fetchone()
            
            return {
                'complexes_count': complexes_count,
                'listings_count': listings_count,
                'deal_type_stats': deal_type_stats,
                'price_stats': {
                    'min_price': price_stats[0],
                    'max_price': price_stats[1],
                    'avg_price': price_stats[2]
                }
            }
            
        finally:
            conn.close()

# 외부 인터페이스 함수
def process_json_file(json_file_path: str, db_config: Dict = None) -> bool:
    """JSON 파일 처리 (외부 인터페이스)"""
    db_path = db_config.get('database', 'data/naver_real_estate.db') if db_config else 'data/naver_real_estate.db'
    processor = SimpleDataProcessor(db_path)
    return processor.process_json_file(json_file_path)

def get_database_statistics(db_path: str = 'data/naver_real_estate.db') -> Dict:
    """데이터베이스 통계 조회 (외부 인터페이스)"""
    processor = SimpleDataProcessor(db_path)
    return processor.get_statistics()

if __name__ == "__main__":
    # 테스트
    processor = SimpleDataProcessor()
    stats = processor.get_statistics()
    print(f"데이터베이스 통계: {stats}")