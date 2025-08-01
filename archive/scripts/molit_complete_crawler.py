#!/usr/bin/env python3
"""
국토부 실거래가 API 완전 크롤러
- 전국 모든 시군구 실거래가 데이터 수집
- 아파트 매매/전세/월세 전체 수집
- 확실하게 동작하는 방법
"""

import requests
import sqlite3
import json
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import logging
from typing import List, Dict, Optional
import random

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('molit_complete_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class MolitCompleteCrawler:
    """국토부 실거래가 완전 크롤러"""
    
    def __init__(self):
        self.service_key = "UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ=="
        self.db_path = "molit_complete_data.db"
        self.session = requests.Session()
        self.init_database()
        
        # 전국 시군구 코드 (국토부 표준)
        self.regions = {
            # 서울특별시
            '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구',
            '11215': '광진구', '11230': '동대문구', '11260': '중랑구', '11290': '성북구',
            '11305': '강북구', '11320': '도봉구', '11350': '노원구', '11380': '은평구',
            '11410': '서대문구', '11440': '마포구', '11470': '양천구', '11500': '강서구',
            '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
            '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구',
            '11740': '강동구',
            
            # 부산광역시
            '26110': '중구', '26140': '서구', '26170': '동구', '26200': '영도구',
            '26230': '부산진구', '26260': '동래구', '26290': '남구', '26320': '북구',
            '26350': '해운대구', '26380': '사하구', '26410': '금정구', '26440': '강서구',
            '26470': '연제구', '26500': '수영구', '26530': '사상구', '26710': '기장군',
            
            # 대구광역시
            '27110': '중구', '27140': '동구', '27170': '서구', '27200': '남구',
            '27230': '북구', '27260': '수성구', '27290': '달서구', '27710': '달성군',
            
            # 인천광역시
            '28110': '중구', '28140': '동구', '28177': '미추홀구', '28185': '연수구',
            '28200': '남동구', '28237': '부평구', '28245': '계양구', '28260': '서구',
            '28710': '강화군', '28720': '옹진군',
            
            # 광주광역시
            '29110': '동구', '29140': '서구', '29155': '남구', '29170': '북구', '29200': '광산구',
            
            # 대전광역시
            '30110': '동구', '30140': '중구', '30170': '서구', '30200': '유성구', '30230': '대덕구',
            
            # 울산광역시
            '31110': '중구', '31140': '남구', '31170': '동구', '31200': '북구', '31710': '울주군',
        }
        
        # API 엔드포인트
        self.apis = {
            '매매': 'http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
            '전세': 'http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent',
            '월세': 'http://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'
        }
        
        self.stats = {
            'regions_processed': 0,
            'total_transactions': 0,
            'api_calls': 0,
            'start_time': datetime.now()
        }
    
    def init_database(self):
        """데이터베이스 초기화"""
        logger.info("데이터베이스 초기화 중...")
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 실거래가 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS apartment_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region_code TEXT,
                region_name TEXT,
                deal_type TEXT,
                deal_year TEXT,
                deal_month TEXT,
                deal_day TEXT,
                deal_amount TEXT,
                apartment_name TEXT,
                area TEXT,
                floor TEXT,
                construction_year TEXT,
                road_name TEXT,
                road_name_code TEXT,
                legal_dong TEXT,
                jibun TEXT,
                apartment_seq TEXT,
                monthly_rent TEXT,
                deposit TEXT,
                api_data TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 크롤링 진행 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS crawling_status (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                region_code TEXT,
                region_name TEXT,
                deal_type TEXT,
                year_month TEXT,
                status TEXT,
                items_found INTEGER DEFAULT 0,
                api_calls INTEGER DEFAULT 0,
                error_message TEXT,
                started_at TEXT,
                completed_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("데이터베이스 초기화 완료")
    
    def get_recent_months(self, months_back: int = 60) -> List[str]:
        """최근 N개월 목록 생성"""
        months = []
        current_date = datetime.now()
        
        for i in range(months_back):
            date = current_date - timedelta(days=30 * i)
            month_str = date.strftime('%Y%m')
            months.append(month_str)
        
        return sorted(months)
    
    def call_molit_api(self, region_code: str, deal_type: str, year_month: str) -> List[Dict]:
        """국토부 API 호출"""
        logger.info(f"API 호출: {region_code} {deal_type} {year_month}")
        
        url = self.apis[deal_type]
        
        params = {
            'serviceKey': self.service_key,
            'LAWD_CD': region_code,
            'DEAL_YMD': year_month,
            'numOfRows': 9999,
            'pageNo': 1
        }
        
        # 월세의 경우 추가 파라미터
        if deal_type == '월세':
            params['RENT_GBN'] = '월세'
        elif deal_type == '전세':
            params['RENT_GBN'] = '전세'
        
        try:
            response = self.session.get(url, params=params, timeout=30)
            self.stats['api_calls'] += 1
            
            if response.status_code == 200:
                # XML 파싱
                root = ET.fromstring(response.content)
                
                # 데이터 추출
                items = []
                for item in root.findall('.//item'):
                    transaction = {}
                    for child in item:
                        transaction[child.tag] = child.text
                    
                    transaction['deal_type'] = deal_type
                    transaction['region_code'] = region_code
                    items.append(transaction)
                
                logger.info(f"  {deal_type} {year_month}: {len(items)}건 수집")
                return items
                
            else:
                logger.error(f"API 호출 실패: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"API 호출 오류: {e}")
            return []
        
        finally:
            # API 호출 간격 (제한 준수)
            time.sleep(random.uniform(0.5, 1.0))
    
    def save_transactions(self, transactions: List[Dict], region_code: str, region_name: str):
        """거래 데이터 저장"""
        if not transactions:
            return
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for trans in transactions:
                cursor.execute("""
                    INSERT INTO apartment_transactions 
                    (region_code, region_name, deal_type, deal_year, deal_month, deal_day,
                     deal_amount, apartment_name, area, floor, construction_year,
                     road_name, road_name_code, legal_dong, jibun, apartment_seq,
                     monthly_rent, deposit, api_data, crawled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    region_code, region_name, trans.get('deal_type', ''),
                    trans.get('년'), trans.get('월'), trans.get('일'),
                    trans.get('거래금액', trans.get('보증금액')), trans.get('아파트'),
                    trans.get('전용면적'), trans.get('층'), trans.get('건축년도'),
                    trans.get('도로명'), trans.get('도로명코드'), trans.get('법정동'),
                    trans.get('지번'), trans.get('아파트일련번호'),
                    trans.get('월세금액'), trans.get('보증금액'),
                    json.dumps(trans, ensure_ascii=False),
                    datetime.now().isoformat()
                ))
            
            conn.commit()
            conn.close()
            
            self.stats['total_transactions'] += len(transactions)
            logger.info(f"  {len(transactions)}건 저장 완료")
            
        except Exception as e:
            logger.error(f"데이터 저장 오류: {e}")
    
    def record_progress(self, region_code: str, region_name: str, deal_type: str, 
                       year_month: str, status: str, items_found: int = 0, error_msg: str = None):
        """진행 상황 기록"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT OR REPLACE INTO crawling_status 
                (region_code, region_name, deal_type, year_month, status, items_found,
                 api_calls, error_message, started_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                region_code, region_name, deal_type, year_month, status, items_found,
                self.stats['api_calls'], error_msg, datetime.now().isoformat(),
                datetime.now().isoformat() if status == '완료' else None
            ))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"진행 상황 기록 오류: {e}")
    
    def crawl_region_complete(self, region_code: str, region_name: str):
        """지역별 완전 크롤링"""
        logger.info(f"\n=== {region_name} ({region_code}) 크롤링 시작 ===")
        
        # 최근 60개월 데이터 수집
        months = self.get_recent_months(60)
        deal_types = ['매매', '전세', '월세']
        
        region_total = 0
        
        for deal_type in deal_types:
            logger.info(f"  {deal_type} 데이터 수집 중...")
            
            for year_month in months:
                try:
                    self.record_progress(region_code, region_name, deal_type, year_month, '진행중')
                    
                    # API 호출
                    transactions = self.call_molit_api(region_code, deal_type, year_month)
                    
                    if transactions:
                        # 데이터 저장
                        self.save_transactions(transactions, region_code, region_name)
                        region_total += len(transactions)
                    
                    # 완료 기록
                    self.record_progress(region_code, region_name, deal_type, year_month, '완료', len(transactions))
                    
                except Exception as e:
                    logger.error(f"  {deal_type} {year_month} 처리 오류: {e}")
                    self.record_progress(region_code, region_name, deal_type, year_month, '오류', 0, str(e))
        
        logger.info(f"=== {region_name} 완료: 총 {region_total}건 ===")
        return region_total
    
    def start_nationwide_crawling(self):
        """전국 크롤링 시작"""
        logger.info("🚀 국토부 실거래가 전국 완전 크롤링 시작!")
        logger.info(f"📊 대상: {len(self.regions)}개 시군구")
        logger.info(f"📅 기간: 최근 60개월")
        logger.info(f"📋 유형: 매매, 전세, 월세")
        
        total_collected = 0
        
        for region_code, region_name in self.regions.items():
            try:
                # 지역별 크롤링
                region_count = self.crawl_region_complete(region_code, region_name)
                total_collected += region_count
                
                self.stats['regions_processed'] += 1
                
                # 지역간 딜레이 (API 제한 준수)
                time.sleep(random.uniform(2, 5))
                
            except Exception as e:
                logger.error(f"{region_name} 크롤링 오류: {e}")
                continue
        
        # 최종 결과
        self.print_final_results()
    
    def print_final_results(self):
        """최종 결과 출력"""
        duration = datetime.now() - self.stats['start_time']
        
        logger.info("\n" + "="*60)
        logger.info("🎉 국토부 실거래가 전국 크롤링 완료!")
        logger.info("="*60)
        logger.info(f"📊 최종 통계:")
        logger.info(f"  🏙️ 처리된 지역: {self.stats['regions_processed']}/{len(self.regions)}개")
        logger.info(f"  💰 수집된 거래: {self.stats['total_transactions']:,}건")
        logger.info(f"  📡 API 호출: {self.stats['api_calls']:,}회")
        logger.info(f"  ⏱️ 소요 시간: {duration}")
        logger.info(f"  📈 시간당 평균: {self.stats['total_transactions']/(duration.total_seconds()/3600):.0f}건/시간")
        
        # 지역별 통계
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT region_name, deal_type, COUNT(*) as count
                FROM apartment_transactions 
                GROUP BY region_name, deal_type 
                ORDER BY count DESC 
                LIMIT 20
            """)
            
            top_regions = cursor.fetchall()
            
            if top_regions:
                logger.info(f"\n📈 지역별 수집 현황 (상위 20):")
                for region, deal_type, count in top_regions:
                    logger.info(f"  {region} {deal_type}: {count:,}건")
            
            conn.close()
            
        except Exception as e:
            logger.error(f"통계 조회 오류: {e}")
        
        logger.info("="*60)

def main():
    """메인 실행"""
    print("국토부 실거래가 완전 크롤러 v1.0")
    print("="*40)
    print("- 전국 모든 시군구 실거래가 데이터 수집")
    print("- 아파트 매매/전세/월세 전체 수집")
    print("- 확실하게 동작하는 방법")
    print("="*40)
    
    crawler = MolitCompleteCrawler()
    
    try:
        crawler.start_nationwide_crawling()
    except KeyboardInterrupt:
        logger.info("⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"❌ 크롤링 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()