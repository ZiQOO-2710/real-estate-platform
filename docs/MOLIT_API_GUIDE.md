# 국토부 실거래가 API 사용 가이드

## 개요

국토교통부에서 제공하는 아파트 실거래가 API를 통해 부동산 거래 데이터를 수집하는 방법을 안내합니다.

## 1. 국토부 실거래가 API 기본 정보

### API 제공 기관
- **기관명**: 국토교통부 (Ministry of Land, Infrastructure and Transport)
- **제공 플랫폼**: 공공데이터포털 (data.go.kr)
- **데이터 형식**: XML
- **인증 방식**: Service Key 인증

### 주요 API 서비스

| 서비스명 | API 엔드포인트 | 설명 |
|---------|---------------|------|
| 아파트 매매 실거래가 | `RTMSDataSvcAptTradeDev` | 아파트 매매 거래 정보 |
| 아파트 전월세 실거래가 | `RTMSDataSvcAptRent` | 아파트 전세/월세 거래 정보 |
| 오피스텔 매매 실거래가 | `RTMSDataSvcOffiTrade` | 오피스텔 매매 거래 정보 |
| 오피스텔 전월세 실거래가 | `RTMSDataSvcOffiRent` | 오피스텔 전세/월세 거래 정보 |

## 2. 인증키 설정 방법

### 2.1 공공데이터포털 회원가입 및 API 신청

1. **공공데이터포털 접속**
   - URL: https://www.data.go.kr
   - 회원가입 및 로그인

2. **API 검색 및 신청**
   - 검색어: "국토교통부 아파트 매매 실거래가 자료"
   - 해당 API 페이지에서 [✏️활용신청] 버튼 클릭

3. **신청 정보 입력**
   ```
   활용목적: 부동산 데이터 분석
   상세활용내용: 아파트 실거래가 통계 분석 및 시각화
   서비스명: 부동산 플랫폼
   ```

4. **승인 및 서비스키 발급**
   - 일반적으로 1-2시간 내 승인
   - 마이페이지 > 개발계정 > 인증키 확인

### 2.2 서비스키 종류

- **인코딩 키**: URL 인코딩된 상태의 키
- **디코딩 키**: 원본 상태의 키 (권장)

## 3. API URL과 파라미터 구조

### 3.1 기본 URL 구조

```
http://apis.data.go.kr/1613000/{SERVICE_NAME}/{OPERATION_NAME}
```

### 3.2 아파트 매매 실거래가 API

```
http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev
```

### 3.3 필수 파라미터

| 파라미터 | 설명 | 예시 | 필수여부 |
|---------|------|------|----------|
| `serviceKey` | 인증키 | 발급받은 서비스키 | 필수 |
| `LAWD_CD` | 법정동 코드 (5자리) | 11680 (서울 강남구) | 필수 |
| `DEAL_YMD` | 거래년월 (YYYYMM) | 202401 (2024년 1월) | 필수 |
| `pageNo` | 페이지 번호 | 1 | 선택 |
| `numOfRows` | 한 페이지 결과 수 | 10 | 선택 |

### 3.4 지역코드 예시

```python
# 서울특별시 주요 구 코드
REGION_CODES = {
    "종로구": "11110",
    "중구": "11140",
    "용산구": "11170",
    "성동구": "11200",
    "광진구": "11215",
    "동대문구": "11230",
    "중랑구": "11260",
    "성북구": "11290",
    "강북구": "11305",
    "도봉구": "11320",
    "노원구": "11350",
    "은평구": "11380",
    "서대문구": "11410",
    "마포구": "11440",
    "양천구": "11470",
    "강서구": "11500",
    "구로구": "11530",
    "금천구": "11545",
    "영등포구": "11560",
    "동작구": "11590",
    "관악구": "11620",
    "서초구": "11650",
    "강남구": "11680",
    "송파구": "11710",
    "강동구": "11740"
}
```

## 4. 데이터 포맷과 파싱 방법

### 4.1 XML 응답 구조

```xml
<?xml version="1.0" encoding="UTF-8"?>
<response>
    <header>
        <resultCode>00</resultCode>
        <resultMsg>NORMAL SERVICE.</resultMsg>
    </header>
    <body>
        <items>
            <item>
                <sggCd>11680</sggCd>
                <umdNm>삼성동</umdNm>
                <aptNm>래미안삼성</aptNm>
                <dealAmount>170,000</dealAmount>
                <dealYear>2024</dealYear>
                <dealMonth>1</dealMonth>
                <dealDay>5</dealDay>
                <excluUseAr>84.12</excluUseAr>
                <floor>10</floor>
                <buildYear>2004</buildYear>
                <dong>101동</dong>
                <jibun>159-1</jibun>
            </item>
        </items>
        <numOfRows>10</numOfRows>
        <pageNo>1</pageNo>
        <totalCount>1</totalCount>
    </body>
</response>
```

### 4.2 응답 필드 설명

