#!/usr/bin/env python3
"""
소재지번 기반 아파트 실거래가 검색 시스템
- 소재지번 입력 → 반경별(1km/3km/5km) 크롤링 데이터 검색
- 기존 CSV 분석 모듈 수정 버전
"""

import os
import sqlite3
import pandas as pd
import numpy as np
from flask import Flask, render_template, request, send_file, session, flash, redirect, url_for
from geopy.distance import geodesic
import requests
import json
import tempfile
from datetime import datetime
import math

# 카카오 API 설정 (환경변수에서 가져오기)
KAKAO_REST_API_KEY = os.environ.get('KAKAO_REST_API_KEY', '4d78bb8b1fb1d5946de3db02cff0b4cc')

app = Flask(__name__)
app.secret_key = 'real-estate-search-secret-key'

# 업로드 폴더 설정
app.config['UPLOAD_FOLDER'] = 'search_results'
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def get_coordinates_from_address(address):
    """주소를 좌표로 변환 (테스트용 하드코딩)"""
    # 테스트용 주요 지역 좌표 (서울/부산)
    address_coords = {
        # 서울 강남구
        '서울특별시 강남구 삼성동': (37.5149, 127.0557),
        '서울특별시 강남구 역삼동': (37.5007, 127.0361),
        '서울특별시 강남구 선릉동': (37.5042, 127.0485),
        '서울특별시 강남구 청담동': (37.5200, 127.0538),
        '서울특별시 강남구 논현동': (37.5099, 127.0225),
        '서울특별시 강남구 압구정동': (37.5270, 127.0286),
        '서울특별시 강남구 신사동': (37.5176, 127.0203),
        '서울특별시 강남구 도곡동': (37.4905, 127.0456),
        '서울특별시 강남구 개포동': (37.4846, 127.0665),
        '서울특별시 강남구 일원동': (37.4814, 127.0864),
        '서울특별시 강남구 수서동': (37.4838, 127.1018),
        '서울특별시 강남구 세곡동': (37.4721, 127.1045),
        
        # 서울 서초구
        '서울특별시 서초구 서초동': (37.4942, 127.0144),
        '서울특별시 서초구 반포동': (37.5138, 127.0108),
        '서울특별시 서초구 잠원동': (37.5158, 127.0093),
        '서울특별시 서초구 방배동': (37.4816, 126.9978),
        '서울특별시 서초구 양재동': (37.4671, 127.0441),
        '서울특별시 서초구 내곡동': (37.4607, 127.0821),
        
        # 서울 송파구
        '서울특별시 송파구 잠실동': (37.5125, 127.0982),
        '서울특별시 송파구 신천동': (37.5166, 127.1025),
        '서울특별시 송파구 풍납동': (37.5353, 127.1158),
        '서울특별시 송파구 송파동': (37.5044, 127.1106),
        '서울특별시 송파구 석촌동': (37.5048, 127.1053),
        '서울특별시 송파구 삼전동': (37.4954, 127.0893),
        '서울특별시 송파구 가락동': (37.4924, 127.1180),
        '서울특별시 송파구 문정동': (37.4859, 127.1216),
        '서울특별시 송파구 장지동': (37.4783, 127.1264),
        '서울특별시 송파구 마천동': (37.4942, 127.1468),
        '서울특별시 송파구 거여동': (37.4935, 127.1433),
        '서울특별시 송파구 오금동': (37.5026, 127.1284),
        
        # 서울 강동구
        '서울특별시 강동구 암사동': (37.5482, 127.1298),
        '서울특별시 강동구 천호동': (37.5386, 127.1238),
        '서울특별시 강동구 성내동': (37.5336, 127.1269),
        '서울특별시 강동구 길동': (37.5387, 127.1435),
        '서울특별시 강동구 둔촌동': (37.5287, 127.1364),
        '서울특별시 강동구 고덕동': (37.5549, 127.1544),
        '서울특별시 강동구 명일동': (37.5501, 127.1466),
        '서울특별시 강동구 상일동': (37.5637, 127.1738),
        
        # 부산 해운대구
        '부산광역시 해운대구 우동': (35.1626, 129.1639),
        '부산광역시 해운대구 좌동': (35.1466, 129.1765),
        '부산광역시 해운대구 중동': (35.1586, 129.1601),
        '부산광역시 해운대구 송정동': (35.1789, 129.1998),
        '부산광역시 해운대구 재송동': (35.1888, 129.1319),
        '부산광역시 해운대구 반송동': (35.1968, 129.1245),
        '부산광역시 해운대구 반여동': (35.1897, 129.1384),
        '부산광역시 해운대구 석대동': (35.1971, 129.1193),
        
        # 부산 수영구
        '부산광역시 수영구 수영동': (35.1453, 129.1125),
        '부산광역시 수영구 망미동': (35.1553, 129.1029),
        '부산광역시 수영구 남천동': (35.1426, 129.1187),
        '부산광역시 수영구 민락동': (35.1538, 129.1309),
        '부산광역시 수영구 광안동': (35.1537, 129.1186),
        
        # 간단한 형태
        '강남구 삼성동': (37.5149, 127.0557),
        '강남구 역삼동': (37.5007, 127.0361),
        '서초구 반포동': (37.5138, 127.0108),
        '송파구 잠실동': (37.5125, 127.0982),
        '강동구 천호동': (37.5386, 127.1238),
        '해운대구 우동': (35.1626, 129.1639),
        '수영구 수영동': (35.1453, 129.1125),
        '삼성동': (37.5149, 127.0557),
        '역삼동': (37.5007, 127.0361),
        '반포동': (37.5138, 127.0108),
        '잠실동': (37.5125, 127.0982),
        '천호동': (37.5386, 127.1238),
        '우동': (35.1626, 129.1639)
    }
    
    # 입력 주소가 테스트 좌표에 있는지 확인
    for test_addr, coords in address_coords.items():
        if test_addr in address or address in test_addr:
            return coords
    
    # 실제 카카오 API 호출 (원래 코드 유지)
    try:
        url = "https://dapi.kakao.com/v2/local/search/address.json"
        headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
        params = {"query": address}
        
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if data['documents']:
                doc = data['documents'][0]
                if doc.get('road_address'):
                    lat = float(doc['road_address']['y'])
                    lon = float(doc['road_address']['x'])
                elif doc.get('address'):
                    lat = float(doc['address']['y'])
                    lon = float(doc['address']['x'])
                else:
                    return None, None
                return lat, lon
        
        # 주소 검색 실패 시 키워드 검색 시도
        url = "https://dapi.kakao.com/v2/local/search/keyword.json"
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if data['documents']:
                doc = data['documents'][0]
                lat = float(doc['y'])
                lon = float(doc['x'])
                return lat, lon
                
    except Exception as e:
        print(f"주소 변환 오류: {e}")
    
    return None, None

