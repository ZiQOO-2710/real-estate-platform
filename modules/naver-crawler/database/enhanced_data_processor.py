"""
네이버 부동산 크롤링 데이터 완전 저장 프로세서
모든 크롤링 데이터를 누락 없이 DB에 저장하는 향상된 처리 시스템
"""

import json
import sqlite3
import re
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import traceback

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ParsedListing:
    """파싱된 매물 정보"""
    complex_id: str
    listing_index: int
    selector_type: str
    raw_text: str
    extracted_at: str
    deal_type: Optional[str] = None
    price_text: Optional[str] = None
    price_amount: Optional[int] = None
    monthly_rent: Optional[int] = None
    deposit_amount: Optional[int] = None
    area_text: Optional[str] = None
    area_sqm_exclusive: Optional[float] = None
    area_sqm_supply: Optional[float] = None
    area_pyeong: Optional[float] = None
    floor_text: Optional[str] = None
    floor_current: Optional[int] = None
    floor_total: Optional[int] = None
    direction: Optional[str] = None
    building_info: Optional[str] = None
    room_structure: Optional[str] = None
    description: Optional[str] = None
    broker_name: Optional[str] = None
    broker_type: Optional[str] = None
    listing_date: Optional[str] = None

class EnhancedDataProcessor:
    """향상된 데이터 처리 클래스"""
    
    def __init__(self, db_path: str = 'data/naver_real_estate.db'):
        self.db_path = db_path
        self.ensure_database_exists()
        
    def ensure_database_exists(self):
        """데이터베이스 및 테이블 생성"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        
        # 스키마 파일 읽기 및 실행
        schema_path = Path(__file__).parent / 'enhanced_schema.sql'
        if schema_path.exists():
            with open(schema_path, 'r', encoding='utf-8') as f:
                schema_sql = f.read()
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # 여러 SQL 문을 분리하여 실행
            statements = [stmt.strip() for stmt in schema_sql.split(';') if stmt.strip()]
            for statement in statements:
                if statement and not statement.startswith('--') and not statement.startswith('/*'):
                    try:
                        cursor.execute(statement)
                    except sqlite3.Error as e:
                        if "already exists" not in str(e) and "no such table" not in str(e):
                            logger.warning(f"스키마 실행 경고: {e}")
            
            conn.commit()
            conn.close()
            logger.info(f"데이터베이스 초기화 완료: {self.db_path}")
        else:
            logger.error(f"스키마 파일을 찾을 수 없습니다: {schema_path}")
            
    def parse_price(self, price_text: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """가격 텍스트 파싱"""
        if not price_text:
            return None, None, None
            
        # 가격 패턴 정규식
        patterns = [
            r'(\d+)억\s*(\d+,?\d*)',  # 3억 4,500
            r'(\d+)억',  # 22억
            r'(\d+,?\d+)만',  # 2,800만
            r'(\d+\.?\d*)억',  # 2.5억
        ]
        
        price_amount = None
        monthly_rent = None
        deposit_amount = None
        
        try:
            # 전세/보증금 처리
            if '전세' in price_text:
                for pattern in patterns:
                    match = re.search(pattern, price_text)
                    if match:
                        if len(match.groups()) >= 2:
                            # 3억 4,500 형태
                            eok = int(match.group(1))
                            man = int(match.group(2).replace(',', '')) if match.group(2) else 0
                            deposit_amount = eok * 10000 + man
                        else:
                            # 22억 형태
                            eok = int(match.group(1))
                            deposit_amount = eok * 10000
                        break
            
            # 매매/전세 가격 처리
            elif '매매' in price_text or any(x in price_text for x in ['억', '만']):
                for pattern in patterns:
                    match = re.search(pattern, price_text)
                    if match:
                        if len(match.groups()) >= 2:
                            # 3억 4,500 형태
                            eok = int(match.group(1))
                            man = int(match.group(2).replace(',', '')) if match.group(2) else 0
                            price_amount = eok * 10000 + man
                        else:
                            # 22억 형태
                            eok = int(match.group(1))
                            price_amount = eok * 10000
                        break
            
            # 월세 처리
            if '월세' in price_text:
                monthly_pattern = r'월세[^\d]*(\d+)만'
                match = re.search(monthly_pattern, price_text)
                if match:
                    monthly_rent = int(match.group(1))
                    
        except (ValueError, AttributeError) as e:
            logger.warning(f"가격 파싱 실패: {price_text} - {e}")
            
        return price_amount, monthly_rent, deposit_amount
        
    def parse_area(self, area_text: str) -> Tuple[Optional[float], Optional[float], Optional[float]]:
        """면적 텍스트 파싱"""
        if not area_text:
            return None, None, None
            
        area_sqm_exclusive = None
        area_sqm_supply = None
        area_pyeong = None
        
        try:
            # 76/59m² 형태
            area_pattern = r'(\d+(?:\.\d+)?)/(\d+(?:\.\d+)?)m²'
            match = re.search(area_pattern, area_text)
            if match:
                area_sqm_supply = float(match.group(1))
                area_sqm_exclusive = float(match.group(2))
                area_pyeong = area_sqm_exclusive / 3.3058
                
            # 87㎡ 형태
            elif '㎡' in area_text:
                sqm_pattern = r'(\d+(?:\.\d+)?)㎡'
                match = re.search(sqm_pattern, area_text)
                if match:
                    area_sqm_exclusive = float(match.group(1))
                    area_pyeong = area_sqm_exclusive / 3.3058
                    
        except (ValueError, AttributeError) as e:
            logger.warning(f"면적 파싱 실패: {area_text} - {e}")
            
        return area_sqm_exclusive, area_sqm_supply, area_pyeong
        
    def parse_floor(self, floor_text: str) -> Tuple[Optional[int], Optional[int]]:
        """층수 텍스트 파싱"""
        if not floor_text:
            return None, None
            
        floor_current = None
        floor_total = None
        
        try:
            # 10/19층 형태
            floor_pattern = r'(\d+)/(\d+)층'
            match = re.search(floor_pattern, floor_text)
            if match:
                floor_current = int(match.group(1))
                floor_total = int(match.group(2))
            
            # 5층 형태
            elif '층' in floor_text:
                simple_pattern = r'(\d+)층'
                match = re.search(simple_pattern, floor_text)
                if match:
                    floor_current = int(match.group(1))
                    
        except (ValueError, AttributeError) as e:
            logger.warning(f"층수 파싱 실패: {floor_text} - {e}")
            
        return floor_current, floor_total
        
    def extract_additional_info(self, raw_text: str) -> Dict[str, Optional[str]]:
        """추가 정보 추출"""
        info = {
            'direction': None,
            'building_info': None,
            'room_structure': None,
            'description': None,
            'broker_name': None,
            'broker_type': None
        }
        
        if not raw_text:
            return info
            
        # 방향 추출
        direction_patterns = ['남향', '동향', '서향', '북향', '남동향', '남서향', '북동향', '북서향']
        for direction in direction_patterns:
            if direction in raw_text:
                info['direction'] = direction
                break
                
        # 동 정보 추출
        building_pattern = r'(\d+동)'
        match = re.search(building_pattern, raw_text)
        if match:
            info['building_info'] = match.group(1)
            
        # 중개사 정보 추출
        if '중개사' in raw_text:
            broker_pattern = r'([가-힣]+)\s*중개사'
            match = re.search(broker_pattern, raw_text)
            if match:
                info['broker_name'] = match.group(1)
                info['broker_type'] = '중개사'
                
        # 기타 설명 (특수한 키워드 제거 후)
        description = raw_text
        for keyword in ['매매', '전세', '월세', '중개사', '아파트']:
            description = description.replace(keyword, '')
        info['description'] = description.strip()[:500]  # 최대 500자
        
        return info
        
    def parse_listing(self, listing_data: Dict, complex_id: str) -> ParsedListing:
        """매물 데이터 파싱"""
        raw_text = listing_data.get('text', '')
        price_text = listing_data.get('price', '')
        area_text = listing_data.get('area', '')
        floor_text = listing_data.get('floor', '')
        
        # 가격 파싱
        price_amount, monthly_rent, deposit_amount = self.parse_price(price_text or raw_text)
        
        # 면적 파싱
        area_sqm_exclusive, area_sqm_supply, area_pyeong = self.parse_area(area_text or raw_text)
        
        # 층수 파싱
        floor_current, floor_total = self.parse_floor(floor_text or raw_text)
        
        # 추가 정보 추출
        additional_info = self.extract_additional_info(raw_text)
        
        return ParsedListing(
            complex_id=complex_id,
            listing_index=listing_data.get('index', 0),
            selector_type=listing_data.get('selector', ''),
            raw_text=raw_text,
            extracted_at=listing_data.get('extracted_at', datetime.now().isoformat()),
            deal_type=listing_data.get('deal_type'),
            price_text=price_text,
            price_amount=price_amount,
            monthly_rent=monthly_rent,
            deposit_amount=deposit_amount,
            area_text=area_text,
            area_sqm_exclusive=area_sqm_exclusive,
            area_sqm_supply=area_sqm_supply,
            area_pyeong=area_pyeong,
            floor_text=floor_text,
            floor_current=floor_current,
            floor_total=floor_total,
            direction=additional_info['direction'],
            building_info=additional_info['building_info'],
            room_structure=additional_info['room_structure'],
            description=additional_info['description'],
            broker_name=additional_info['broker_name'],
            broker_type=additional_info['broker_type']
        )
        
    def save_crawler_info(self, conn: sqlite3.Connection, crawler_info: Dict) -> None:
        """크롤러 정보 저장"""
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO crawler_info 
            (complex_id, version, crawl_method, crawled_at)
            VALUES (?, ?, ?, ?)
        ''', (
            crawler_info.get('complex_id'),
            crawler_info.get('version'),
            crawler_info.get('crawl_method'),
            crawler_info.get('crawled_at')
        ))
        
    def save_basic_info(self, conn: sqlite3.Connection, basic_info: Dict) -> None:
        """기본 정보 저장"""
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO apartment_complexes 
            (complex_id, complex_name, source_url, full_url, page_title, 
             extracted_at, page_timestamp, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            basic_info.get('complex_id'),
            basic_info.get('complexName', '정보없음'),
            basic_info.get('source_url'),
            basic_info.get('url'),
            basic_info.get('title'),
            basic_info.get('extracted_at'),
            basic_info.get('timestamp'),
            datetime.now().isoformat()
        ))
        
    def save_listing(self, conn: sqlite3.Connection, listing: ParsedListing) -> int:
        """매물 정보 저장"""
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO current_listings 
            (complex_id, listing_index, selector_type, raw_text, deal_type, 
             price_text, price_amount, monthly_rent, deposit_amount,
             area_text, area_sqm_exclusive, area_sqm_supply, area_pyeong,
             floor_text, floor_current, floor_total, direction, building_info,
             room_structure, description, broker_name, broker_type,
             extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            listing.complex_id, listing.listing_index, listing.selector_type,
            listing.raw_text, listing.deal_type, listing.price_text,
            listing.price_amount, listing.monthly_rent, listing.deposit_amount,
            listing.area_text, listing.area_sqm_exclusive, listing.area_sqm_supply,
            listing.area_pyeong, listing.floor_text, listing.floor_current,
            listing.floor_total, listing.direction, listing.building_info,
            listing.room_structure, listing.description, listing.broker_name,
            listing.broker_type, listing.extracted_at
        ))
        return cursor.lastrowid
        
    def save_metadata(self, conn: sqlite3.Connection, metadata: Dict) -> None:
        """메타데이터 저장"""
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO crawling_metadata 
            (complex_id, crawler_version, crawl_method, success, 
             listings_count, unique_listings_count, duplicate_removal_rate,
             screenshot_path, json_file_path, csv_file_path, 
             error_message, execution_time_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            metadata.get('complex_id'),
            metadata.get('crawler_version'),
            metadata.get('crawl_method'),
            metadata.get('success', True),
            metadata.get('listings_count', 0),
            metadata.get('unique_listings_count', 0),
            metadata.get('duplicate_removal_rate', 0.0),
            metadata.get('screenshot_path'),
            metadata.get('json_file_path'),
            metadata.get('csv_file_path'),
            metadata.get('error_message'),
            metadata.get('execution_time_seconds', 0)
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
                # 1. 크롤러 정보 저장
                if 'crawler_info' in data:
                    self.save_crawler_info(conn, data['crawler_info'])
                    
                # 2. 기본 정보 저장
                if 'basic_info' in data:
                    self.save_basic_info(conn, data['basic_info'])
                    
                # 3. 매물 정보 저장
                complex_id = data.get('crawler_info', {}).get('complex_id')
                if complex_id and 'current_listings' in data:
                    saved_count = 0
                    for listing_data in data['current_listings']:
                        parsed_listing = self.parse_listing(listing_data, complex_id)
                        listing_id = self.save_listing(conn, parsed_listing)
                        saved_count += 1
                        
                    logger.info(f"매물 저장 완료: {saved_count}개")
                    
                # 4. 메타데이터 저장
                metadata = {
                    'complex_id': complex_id,
                    'crawler_version': data.get('crawler_info', {}).get('version'),
                    'crawl_method': data.get('crawler_info', {}).get('crawl_method'),
                    'success': True,
                    'listings_count': len(data.get('current_listings', [])),
                    'unique_listings_count': len(data.get('current_listings', [])),
                    'json_file_path': json_file_path,
                    'screenshot_path': data.get('files', {}).get('screenshot')
                }
                self.save_metadata(conn, metadata)
                
                conn.commit()
                logger.info(f"✅ DB 저장 완료: {complex_id}")
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
            
            # 데이터 품질 통계
            cursor.execute('''
                SELECT 
                    AVG(quality_score) as avg_quality,
                    MIN(quality_score) as min_quality,
                    MAX(quality_score) as max_quality
                FROM data_quality_check
            ''')
            quality_stats = cursor.fetchone()
            
            return {
                'complexes_count': complexes_count,
                'listings_count': listings_count,
                'deal_type_stats': deal_type_stats,
                'quality_stats': {
                    'avg_quality': quality_stats[0],
                    'min_quality': quality_stats[1],
                    'max_quality': quality_stats[2]
                }
            }
            
        finally:
            conn.close()

# 사용 함수
def process_json_file(json_file_path: str, db_config: Dict = None) -> bool:
    """JSON 파일 처리 (외부 인터페이스)"""
    db_path = db_config.get('database', 'data/naver_real_estate.db') if db_config else 'data/naver_real_estate.db'
    processor = EnhancedDataProcessor(db_path)
    return processor.process_json_file(json_file_path)

def get_database_statistics(db_path: str = 'data/naver_real_estate.db') -> Dict:
    """데이터베이스 통계 조회 (외부 인터페이스)"""
    processor = EnhancedDataProcessor(db_path)
    return processor.get_statistics()

if __name__ == "__main__":
    # 테스트
    processor = EnhancedDataProcessor()
    stats = processor.get_statistics()
    print(f"데이터베이스 통계: {stats}")