| 필드명 | 설명 | 예시 |
|--------|------|------|
| `sggCd` | 시군구 코드 | 11680 |
| `umdNm` | 법정동명 | 삼성동 |
| `aptNm` | 아파트명 | 래미안삼성 |
| `dealAmount` | 거래금액 (만원) | 170,000 |
| `dealYear` | 거래년도 | 2024 |
| `dealMonth` | 거래월 | 1 |
| `dealDay` | 거래일 | 5 |
| `excluUseAr` | 전용면적 (㎡) | 84.12 |
| `floor` | 층 | 10 |
| `buildYear` | 건축년도 | 2004 |
| `dong` | 동 | 101동 |
| `jibun` | 지번 | 159-1 |

### 4.3 Python 파싱 예제

```python
import xml.etree.ElementTree as ET
import requests

def parse_apartment_data(xml_text):
    """XML 응답 파싱"""
    root = ET.fromstring(xml_text)
    transactions = []
    
    items = root.findall('.//item')
    for item in items:
        transaction = {
            'sgg_cd': item.find('sggCd').text if item.find('sggCd') is not None else '',
            'umd_nm': item.find('umdNm').text if item.find('umdNm') is not None else '',
            'apt_nm': item.find('aptNm').text if item.find('aptNm') is not None else '',
            'deal_amount': item.find('dealAmount').text if item.find('dealAmount') is not None else '',
            'deal_year': item.find('dealYear').text if item.find('dealYear') is not None else '',
            'deal_month': item.find('dealMonth').text if item.find('dealMonth') is not None else '',
            'deal_day': item.find('dealDay').text if item.find('dealDay') is not None else '',
            'exclu_use_ar': item.find('excluUseAr').text if item.find('excluUseAr') is not None else '',
            'floor': item.find('floor').text if item.find('floor') is not None else '',
            'build_year': item.find('buildYear').text if item.find('buildYear') is not None else '',
            'dong': item.find('dong').text if item.find('dong') is not None else '',
            'jibun': item.find('jibun').text if item.find('jibun') is not None else ''
        }
        transactions.append(transaction)
    
    return transactions
```

## 5. 요청 제한 및 에러 처리

### 5.1 API 호출 제한

- **개발계정**: 10,000건/일
- **운영계정**: 1,000,000건/일
- **동시 접속**: 제한 없음 (적절한 지연 권장)

### 5.2 주요 에러 코드

| 에러코드 | 설명 | 해결방법 |
|----------|------|----------|
| `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` | 등록되지 않은 서비스키 | 서비스키 재확인 |
| `REQUEST_MESSAGE_PARSING_ERROR` | 요청 메시지 파싱 오류 | 파라미터 형식 확인 |
| `NODATA_ERROR` | 데이터 없음 | 다른 지역/기간 조회 |
| `HTTP_ERROR` | HTTP 오류 | 네트워크 상태 확인 |
| `QUOTA_EXCEEDED` | 할당량 초과 | 호출 횟수 확인 |

### 5.3 에러 처리 예제

```python
def safe_api_request(url, params, max_retries=3):
    """안전한 API 요청"""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code == 200:
                # XML 응답 확인
                root = ET.fromstring(response.text)
                result_code = root.find('.//resultCode')
                
                if result_code is not None and result_code.text == '00':
                    return response.text
                else:
                    result_msg = root.find('.//resultMsg')
                    error_msg = result_msg.text if result_msg is not None else 'Unknown error'
                    logger.error(f"API 오류: {error_msg}")
                    return None
            else:
                logger.error(f"HTTP 오류: {response.status_code}")
                
        except requests.exceptions.Timeout:
            logger.warning(f"타임아웃 발생 (시도 {attempt + 1}/{max_retries})")
            time.sleep(2 ** attempt)  # 지수적 백오프
            
        except Exception as e:
            logger.error(f"요청 오류: {str(e)}")
            
    return None
```

## 6. 아파트 실거래가 데이터 수집 예제

### 6.1 기본 수집 예제

```python
import requests
from urllib.parse import urlencode
import xml.etree.ElementTree as ET

def collect_apartment_data(service_key, region_code, year_month):
    """아파트 실거래가 데이터 수집"""
    
    url = "http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
    
    params = {
        'serviceKey': service_key,
        'LAWD_CD': region_code,
        'DEAL_YMD': year_month,
        'pageNo': '1',
        'numOfRows': '1000'
    }
    
    try:
        response = requests.get(url, params=params)
        
        if response.status_code == 200:
            # XML 파싱
            root = ET.fromstring(response.text)
            
            # 결과 확인
            result_code = root.find('.//resultCode')
            if result_code is not None and result_code.text == '00':
                items = root.findall('.//item')
                
                transactions = []
                for item in items:
                    transaction = {
                        'apt_name': item.find('aptNm').text,
                        'deal_amount': item.find('dealAmount').text,
                        'deal_date': f"{item.find('dealYear').text}-{item.find('dealMonth').text.zfill(2)}-{item.find('dealDay').text.zfill(2)}",
                        'area': item.find('excluUseAr').text,
                        'floor': item.find('floor').text,
                        'build_year': item.find('buildYear').text,
                        'dong_name': item.find('umdNm').text
                    }
                    transactions.append(transaction)
                
                return transactions
            else:
                result_msg = root.find('.//resultMsg')
                print(f"API 오류: {result_msg.text if result_msg is not None else 'Unknown error'}")
                return []
        else:
            print(f"HTTP 오류: {response.status_code}")
            return []
            
    except Exception as e:
        print(f"데이터 수집 오류: {str(e)}")
        return []

# 사용 예제
service_key = "YOUR_SERVICE_KEY"
region_code = "11680"  # 서울 강남구
year_month = "202401"  # 2024년 1월

data = collect_apartment_data(service_key, region_code, year_month)
print(f"수집된 거래 건수: {len(data)}")
```

