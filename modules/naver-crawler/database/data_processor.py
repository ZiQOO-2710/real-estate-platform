"""
네이버 부동산 크롤링 데이터 처리 모듈
크롤링된 JSON 데이터를 데이터베이스에 저장하기 위해 변환 및 정리
"""

import json
import re
import sqlite3
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
import logging
from dataclasses import dataclass

# PostgreSQL은 선택적 import
try:
    import psycopg2
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ComplexInfo:
    """단지 기본 정보 데이터 클래스"""
    complex_id: str
    complex_name: Optional[str] = None
    address: Optional[str] = None
    completion_year: Optional[str] = None
    total_households: Optional[int] = None
    total_buildings: Optional[int] = None
    area_range: Optional[str] = None
    source_url: Optional[str] = None

@dataclass
class ListingInfo:
    """매물 정보 데이터 클래스"""
    complex_id: str
    listing_index: int
    selector_type: str
    deal_type: Optional[str]
    price_text: Optional[str]
    price_amount: Optional[int]
    monthly_rent: Optional[int]
    deposit_amount: Optional[int]
    area_sqm: Optional[float]
    area_pyeong: Optional[float]
    floor_info: Optional[str]
    direction: Optional[str]
    room_structure: Optional[str]
    description: Optional[str]
    raw_text: str
    extracted_at: Optional[datetime]

@dataclass
class TransactionInfo:
    """거래 정보 데이터 클래스"""
    complex_id: str
    transaction_date: Optional[date]
    deal_type: Optional[str]
    price_amount: Optional[int]
    area_sqm: Optional[float]
    floor_info: Optional[str]
    pattern_type: int
    match_text: str
    context_text: str
    extracted_at: Optional[datetime]

