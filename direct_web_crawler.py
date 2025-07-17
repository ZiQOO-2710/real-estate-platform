#!/usr/bin/env python3
"""
직접 웹페이지 크롤링 방식
- 실제 네이버 부동산 페이지에서 데이터 추출
- 확실하고 안정적인 방법
"""

import requests
from bs4 import BeautifulSoup
import json
import re
import time
import random
import sqlite3
from datetime import datetime
import logging
from typing import List, Dict

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('direct_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DirectWebCrawler:
    """직접 웹페이지 크롤링"""
    
    def __init__(self):
        self.session = requests.Session()
        self.db_path = "direct_real_estate.db"
        self.setup_session()
        self.init_database()
        
        # 서울 지역 리스트 (확실한 방법)
        self.seoul_districts = {
            '강남구': 'https://new.land.naver.com/complexes?ms=37.5172,127.0473,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11680',
            '서초구': 'https://new.land.naver.com/complexes?ms=37.4837,127.0324,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11650',
            '송파구': 'https://new.land.naver.com/complexes?ms=37.5145,127.1066,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11710',
            '영등포구': 'https://new.land.naver.com/complexes?ms=37.5263,126.8968,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11560',
            '마포구': 'https://new.land.naver.com/complexes?ms=37.5615,126.9087,13&a=APT:ABYG:JGC:PRE&e=RETAIL&cortarNo=11440'
        }
        
        self.stats = {
            'total_pages': 0,
            'total_complexes': 0,
            'total_listings': 0,
            'start_time': datetime.now()
        }
    
    def setup_session(self):
        """세션 설정"""
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        })
    
    def init_database(self):
        """데이터베이스 초기화"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS found_apartments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                district TEXT,
                complex_name TEXT,
                address TEXT,
                price_info TEXT,
                area_info TEXT,
                page_url TEXT,
                extracted_data TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS crawl_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                district TEXT,
                page_url TEXT,
                status TEXT,
                items_found INTEGER,
                error_message TEXT,
                crawled_at TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        conn.close()
        logger.info("데이터베이스 초기화 완료")
    
    def extract_apartments_from_page(self, url: str, district: str) -> List[Dict]:
        """페이지에서 아파트 정보 추출"""
        logger.info(f"{district} 페이지 크롤링: {url}")
        
        try:
            response = self.session.get(url, timeout=30)
            
            if response.status_code != 200:
                logger.error(f"페이지 로드 실패: {response.status_code}")
                return []
            
            # HTML 파싱
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # 스크립트에서 JSON 데이터 추출
            apartments = []
            
            # 방법 1: JavaScript 변수에서 데이터 추출
            scripts = soup.find_all('script')
            for script in scripts:
                if script.string and 'complexList' in script.string:
                    # JavaScript에서 complexList 데이터 추출
                    js_content = script.string
                    
                    # 정규식으로 JSON 데이터 추출
                    patterns = [
                        r'complexList["\']?\s*:\s*(\[.*?\])',
                        r'complexList["\']?\s*=\s*(\[.*?\])',
                        r'"complexList"\s*:\s*(\[.*?\])'
                    ]
                    
                    for pattern in patterns:
                        matches = re.findall(pattern, js_content, re.DOTALL)
                        for match in matches:
                            try:
                                data = json.loads(match)
                                logger.info(f"JavaScript에서 {len(data)}개 아파트 데이터 발견")
                                apartments.extend(data)
                            except:
                                continue
            
            # 방법 2: HTML 요소에서 직접 추출
            apartment_elements = soup.find_all(['div', 'li', 'article'], class_=re.compile(r'(complex|item|card|list)'))
            
            for element in apartment_elements:
                text = element.get_text(strip=True)
                
                # 아파트 관련 키워드 필터링
                if any(keyword in text for keyword in ['아파트', '단지', '억', '만원', '㎡', '평']):
                    # 이름 추출
                    name_element = element.find(['h3', 'h4', 'strong', 'span'], string=re.compile(r'[가-힣]+'))
                    name = name_element.text.strip() if name_element else ''
                    
                    # 가격 정보 추출
                    price_matches = re.findall(r'\d+억\s*\d*|\d+만원|\d+,\d+만원', text)
                    
                    # 면적 정보 추출
                    area_matches = re.findall(r'\d+\.?\d*㎡|\d+\.?\d*평', text)
                    
                    if name and (price_matches or area_matches):
                        apartments.append({
                            'complexName': name,
                            'address': '',
                            'price_info': ' / '.join(price_matches[:3]),
                            'area_info': ' / '.join(area_matches[:3]),
                            'source': 'html_extraction',
                            'raw_text': text[:200]
                        })
            
            # 방법 3: 메타 태그에서 정보 추출
            meta_tags = soup.find_all('meta')
            for meta in meta_tags:
                content = meta.get('content', '')
                if '아파트' in content and '단지' in content:
                    logger.info(f"메타 태그에서 아파트 정보 발견: {content[:100]}")
            
            logger.info(f"{district}: 총 {len(apartments)}개 아파트 정보 추출")
            return apartments
            
        except Exception as e:
            logger.error(f"{district} 페이지 크롤링 오류: {e}")
            return []
    
    def save_apartments(self, district: str, apartments: List[Dict], page_url: str):
        """아파트 정보 저장"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            for apt in apartments:
                cursor.execute("""
                    INSERT INTO found_apartments 
                    (district, complex_name, address, price_info, area_info, page_url, extracted_data, crawled_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    district,
                    apt.get('complexName', ''),
                    apt.get('address', ''),
                    apt.get('price_info', ''),
                    apt.get('area_info', ''),
                    page_url,
                    json.dumps(apt, ensure_ascii=False),
                    datetime.now().isoformat()
                ))
            
            # 크롤링 결과 기록
            cursor.execute("""
                INSERT INTO crawl_results 
                (district, page_url, status, items_found, crawled_at)
                VALUES (?, ?, ?, ?, ?)
            """, (
                district, page_url, '완료', len(apartments), datetime.now().isoformat()
            ))
            
            conn.commit()
            conn.close()
            
            self.stats['total_complexes'] += len(apartments)
            logger.info(f"{district}: {len(apartments)}개 아파트 정보 저장 완료")
            
        except Exception as e:
            logger.error(f"데이터 저장 오류: {e}")
    
    def get_apartment_details(self, apartment_url: str) -> Dict:
        """개별 아파트 상세 정보 수집"""
        try:
            response = self.session.get(apartment_url, timeout=30)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                
                # 상세 정보 추출
                details = {
                    'title': soup.find('title').text if soup.find('title') else '',
                    'price_list': [],
                    'area_list': [],
                    'floor_info': [],
                    'deal_types': []
                }
                
                # 가격 정보 추출
                price_elements = soup.find_all(text=re.compile(r'\d+억|\d+만원'))
                details['price_list'] = list(set([p.strip() for p in price_elements if p.strip()]))[:10]
                
                # 면적 정보 추출
                area_elements = soup.find_all(text=re.compile(r'\d+\.?\d*㎡|\d+\.?\d*평'))
                details['area_list'] = list(set([a.strip() for a in area_elements if a.strip()]))[:10]
                
                # 거래 유형 추출
                deal_elements = soup.find_all(text=re.compile(r'매매|전세|월세'))
                details['deal_types'] = list(set([d.strip() for d in deal_elements if d.strip()]))[:5]
                
                logger.info(f"상세 정보 수집 완료: 가격 {len(details['price_list'])}개, 면적 {len(details['area_list'])}개")
                return details
                
            return {}
            
        except Exception as e:
            logger.error(f"상세 정보 수집 오류: {e}")
            return {}
    
    def start_crawling(self):
        """크롤링 시작"""
        logger.info("=== 직접 웹페이지 크롤링 시작 ===")
        logger.info(f"대상 지역: {len(self.seoul_districts)}개 구")
        
        for district, url in self.seoul_districts.items():
            logger.info(f"\n[{district}] 크롤링 시작")
            
            try:
                # 페이지에서 아파트 정보 추출
                apartments = self.extract_apartments_from_page(url, district)
                
                if apartments:
                    # 데이터 저장
                    self.save_apartments(district, apartments, url)
                    
                    # 상세 정보 수집 (일부만)
                    for i, apt in enumerate(apartments[:3]):  # 처음 3개만 상세 수집
                        if 'complexNo' in apt:
                            detail_url = f"https://new.land.naver.com/complexes/{apt['complexNo']}"
                            details = self.get_apartment_details(detail_url)
                            
                            if details:
                                self.stats['total_listings'] += len(details.get('price_list', []))
                        
                        time.sleep(2)
                else:
                    logger.warning(f"{district}: 아파트 정보를 찾을 수 없습니다")
                
                self.stats['total_pages'] += 1
                
            except Exception as e:
                logger.error(f"{district} 크롤링 오류: {e}")
            
            # 지역간 딜레이
            time.sleep(random.uniform(5, 10))
        
        self.print_results()
    
    def print_results(self):
        """결과 출력"""
        duration = datetime.now() - self.stats['start_time']
        
        logger.info("\n" + "="*50)
        logger.info("직접 웹페이지 크롤링 완료!")
        logger.info("="*50)
        logger.info(f"처리된 페이지: {self.stats['total_pages']}개")
        logger.info(f"발견된 아파트: {self.stats['total_complexes']}개")
        logger.info(f"수집된 매물정보: {self.stats['total_listings']}개")
        logger.info(f"소요 시간: {duration}")
        logger.info("="*50)
        
        # 샘플 데이터 출력
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("SELECT district, complex_name, price_info FROM found_apartments LIMIT 10")
            samples = cursor.fetchall()
            
            if samples:
                logger.info("\n발견된 아파트 샘플:")
                for district, name, price in samples:
                    logger.info(f"  {district}: {name} - {price}")
            
            conn.close()
            
        except Exception as e:
            logger.error(f"샘플 데이터 조회 오류: {e}")

def main():
    """메인 실행"""
    print("직접 웹페이지 크롤링 v1.0")
    print("="*30)
    print("- 실제 네이버 부동산 페이지에서 데이터 추출")
    print("- 확실하고 안정적인 방법")
    print("="*30)
    
    crawler = DirectWebCrawler()
    
    try:
        crawler.start_crawling()
    except KeyboardInterrupt:
        logger.info("사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"크롤링 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()