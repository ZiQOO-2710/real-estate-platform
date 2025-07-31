import asyncio
import aiohttp
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import logging

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('molit_crawling.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class MolitAPICrawler:
    def __init__(self, api_key: str, db_path: str = "real_estate_crawling.db"):
        self.api_key = api_key
        self.db_path = db_path
        self.base_url = "http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSDataService/"
        self.session = None
        self.init_database()

    def init_database(self):
        """국토부 실거래가 데이터를 저장할 테이블 초기화"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS molit_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT UNIQUE,
                complex_id TEXT, -- 네이버 부동산 complex_id와 연결될 수 있도록
                deal_year INTEGER NOT NULL,
                deal_month INTEGER NOT NULL,
                deal_day INTEGER NOT NULL,
                price INTEGER NOT NULL, -- 만원 단위
                area REAL, -- 전용면적
                floor INTEGER,
                deal_type TEXT, -- 매매, 전세, 월세 (API에서 제공하는 형태로)
                build_year INTEGER,
                address_road TEXT,
                address_jibun TEXT,
                city TEXT,
                gu TEXT,
                dong TEXT,
                raw_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_molit_complex_id ON molit_transactions(complex_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_molit_location ON molit_transactions(city, gu, dong)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_molit_deal_date ON molit_transactions(deal_year, deal_month, deal_day)')
        conn.commit()
        conn.close()
        logger.info("✅ Molit 실거래가 데이터베이스 구조 초기화 완료")

    async def init_session(self):
        """HTTP 세션 초기화"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/xml, text/xml, */*', # 국토부 API는 XML 응답
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
        }
        timeout = aiohttp.ClientTimeout(total=60)
        self.session = aiohttp.ClientSession(headers=headers, timeout=timeout)

    async def close_session(self):
        """HTTP 세션 종료"""
        if self.session:
            await self.session.close()

    async def fetch_molit_data(self, lawd_cd: str, deal_ymd: str, real_estate_type: str = "AptTrade") -> List[Dict]:
        """
        국토부 실거래가 API에서 데이터 조회
        :param lawd_cd: 법정동 코드 (5자리)
        :param deal_ymd: 계약년월 (YYYYMM)
        :param real_estate_type: 조회할 부동산 타입 (AptTrade, RntHouseTrade 등)
        :return: 파싱된 실거래가 데이터 리스트
        """
        if real_estate_type == "AptTrade":
            service_url = "getRTMSDataServiceAptTradeDev"
        elif real_estate_type == "RntHouseTrade": # 전월세
            service_url = "getRTMSDataServiceRntHouseTradeDev"
        else:
            logger.error(f"지원하지 않는 부동산 타입: {real_estate_type}")
            return []

        url = f"{self.base_url}{service_url}"
        params = {
            'serviceKey': self.api_key,
            'LAWD_CD': lawd_cd,
            'DEAL_YMD': deal_ymd
        }
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    text = await response.text()
                    # XML 파싱 로직 (간단한 예시, 실제로는 더 견고한 파서 필요)
                    # 여기서는 BeautifulSoup4 같은 라이브러리 사용을 고려할 수 있습니다.
                    # 하지만 현재 환경에서는 외부 라이브러리 사용이 제한되므로,
                    # 간단한 문자열 파싱 또는 정규표현식 사용을 고려해야 합니다.
                    # 일단은 raw text를 저장하고 추후 파싱하는 것으로 가정합니다.
                    
                    # 실제 API 응답은 XML이므로, 파싱 로직이 필요합니다.
                    # 예시: <item><거래금액>10,000</거래금액><건축년도>2000</건축년도>...</item>
                    # 여기서는 간단히 XML 텍스트를 반환하고, 실제 파싱은 save_transactions에서 처리합니다.
                    return self.parse_molit_xml(text, real_estate_type)
                else:
                    logger.error(f"국토부 API 호출 실패: {response.status} - {await response.text()}")
                    return []
        except Exception as e:
            logger.error(f"국토부 API 호출 중 오류 발생: {e}")
            return []

    def parse_molit_xml(self, xml_string: str, real_estate_type: str) -> List[Dict]:
        """
        국토부 API XML 응답을 파싱하여 딕셔너리 리스트로 변환
        (간단한 파싱 예시, 실제로는 더 견고한 XML 파서 필요)
        """
        transactions = []
        # 정규표현식을 사용하여 <item> 태그 블록을 찾습니다.
        item_pattern = re.compile(r'<item>(.*?)</item>', re.DOTALL)
        
        # 각 <item> 블록에서 필요한 정보를 추출합니다.
        for item_match in item_pattern.finditer(xml_string):
            item_content = item_match.group(1)
            
            data = {}
            
            # 공통 필드
            data['deal_year'] = self._extract_xml_tag(item_content, '년')
            data['deal_month'] = self._extract_xml_tag(item_content, '월')
            data['deal_day'] = self._extract_xml_tag(item_content, '일')
            data['area'] = self._extract_xml_tag(item_content, '전용면적')
            data['floor'] = self._extract_xml_tag(item_content, '층')
            data['build_year'] = self._extract_xml_tag(item_content, '건축년도')
            data['address_road'] = self._extract_xml_tag(item_content, '도로명')
            data['address_jibun'] = self._extract_xml_tag(item_content, '지번')
            data['city'] = self._extract_xml_tag(item_content, '시군구')
            data['dong'] = self._extract_xml_tag(item_content, '법정동')
            data['complex_name'] = self._extract_xml_tag(item_content, '아파트') # 아파트 매매에만 있음
            
            if real_estate_type == "AptTrade":
                data['price'] = self._extract_xml_tag(item_content, '거래금액')
                data['deal_type'] = '매매'
            elif real_estate_type == "RntHouseTrade":
                data['deposit'] = self._extract_xml_tag(item_content, '보증금')
                data['monthly_rent'] = self._extract_xml_tag(item_content, '월세')
                data['deal_type'] = self._extract_xml_tag(item_content, '전월세구분') # 전세, 월세
                
            transactions.append(data)
            
        return transactions

    def _extract_xml_tag(self, xml_content: str, tag_name: str) -> Optional[str]:
        """XML 내용에서 특정 태그의 값을 추출"""
        match = re.search(rf'<{tag_name}>(.*?)</{tag_name}>', xml_content)
        return match.group(1).strip() if match else None

    def save_transactions(self, transactions: List[Dict]):
        """추출된 국토부 실거래가 데이터를 데이터베이스에 저장"""
        if not transactions:
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        saved_count = 0
        for data in transactions:
            try:
                # 고유한 transaction_id 생성 (법정동코드 + 계약년월일 + 금액 + 면적 + 층)
                # 실제로는 API에서 제공하는 고유 ID가 있다면 그것을 사용하는 것이 좋습니다.
                # 여기서는 임시로 조합하여 사용합니다.
                transaction_id = f"{data.get('city', '')}_{data.get('dong', '')}_{data.get('deal_year', '')}{data.get('deal_month', '')}{data.get('deal_day', '')}_{data.get('price', data.get('deposit', ''))}_{data.get('area', '')}_{data.get('floor', '')}"
                
                # 중복 확인
                cursor.execute("SELECT id FROM molit_transactions WHERE transaction_id = ?", (transaction_id,))
                if cursor.fetchone():
                    continue # 이미 존재하는 데이터는 스킵

                cursor.execute('''
                    INSERT INTO molit_transactions (
                        transaction_id, complex_id, deal_year, deal_month, deal_day,
                        price, area, floor, deal_type, build_year,
                        address_road, address_jibun, city, gu, dong, raw_data
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    transaction_id,
                    None, # complex_id는 추후 매핑
                    data.get('deal_year'),
                    data.get('deal_month'),
                    data.get('deal_day'),
                    int(data['price'].replace(',', '')) if data.get('price') else None, # 콤마 제거 후 정수 변환
                    data.get('area'),
                    data.get('floor'),
                    data.get('deal_type'),
                    data.get('build_year'),
                    data.get('address_road'),
                    data.get('address_jibun'),
                    data.get('city'),
                    data.get('gu'), # gu는 API 응답에 직접적으로 없으므로, 법정동 코드로 유추하거나 별도 처리 필요
                    data.get('dong'),
                    json.dumps(data, ensure_ascii=False)
                ))
                saved_count += 1
            except Exception as e:
                logger.error(f"국토부 데이터 저장 오류: {e} - 데이터: {data}")
                continue
        
        conn.commit()
        conn.close()
        logger.info(f"💾 국토부 실거래가 데이터 {saved_count}개 저장/업데이트 완료")

    async def crawl_molit_data_for_region(self, lawd_cd: str, city: str, gu: str, dong: str, months: int = 60):
        """
        특정 법정동 코드에 대해 지정된 개월 수만큼 국토부 실거래가 데이터 크롤링
        :param lawd_cd: 법정동 코드 (5자리)
        :param city: 시
        :param gu: 구
        :param dong: 동
        :param months: 조회할 개월 수 (기본 60개월)
        """
        logger.info(f"🚀 국토부 실거래가 크롤링 시작: {city} {gu} {dong} ({lawd_cd}) - 최근 {months}개월")
        
        current_date = datetime.now()
        
        for i in range(months):
            target_date = current_date - timedelta(days=30 * i) # 대략적인 월 계산
            deal_ymd = target_date.strftime('%Y%m')
            
            logger.info(f"  🔍 {deal_ymd} 데이터 조회 중...")
            
            # 매매 데이터
            apt_transactions = await self.fetch_molit_data(lawd_cd, deal_ymd, "AptTrade")
            self.save_transactions(apt_transactions)
            
            # 전월세 데이터 (필요시 추가)
            # rnt_transactions = await self.fetch_molit_data(lawd_cd, deal_ymd, "RntHouseTrade")
            # self.save_transactions(rnt_transactions)
            
            await asyncio.sleep(1) # API 호출 간 딜레이

        logger.info(f"✅ 국토부 실거래가 크롤링 완료: {city} {gu} {dong} ({lawd_cd})")

async def main():
    # TODO: 여기에 실제 발급받은 국토부 API 키를 입력하세요.
    MOLIT_API_KEY = "UTbePYIP4ncyCPzhgiw146sprZ18xCv7Ca5xxNf0CNR1tM3Pl7Rldtr08mQQ1a4htR/PhCPWLdAbIdhgl7IDlQ==" 
    
    if MOLIT_API_KEY == "YOUR_MOLIT_API_KEY_HERE":
        logger.error("❌ 국토부 API 키를 입력해주세요. 공공데이터포털에서 발급받을 수 있습니다.")
        return

    crawler = MolitAPICrawler(api_key=MOLIT_API_KEY)
    await crawler.init_session()

    try:
        # 테스트를 위한 예시 법정동 코드 (서울 강남구 역삼동)
        test_lawd_cd = "11680" 
        test_city = "서울"
        test_gu = "강남구"
        test_dong = "역삼동"
        
        await crawler.crawl_molit_data_for_region(test_lawd_cd, test_city, test_gu, test_dong, months=3) # 3개월치만 테스트
        
    finally:
        await crawler.close_session()

if __name__ == "__main__":
    import re # parse_molit_xml 함수에서 re 모듈 사용
    asyncio.run(main())