### 6.2 대량 수집 예제

```python
import time
import logging
from datetime import datetime, timedelta

def collect_multiple_regions_data(service_key, regions, year_months):
    """여러 지역의 실거래가 데이터 대량 수집"""
    
    all_data = []
    
    for region_code in regions:
        for year_month in year_months:
            print(f"수집 중: {region_code}, {year_month}")
            
            data = collect_apartment_data(service_key, region_code, year_month)
            all_data.extend(data)
            
            # API 호출 간 지연 (공공데이터포털 정책 준수)
            time.sleep(0.1)
    
    return all_data

# 사용 예제
regions = ["11680", "11650", "11710"]  # 강남구, 서초구, 송파구
year_months = ["202401", "202402", "202403"]  # 2024년 1-3월

all_data = collect_multiple_regions_data(service_key, regions, year_months)
print(f"총 수집된 거래 건수: {len(all_data)}")
```

## 7. 데이터베이스 저장 방법

### 7.1 SQLite 테이블 생성

```sql
CREATE TABLE apartment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sgg_cd TEXT NOT NULL,
    umd_nm TEXT NOT NULL,
    apt_nm TEXT NOT NULL,
    deal_amount TEXT,
    deal_year TEXT,
    deal_month TEXT,
    deal_day TEXT,
    exclu_use_ar TEXT,
    floor TEXT,
    build_year TEXT,
    dong TEXT,
    jibun TEXT,
    deal_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sgg_cd, umd_nm, apt_nm, deal_year, deal_month, deal_day, exclu_use_ar, floor)
);
```

### 7.2 데이터 저장 예제

```python
import sqlite3

def save_to_database(transactions, db_path="apartment_data.db"):
    """거래 데이터 데이터베이스 저장"""
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    saved_count = 0
    
    for transaction in transactions:
        try:
            cursor.execute('''
                INSERT OR IGNORE INTO apartment_transactions
                (sgg_cd, umd_nm, apt_nm, deal_amount, deal_year, deal_month, deal_day,
                 exclu_use_ar, floor, build_year, dong, jibun, deal_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                transaction.get('sgg_cd', ''),
                transaction.get('umd_nm', ''),
                transaction.get('apt_nm', ''),
                transaction.get('deal_amount', ''),
                transaction.get('deal_year', ''),
                transaction.get('deal_month', ''),
                transaction.get('deal_day', ''),
                transaction.get('exclu_use_ar', ''),
                transaction.get('floor', ''),
                transaction.get('build_year', ''),
                transaction.get('dong', ''),
                transaction.get('jibun', ''),
                transaction.get('deal_date', '')
            ))
            
            if cursor.rowcount > 0:
                saved_count += 1
                
        except Exception as e:
            print(f"저장 오류: {e}")
            continue
    
    conn.commit()
    conn.close()
    
    return saved_count
```

## 8. 주의사항 및 모범 사례

### 8.1 API 사용 시 주의사항

1. **HTTPS → HTTP 변경 필요**
   - 공공데이터포털 API는 HTTP 프로토콜 사용
   - HTTPS로 요청 시 오류 발생 가능

2. **적절한 지연시간 설정**
   - 연속 요청 시 0.1초 이상 지연 권장
   - 서버 부하 방지

3. **에러 처리 로직 구현**
   - 네트워크 오류, 타임아웃 처리
   - 재시도 메커니즘 구현

### 8.2 데이터 수집 모범 사례

1. **점진적 수집**
   - 최신 데이터부터 과거 순으로 수집
   - 배치 단위로 처리

2. **중복 제거**
   - 데이터베이스에 UNIQUE 제약조건 설정
   - INSERT OR IGNORE 사용

3. **로깅 및 모니터링**
   - 수집 진행 상황 기록
   - 오류 발생 시 알림 설정

## 9. 추가 리소스

### 9.1 공식 문서
- [공공데이터포털](https://www.data.go.kr)
- [국토교통부 실거래가공개시스템](https://rt.molit.go.kr)

### 9.2 관련 라이브러리
- [PublicDataReader](https://github.com/WooilJeong/PublicDataReader): 공공데이터 수집 라이브러리
- [requests](https://requests.readthedocs.io/): HTTP 요청 라이브러리
- [xml.etree.ElementTree](https://docs.python.org/3/library/xml.etree.elementtree.html): XML 파싱 라이브러리

### 9.3 예제 코드
현재 프로젝트의 `molit_api_crawler.py` 파일을 참고하여 실제 구현에 활용할 수 있습니다.

---

**마지막 업데이트**: 2024-07-15
**작성자**: Claude Code Assistant