def calculate_distance(lat1, lon1, lat2, lon2):
    """두 좌표 간의 거리 계산 (미터 단위)"""
    try:
        if any(coord is None for coord in [lat1, lon1, lat2, lon2]):
            return float('inf')
        
        coord1 = (lat1, lon1)
        coord2 = (lat2, lon2)
        distance = geodesic(coord1, coord2).meters
        return distance
    except:
        return float('inf')

def search_apartments_by_radius(center_lat, center_lon, radius_km=5):
    """반경 내 아파트 검색"""
    try:
        # 크롤링된 데이터베이스 연결
        db_path = "real_estate_crawling.db"
        if not os.path.exists(db_path):
            return pd.DataFrame(), f"크롤링 데이터베이스를 찾을 수 없습니다: {db_path}"
        
        conn = sqlite3.connect(db_path)
        
        # 아파트 데이터 조회
        query = """
        SELECT 
            complex_id,
            complex_name,
            city,
            gu,
            dong,
            address_road,
            latitude,
            longitude,
            total_units,
            construction_year,
            deal_min_price,
            deal_max_price,
            deal_count,
            lease_min_price,
            lease_max_price,
            lease_count,
            rent_min_price,
            rent_max_price,
            rent_count,
            min_area,
            max_area,
            trade_types
        FROM apartment_complexes
        WHERE latitude IS NOT NULL 
        AND longitude IS NOT NULL
        """
        
        df = pd.read_sql_query(query, conn)
        conn.close()
        
        if df.empty:
            return pd.DataFrame(), "크롤링된 아파트 데이터가 없습니다."
        
        # 거리 계산
        df['distance_m'] = df.apply(
            lambda row: calculate_distance(
                center_lat, center_lon, 
                row['latitude'], row['longitude']
            ), axis=1
        )
        
        # 반경 내 필터링
        radius_m = radius_km * 1000
        filtered_df = df[df['distance_m'] <= radius_m].copy()
        
        if filtered_df.empty:
            return pd.DataFrame(), f"반경 {radius_km}km 내에서 아파트를 찾을 수 없습니다."
        
        # 거리순 정렬
        filtered_df = filtered_df.sort_values('distance_m')
        
        # 결과 데이터 포맷팅
        result_df = filtered_df[[
            'complex_name', 'city', 'gu', 'dong', 'address_road',
            'construction_year', 'total_units', 'trade_types',
            'deal_min_price', 'deal_max_price', 'deal_count',
            'lease_min_price', 'lease_max_price', 'lease_count',
            'rent_min_price', 'rent_max_price', 'rent_count',
            'min_area', 'max_area', 'distance_m', 'latitude', 'longitude'
        ]].copy()
        
        # 컬럼명 한글화
        result_df.columns = [
            '아파트명', '시', '구', '동', '도로명주소',
            '건축년도', '세대수', '거래유형',
            '매매최저가(만원)', '매매최고가(만원)', '매매건수',
            '전세최저가(만원)', '전세최고가(만원)', '전세건수', 
            '월세최저가(만원)', '월세최고가(만원)', '월세건수',
            '최소면적(㎡)', '최대면적(㎡)', '거리(m)', '위도', '경도'
        ]
        
        return result_df, None
        
    except Exception as e:
        return pd.DataFrame(), f"검색 중 오류 발생: {str(e)}"