class DataProcessor:
    """크롤링 데이터 처리기"""
    
    def __init__(self, db_type='sqlite', db_config=None):
        self.db_type = db_type
        self.db_config = db_config or {}
        self.connection = None
        
    def connect_db(self):
        """데이터베이스 연결"""
        try:
            if self.db_type == 'sqlite':
                db_path = self.db_config.get('database', 'data/naver_real_estate.db')
                Path(db_path).parent.mkdir(parents=True, exist_ok=True)
                self.connection = sqlite3.connect(db_path)
                logger.info(f"SQLite 연결 성공: {db_path}")
            elif self.db_type == 'postgresql':
                if not POSTGRES_AVAILABLE:
                    raise ImportError("psycopg2가 설치되지 않았습니다: pip install psycopg2-binary")
                self.connection = psycopg2.connect(**self.db_config)
                logger.info("PostgreSQL 연결 성공")
            else:
                raise ValueError(f"지원하지 않는 DB 타입: {self.db_type}")
                
            return True
        except Exception as e:
            logger.error(f"DB 연결 실패: {e}")
            return False
            
    def create_tables(self):
        """테이블 생성"""
        try:
            schema_file = Path(__file__).parent / 'schema.sql'
            with open(schema_file, 'r', encoding='utf-8') as f:
                schema_sql = f.read()
                
            # SQLite용 스키마 조정
            if self.db_type == 'sqlite':
                schema_sql = self._adapt_schema_for_sqlite(schema_sql)
                
            cursor = self.connection.cursor()
            
            # 각 statement를 개별 실행
            statements = [s.strip() for s in schema_sql.split(';') if s.strip()]
            for statement in statements:
                if statement:
                    try:
                        cursor.execute(statement)
                    except Exception as e:
                        logger.warning(f"스키마 실행 경고: {e}")
                        
            self.connection.commit()
            logger.info("테이블 생성 완료")
            return True
            
        except Exception as e:
            logger.error(f"테이블 생성 실패: {e}")
            return False
            
    def _adapt_schema_for_sqlite(self, schema_sql: str) -> str:
        """PostgreSQL 스키마를 SQLite용으로 변환"""
        # SERIAL -> INTEGER 변환
        schema_sql = re.sub(r'\bSERIAL\b', 'INTEGER', schema_sql, flags=re.IGNORECASE)
        
        # BIGINT -> INTEGER 변환
        schema_sql = re.sub(r'\bBIGINT\b', 'INTEGER', schema_sql, flags=re.IGNORECASE)
        
        # DECIMAL -> REAL 변환
        schema_sql = re.sub(r'\bDECIMAL\([^)]+\)', 'REAL', schema_sql, flags=re.IGNORECASE)
        
        # PERCENTILE_CONT 함수 제거 (SQLite 미지원)
        schema_sql = re.sub(
            r'PERCENTILE_CONT\([^)]+\)\s+WITHIN\s+GROUP\s+\([^)]+\)',
            'AVG(cl.price_amount)',
            schema_sql,
            flags=re.IGNORECASE
        )
        
        # COMMENT 구문 제거 (SQLite 미지원)
        schema_sql = re.sub(r'COMMENT\s+ON\s+[^;]+;', '', schema_sql, flags=re.IGNORECASE)
        
        return schema_sql
        
    def parse_price(self, price_text: str) -> Tuple[Optional[int], Optional[int]]:
        """가격 텍스트 파싱 (억/만원 -> 만원 단위 변환)"""
        if not price_text:
            return None, None
            
        try:
            # "6억/140" 형태 (월세)
            monthly_match = re.search(r'(\d+)억/(\d+)', price_text)
            if monthly_match:
                deposit = int(monthly_match.group(1)) * 10000  # 억 -> 만원
                monthly = int(monthly_match.group(2))  # 만원
                return deposit, monthly
                
            # "6억 3천" 또는 "6억 3" 형태
            billion_match = re.search(r'(\d+)억\s*(\d+)?', price_text)
            if billion_match:
                billions = int(billion_match.group(1))
                thousands = int(billion_match.group(2)) if billion_match.group(2) else 0
                
                # "6억 3" -> 6억 3천만원으로 해석
                if thousands < 10:
                    thousands *= 1000
                    
                total_amount = billions * 10000 + thousands
                return total_amount, None
                
            # "3천만원" 형태
            thousand_match = re.search(r'(\d+)천만?원?', price_text)
            if thousand_match:
                return int(thousand_match.group(1)) * 1000, None
                
            # "500만원" 형태
            million_match = re.search(r'(\d+)만원?', price_text)
            if million_match:
                return int(million_match.group(1)), None
                
        except Exception as e:
            logger.warning(f"가격 파싱 오류: {price_text} -> {e}")
            
        return None, None
        
    def parse_area(self, text: str) -> Tuple[Optional[float], Optional[float]]:
        """면적 정보 파싱 (㎡ -> 평 변환)"""
        if not text:
            return None, None
            
        try:
            # "84㎡" 또는 "84.5㎡" 형태
            sqm_match = re.search(r'(\d+(?:\.\d+)?)㎡', text)
            if sqm_match:
                sqm = float(sqm_match.group(1))
                pyeong = round(sqm * 0.3025, 2)  # ㎡ to 평 변환
                return sqm, pyeong
                
            # "25평" 형태
            pyeong_match = re.search(r'(\d+(?:\.\d+)?)평', text)
            if pyeong_match:
                pyeong = float(pyeong_match.group(1))
                sqm = round(pyeong / 0.3025, 2)  # 평 to ㎡ 변환
                return sqm, pyeong
                
        except Exception as e:
            logger.warning(f"면적 파싱 오류: {text} -> {e}")
            
        return None, None
        
    def parse_floor(self, text: str) -> Optional[str]:
        """층수 정보 파싱"""
        if not text:
            return None
            
        floor_match = re.search(r'(\d+)층', text)
        if floor_match:
            return f"{floor_match.group(1)}층"
            
        return None
        
    def parse_direction(self, text: str) -> Optional[str]:
        """방향 정보 파싱"""
        if not text:
            return None
            
        directions = ['남향', '북향', '동향', '서향', '남동향', '남서향', '북동향', '북서향']
        for direction in directions:
            if direction in text:
                return direction
                
        return None
        
    def parse_date(self, text: str) -> Optional[date]:
        """날짜 정보 파싱"""
        if not text:
            return None
            
        try:
            # "2025.06.23" 형태
            date_match = re.search(r'(\d{4})\.(\d{1,2})\.(\d{1,2})', text)
            if date_match:
                year = int(date_match.group(1))
                month = int(date_match.group(2))
                day = int(date_match.group(3))
                return date(year, month, day)
                
            # "2025/06/23" 형태
            date_match2 = re.search(r'(\d{4})/(\d{1,2})/(\d{1,2})', text)
            if date_match2:
                year = int(date_match2.group(1))
                month = int(date_match2.group(2))
                day = int(date_match2.group(3))
                return date(year, month, day)
                
        except Exception as e:
            logger.warning(f"날짜 파싱 오류: {text} -> {e}")
            
        return None
        
    def process_complex_info(self, data: Dict) -> ComplexInfo:
        """단지 기본 정보 처리"""
        basic_info = data.get('basic_info', {})
        crawler_info = data.get('crawler_info', {})
        
        return ComplexInfo(
            complex_id=crawler_info.get('complex_id') or basic_info.get('complex_id') or basic_info.get('complexId'),
            complex_name=basic_info.get('complexName'),
            address=basic_info.get('address'),
            completion_year=basic_info.get('completionYear'),
            total_households=self._parse_int(basic_info.get('totalHouseholds')),
            source_url=basic_info.get('source_url')
        )
        
    def process_listings(self, data: Dict) -> List[ListingInfo]:
        """매물 정보 처리"""
        listings = data.get('current_listings', [])
        complex_id = data.get('crawler_info', {}).get('complex_id')
        
        processed_listings = []
        
        for listing in listings:
            try:
                price_text = listing.get('price', '')
                price_amount, monthly_rent = self.parse_price(price_text)
                
                # 월세인 경우 보증금과 월세 분리
                deposit_amount = None
                if monthly_rent and price_amount:
                    deposit_amount = price_amount
                    price_amount = None
                    
                raw_text = listing.get('text', '')
                area_sqm, area_pyeong = self.parse_area(raw_text)
                
                listing_info = ListingInfo(
                    complex_id=complex_id,
                    listing_index=listing.get('index', 0),
                    selector_type=listing.get('selector', 'unknown'),
                    deal_type=listing.get('deal_type') or self._infer_deal_type(raw_text),
                    price_text=price_text,
                    price_amount=price_amount,
                    monthly_rent=monthly_rent,
                    deposit_amount=deposit_amount,
                    area_sqm=area_sqm,
                    area_pyeong=area_pyeong,
                    floor_info=listing.get('floor') or self.parse_floor(raw_text),
                    direction=self.parse_direction(raw_text),
                    room_structure=self._extract_room_structure(raw_text),
                    description=self._clean_description(raw_text),
                    raw_text=raw_text,
                    extracted_at=self._parse_datetime(listing.get('extracted_at'))
                )
                
                processed_listings.append(listing_info)
                
            except Exception as e:
                logger.warning(f"매물 처리 오류: {e} - {listing}")
                
        return processed_listings
        
    def process_transactions(self, data: Dict) -> List[TransactionInfo]:
        """거래 정보 처리"""
        transactions = data.get('transaction_history', [])
        complex_id = data.get('crawler_info', {}).get('complex_id')
        
        processed_transactions = []
        
        for transaction in transactions:
            try:
                match_text = transaction.get('match_text', '')
                context_text = transaction.get('context', '')
                
                # 가격 파싱
                price_amount, _ = self.parse_price(match_text)
                
                # 날짜 파싱
                transaction_date = self.parse_date(match_text) or self.parse_date(context_text)
                
                # 면적 파싱
                area_sqm, _ = self.parse_area(match_text)
                
                transaction_info = TransactionInfo(
                    complex_id=complex_id,
                    transaction_date=transaction_date,
                    deal_type=self._infer_deal_type(match_text + ' ' + context_text),
                    price_amount=price_amount,
                    area_sqm=area_sqm,
                    floor_info=self.parse_floor(match_text),
                    pattern_type=transaction.get('pattern_type', 0),
                    match_text=match_text,
                    context_text=context_text,
                    extracted_at=self._parse_datetime(transaction.get('extracted_at'))
                )
                
                processed_transactions.append(transaction_info)
                
            except Exception as e:
                logger.warning(f"거래 처리 오류: {e} - {transaction}")
                
        return processed_transactions
        
    def save_to_db(self, complex_info: ComplexInfo, listings: List[ListingInfo], 
                   transactions: List[TransactionInfo], metadata: Dict) -> bool:
        """데이터베이스에 저장"""
        try:
            cursor = self.connection.cursor()
            
            # 1. 단지 정보 저장 (UPSERT)
            self._upsert_complex(cursor, complex_info)
            
            # 2. 기존 매물 정보 삭제 (최신 데이터로 교체)
            self._delete_existing_data(cursor, complex_info.complex_id)
            
            # 3. 매물 정보 저장
            self._insert_listings(cursor, listings)
            
            # 4. 거래 정보 저장
            self._insert_transactions(cursor, transactions)
            
            # 5. 메타데이터 저장
            self._insert_metadata(cursor, complex_info.complex_id, metadata)
            
            self.connection.commit()
            logger.info(f"데이터 저장 완료: {complex_info.complex_id} - 매물 {len(listings)}개, 거래 {len(transactions)}개")
            return True
            
        except Exception as e:
            logger.error(f"데이터 저장 실패: {e}")
            self.connection.rollback()
            return False
            
    def _upsert_complex(self, cursor, complex_info: ComplexInfo):
        """단지 정보 UPSERT"""
        if self.db_type == 'sqlite':
            sql = """
            INSERT OR REPLACE INTO apartment_complexes 
            (complex_id, complex_name, address, completion_year, total_households, source_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """
        else:
            sql = """
            INSERT INTO apartment_complexes 
            (complex_id, complex_name, address, completion_year, total_households, source_url, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (complex_id) DO UPDATE SET
                complex_name = EXCLUDED.complex_name,
                address = EXCLUDED.address,
                completion_year = EXCLUDED.completion_year,
                total_households = EXCLUDED.total_households,
                source_url = EXCLUDED.source_url,
                updated_at = EXCLUDED.updated_at
            """
            
        cursor.execute(sql, (
            complex_info.complex_id,
            complex_info.complex_name,
            complex_info.address,
            complex_info.completion_year,
            complex_info.total_households,
            complex_info.source_url,
            datetime.now()
        ))
        
    def _delete_existing_data(self, cursor, complex_id: str):
        """기존 매물/거래 데이터 삭제"""
        cursor.execute("DELETE FROM current_listings WHERE complex_id = ?", (complex_id,))
        # 거래 데이터는 누적이므로 삭제하지 않음
        
    def _insert_listings(self, cursor, listings: List[ListingInfo]):
        """매물 정보 삽입"""
        for listing in listings:
            if self.db_type == 'sqlite':
                sql = """
                INSERT INTO current_listings (
                    complex_id, listing_index, selector_type, deal_type, price_text,
                    price_amount, monthly_rent, deposit_amount, area_sqm, area_pyeong,
                    floor_info, direction, room_structure, description, raw_text, extracted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            else:
                sql = """
                INSERT INTO current_listings (
                    complex_id, listing_index, selector_type, deal_type, price_text,
                    price_amount, monthly_rent, deposit_amount, area_sqm, area_pyeong,
                    floor_info, direction, room_structure, description, raw_text, extracted_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                
            cursor.execute(sql, (
                listing.complex_id, listing.listing_index, listing.selector_type,
                listing.deal_type, listing.price_text, listing.price_amount,
                listing.monthly_rent, listing.deposit_amount, listing.area_sqm,
                listing.area_pyeong, listing.floor_info, listing.direction,
                listing.room_structure, listing.description, listing.raw_text,
                listing.extracted_at
            ))
            
    def _insert_transactions(self, cursor, transactions: List[TransactionInfo]):
        """거래 정보 삽입"""
        for transaction in transactions:
            if self.db_type == 'sqlite':
                sql = """
                INSERT INTO transaction_history (
                    complex_id, transaction_date, deal_type, price_amount, area_sqm,
                    floor_info, pattern_type, match_text, context_text, extracted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
            else:
                sql = """
                INSERT INTO transaction_history (
                    complex_id, transaction_date, deal_type, price_amount, area_sqm,
                    floor_info, pattern_type, match_text, context_text, extracted_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                
            cursor.execute(sql, (
                transaction.complex_id, transaction.transaction_date, transaction.deal_type,
                transaction.price_amount, transaction.area_sqm, transaction.floor_info,
                transaction.pattern_type, transaction.match_text, transaction.context_text,
                transaction.extracted_at
            ))
            
    def _insert_metadata(self, cursor, complex_id: str, metadata: Dict):
        """메타데이터 삽입"""
        if self.db_type == 'sqlite':
            sql = """
            INSERT INTO crawling_metadata (
                complex_id, crawler_version, crawl_method, success, listings_count,
                transactions_count, screenshot_path, json_file_path, csv_file_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
        else:
            sql = """
            INSERT INTO crawling_metadata (
                complex_id, crawler_version, crawl_method, success, listings_count,
                transactions_count, screenshot_path, json_file_path, csv_file_path
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
        cursor.execute(sql, (
            complex_id,
            metadata.get('crawler_version', '2.0 Enhanced'),
            metadata.get('crawl_method', 'stealth_mode'),
            metadata.get('success', True),
            metadata.get('listings_count', 0),
            metadata.get('transactions_count', 0),
            metadata.get('screenshot_path'),
            metadata.get('json_file_path'),
            metadata.get('csv_file_path')
        ))
        
    # 유틸리티 메서드들
    def _parse_int(self, value) -> Optional[int]:
        """정수 파싱"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                return int(re.sub(r'[^\d]', '', value))
            return int(value)
        except:
            return None
            
    def _parse_datetime(self, value) -> Optional[datetime]:
        """datetime 파싱"""
        if not value:
            return None
        try:
            if isinstance(value, str):
                return datetime.fromisoformat(value.replace('Z', '+00:00'))
            return value
        except:
            return None
            
    def _infer_deal_type(self, text: str) -> Optional[str]:
        """거래유형 추론"""
        if not text:
            return None
        if '월세' in text:
            return '월세'
        elif '전세' in text:
            return '전세'
        elif '매매' in text:
            return '매매'
        return None
        
    def _extract_room_structure(self, text: str) -> Optional[str]:
        """방 구조 추출"""
        if not text:
            return None
        # "3룸", "투룸", "원룸" 등
        room_patterns = ['원룸', '투룸', '쓰리룸', '방1', '방2', '방3', '방4']
        for pattern in room_patterns:
            if pattern in text:
                return pattern
        return None
        
    def _clean_description(self, text: str) -> Optional[str]:
        """설명 텍스트 정리"""
        if not text:
            return None
        # 너무 긴 텍스트는 자르기
        return text[:500] if len(text) > 500 else text
        
    def close(self):
        """데이터베이스 연결 종료"""
        if self.connection:
            self.connection.close()
            logger.info("DB 연결 종료")

def process_json_file(json_file_path: str, db_config: Dict = None) -> bool:
    """JSON 파일을 처리하여 데이터베이스에 저장"""
    try:
        # JSON 데이터 로드
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # 데이터 처리기 초기화
        db_config = db_config or {'database': 'data/naver_real_estate.db'}
        processor = DataProcessor(db_type='sqlite', db_config=db_config)
        
        # DB 연결 및 테이블 생성
        if not processor.connect_db():
            return False
            
        processor.create_tables()
        
        # 데이터 처리
        complex_info = processor.process_complex_info(data)
        listings = processor.process_listings(data)
        transactions = processor.process_transactions(data)
        
        # 메타데이터 구성
        metadata = {
            'crawler_version': data.get('crawler_info', {}).get('version', '2.0 Enhanced'),
            'crawl_method': data.get('crawler_info', {}).get('crawl_method', 'stealth_mode'),
            'success': True,
            'listings_count': len(listings),
            'transactions_count': len(transactions),
            'json_file_path': json_file_path
        }
        
        # 데이터 저장
        success = processor.save_to_db(complex_info, listings, transactions, metadata)
        
        processor.close()
        return success
        
    except Exception as e:
        logger.error(f"JSON 파일 처리 실패: {e}")
        return False

if __name__ == "__main__":
    # 테스트 실행
    import sys
    
    if len(sys.argv) > 1:
        json_file = sys.argv[1]
        success = process_json_file(json_file)
        print(f"처리 결과: {'성공' if success else '실패'}")
    else:
        print("사용법: python data_processor.py <json_file_path>")