def generate_statistics(df):
    """검색 결과 통계 생성"""
    if df.empty:
        return {}
    
    stats = {
        'total_count': len(df),
        'avg_distance': df['거리(m)'].mean() if '거리(m)' in df.columns else 0,
        'price_stats': {},
        'area_stats': {},
        'year_stats': {},
        'region_stats': {}
    }
    
    # 가격 통계 (매매)
    deal_prices = []
    for _, row in df.iterrows():
        if pd.notna(row.get('매매최저가(만원)')) and row.get('매매건수', 0) > 0:
            min_price = row.get('매매최저가(만원)', 0)
            max_price = row.get('매매최고가(만원)', 0)
            if min_price > 0:
                deal_prices.extend([min_price, max_price])
    
    if deal_prices:
        stats['price_stats'] = {
            'deal_min': min(deal_prices),
            'deal_max': max(deal_prices),
            'deal_avg': sum(deal_prices) / len(deal_prices),
            'deal_count': len([row for _, row in df.iterrows() if row.get('매매건수', 0) > 0])
        }
    
    # 면적 통계
    areas = []
    for _, row in df.iterrows():
        if pd.notna(row.get('최소면적(㎡)')):
            areas.append(row.get('최소면적(㎡)', 0))
        if pd.notna(row.get('최대면적(㎡)')):
            areas.append(row.get('최대면적(㎡)', 0))
    
    if areas:
        stats['area_stats'] = {
            'min_area': min(areas),
            'max_area': max(areas),
            'avg_area': sum(areas) / len(areas)
        }
    
    # 건축년도 통계
    years = [row.get('건축년도', 0) for _, row in df.iterrows() if pd.notna(row.get('건축년도')) and row.get('건축년도', 0) > 0]
    if years:
        stats['year_stats'] = {
            'oldest_year': min(years),
            'newest_year': max(years),
            'avg_year': sum(years) / len(years)
        }
    
    # 지역별 통계
    region_counts = df.groupby(['구', '동']).size().to_dict()
    stats['region_stats'] = region_counts
    
    return stats

@app.route('/')
def index():
    """메인 페이지"""
    return render_template('address_search.html')

@app.route('/search', methods=['POST'])
def search():
    """주소 기반 검색"""
    try:
        address = request.form.get('address', '').strip()
        radius = float(request.form.get('radius', 5))
        
        if not address:
            flash('소재지번을 입력해주세요.', 'error')
            return redirect(url_for('index'))
        
        # 주소를 좌표로 변환
        center_lat, center_lon = get_coordinates_from_address(address)
        
        if center_lat is None or center_lon is None:
            flash(f'입력한 주소의 좌표를 찾을 수 없습니다: {address}', 'error')
            return redirect(url_for('index'))
        
        # 반경 내 아파트 검색
        result_df, error = search_apartments_by_radius(center_lat, center_lon, radius)
        
        if error:
            flash(error, 'error')
            return redirect(url_for('index'))
        
        if result_df.empty:
            flash(f'반경 {radius}km 내에서 아파트를 찾을 수 없습니다.', 'warning')
            return redirect(url_for('index'))
        
        # 통계 생성
        stats = generate_statistics(result_df)
        
        # 세션에 저장 (다운로드용)
        session['search_results'] = result_df.to_json()
        session['search_address'] = address
        session['search_radius'] = radius
        session['center_lat'] = center_lat
        session['center_lon'] = center_lon
        
        # 결과 페이지로 이동
        return render_template('search_results.html', 
                             apartments=result_df.to_dict('records'),
                             stats=stats,
                             address=address,
                             radius=radius,
                             center_lat=center_lat,
                             center_lon=center_lon,
                             total_count=len(result_df))
        
    except Exception as e:
        flash(f'검색 중 오류가 발생했습니다: {str(e)}', 'error')
        return redirect(url_for('index'))

@app.route('/download')
def download():
    """검색 결과 CSV 다운로드"""
    try:
        if 'search_results' not in session:
            flash('다운로드할 검색 결과가 없습니다.', 'error')
            return redirect(url_for('index'))
        
        # 세션에서 결과 복원
        result_df = pd.read_json(session['search_results'])
        address = session.get('search_address', '검색결과')
        radius = session.get('search_radius', 5)
        
        # 임시 파일 생성
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        # 주소에서 특수문자 제거 및 정리
        clean_address = address.replace(' ', '_').replace('특별시', '').replace('광역시', '').replace('시', '').replace('구', '').replace('동', '')
        filename = f"아파트검색_{clean_address}_{radius}km_{timestamp}.csv"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        # CSV 저장
        result_df.to_csv(filepath, index=False, encoding='utf-8-sig')
        
        return send_file(filepath, as_attachment=True, download_name=filename)
        
    except Exception as e:
        flash(f'다운로드 중 오류가 발생했습니다: {str(e)}', 'error')
        return redirect(url_for('index'))

if __name__ == '__main__':
    print("소재지번 기반 아파트 실거래가 검색 시스템")
    print("http://localhost:8005")
    print("사용법: 소재지번 입력 -> 반경 선택 -> 검색")
    app.run(debug=True, port=8005)