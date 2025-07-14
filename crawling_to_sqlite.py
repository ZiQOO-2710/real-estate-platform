#!/usr/bin/env python3
"""
부동산 크롤링 후 SQLite 로컬 저장
나중에 Supabase로 이전 용이하도록 동일한 스키마 사용
"""

import asyncio
import sys
import os
import sqlite3
import json
from datetime import datetime

sys.path.append('/home/ksj27/projects/real-estate-platform/modules/naver-crawler')

from core.crawler import NaverRealEstateCrawler

class CrawlerWithSQLite:
    def __init__(self, db_path="real_estate_crawling.db"):
        self.db_path = db_path
        self.init_database()
        
        # 진행상황 파일
        self.progress_file = "crawling_progress.json"
        
    def init_database(self):
        """SQLite 데이터베이스 및 테이블 초기화 (Supabase 스키마와 동일)"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Supabase와 동일한 스키마로 테이블 생성
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS apartment_complexes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                complex_id TEXT UNIQUE NOT NULL,
                complex_name TEXT NOT NULL,
                address_road TEXT,
                city TEXT,
                gu TEXT,
                latitude REAL,
                longitude REAL,
                total_units INTEGER,
                construction_year INTEGER,
                last_transaction_price INTEGER,
                source_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
        print(f"✅ SQLite DB 초기화 완료: {self.db_path}")
    
    def convert_apartment_to_db_format(self, apt, region_name):
        """아파트 데이터를 DB 형식으로 변환 (기존 로직과 동일)"""
        
        # 평균 가격 계산
        avg_price = None
        if apt.min_deal_price and apt.max_deal_price:
            avg_price = (apt.min_deal_price + apt.max_deal_price) // 2
        elif apt.min_deal_price:
            avg_price = apt.min_deal_price
        elif apt.max_deal_price:
            avg_price = apt.max_deal_price
        
        # 건축년도 추출 (201305 -> 2013)
        construction_year = None
        if apt.completion_year_month:
            try:
                year_str = str(apt.completion_year_month)[:4]
                construction_year = int(year_str)
            except:
                pass
        
        # 지역 정보 파싱
        city, gu = region_name.split('_') if '_' in region_name else (region_name, '')
        
        return {
            'complex_id': f"naver_{apt.complex_no}" if apt.complex_no else f"naver_unknown_{id(apt)}",
            'complex_name': apt.complex_name or '이름없음',
            'address_road': apt.address or '',
            'city': city,
            'gu': gu,
            'latitude': apt.latitude,
            'longitude': apt.longitude,
            'total_units': apt.total_household_count,
            'construction_year': construction_year,
            'last_transaction_price': avg_price,
            'source_url': f"https://new.land.naver.com/complexes/{apt.complex_no}" if apt.complex_no else ""
        }
    
    def save_to_sqlite(self, apartment_data):
        """SQLite에 아파트 데이터 저장 (UPSERT)"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # UPSERT (INSERT OR REPLACE)
            cursor.execute('''
                INSERT OR REPLACE INTO apartment_complexes 
                (complex_id, complex_name, address_road, city, gu, latitude, longitude, 
                 total_units, construction_year, last_transaction_price, source_url, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ''', (
                apartment_data['complex_id'],
                apartment_data['complex_name'],
                apartment_data['address_road'],
                apartment_data['city'],
                apartment_data['gu'],
                apartment_data['latitude'],
                apartment_data['longitude'],
                apartment_data['total_units'],
                apartment_data['construction_year'],
                apartment_data['last_transaction_price'],
                apartment_data['source_url']
            ))
            
            conn.commit()
            return True
            
        except Exception as e:
            print(f"⚠️ SQLite 저장 오류: {e}")
            return False
        finally:
            conn.close()
    
    def load_progress(self):
        """진행상황 로드"""
        try:
            with open(self.progress_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"completed_regions": [], "last_update": ""}
    
    def save_progress(self, completed_regions):
        """진행상황 저장"""
        progress = {
            "completed_regions": completed_regions,
            "last_update": datetime.now().isoformat()
        }
        with open(self.progress_file, 'w', encoding='utf-8') as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)
    
    def is_region_completed(self, region_name):
        """지역이 이미 완료되었는지 확인"""
        progress = self.load_progress()
        return region_name in progress.get("completed_regions", [])
    
    async def crawl_and_save_region(self, city, district, trade_type='매매'):
        """지역 크롤링 후 SQLite 저장"""
        region_name = f"{city}_{district}"
        
        # 이미 완료된 지역 스킵
        if self.is_region_completed(region_name):
            print(f"⏭️ {region_name} 이미 완료됨, 스킵")
            return 0
        
        print(f"🏗️ {city} {district} {trade_type} 크롤링 시작...")
        
        async with NaverRealEstateCrawler() as crawler:
            try:
                # 크롤링 실행
                apartments = await crawler.get_apartments(city, district, trade_type)
                print(f"✅ 크롤링 완료: {len(apartments)}개 아파트")
                
                if not apartments:
                    print("⚠️ 수집된 데이터가 없습니다.")
                    return 0
                
                # SQLite 저장
                saved_count = 0
                
                for apt in apartments:
                    try:
                        db_data = self.convert_apartment_to_db_format(apt, region_name)
                        
                        if self.save_to_sqlite(db_data):
                            saved_count += 1
                        
                        if saved_count % 50 == 0:
                            print(f"📤 진행률: {saved_count}/{len(apartments)}")
                            
                    except Exception as e:
                        print(f"⚠️ 개별 저장 오류: {e}")
                        continue
                
                # 진행상황 업데이트
                progress = self.load_progress()
                progress["completed_regions"].append(region_name)
                self.save_progress(progress["completed_regions"])
                
                print(f"🎉 SQLite 저장 완료: {saved_count}/{len(apartments)}개")
                return saved_count
                
            except Exception as e:
                print(f"❌ 크롤링 오류: {e}")
                return 0
    
    async def crawl_all_regions(self):
        """전국 크롤링"""
        
        # 전국 모든 지역 목록
        regions = [
            # 서울특별시 (25개구)
            ("서울", "강남구"), ("서울", "강동구"), ("서울", "강북구"), ("서울", "강서구"),
            ("서울", "관악구"), ("서울", "광진구"), ("서울", "구로구"), ("서울", "금천구"),
            ("서울", "노원구"), ("서울", "도봉구"), ("서울", "동대문구"), ("서울", "동작구"),
            ("서울", "마포구"), ("서울", "서대문구"), ("서울", "서초구"), ("서울", "성동구"),
            ("서울", "성북구"), ("서울", "송파구"), ("서울", "양천구"), ("서울", "영등포구"),
            ("서울", "용산구"), ("서울", "은평구"), ("서울", "종로구"), ("서울", "중구"),
            ("서울", "중랑구"),
            
            # 부산광역시 (16개구군)
            ("부산", "중구"), ("부산", "서구"), ("부산", "동구"), ("부산", "영도구"),
            ("부산", "부산진구"), ("부산", "동래구"), ("부산", "남구"), ("부산", "북구"),
            ("부산", "해운대구"), ("부산", "사하구"), ("부산", "금정구"), ("부산", "강서구"),
            ("부산", "연제구"), ("부산", "수영구"), ("부산", "사상구"), ("부산", "기장군"),
            
            # 대구광역시 (8개구군)
            ("대구", "중구"), ("대구", "동구"), ("대구", "서구"), ("대구", "남구"),
            ("대구", "북구"), ("대구", "수성구"), ("대구", "달서구"), ("대구", "달성군"),
            
            # 인천광역시 (10개구군)
            ("인천", "중구"), ("인천", "동구"), ("인천", "미추홀구"), ("인천", "연수구"),
            ("인천", "남동구"), ("인천", "부평구"), ("인천", "계양구"), ("인천", "서구"),
            ("인천", "강화군"), ("인천", "옹진군"),
            
            # 광주광역시 (5개구)
            ("광주", "동구"), ("광주", "서구"), ("광주", "남구"), ("광주", "북구"), ("광주", "광산구"),
            
            # 대전광역시 (5개구)
            ("대전", "동구"), ("대전", "중구"), ("대전", "서구"), ("대전", "유성구"), ("대전", "대덕구"),
            
            # 울산광역시 (5개구군)
            ("울산", "중구"), ("울산", "남구"), ("울산", "동구"), ("울산", "북구"), ("울산", "울주군"),
            
            # 세종특별자치시 (1개시)
            ("세종", "세종시"),
            
            # 경기도 (31개시군)
            ("경기", "수원시"), ("경기", "성남시"), ("경기", "고양시"), ("경기", "용인시"),
            ("경기", "부천시"), ("경기", "안산시"), ("경기", "안양시"), ("경기", "남양주시"),
            ("경기", "화성시"), ("경기", "평택시"), ("경기", "의정부시"), ("경기", "시흥시"),
            ("경기", "파주시"), ("경기", "김포시"), ("경기", "광명시"), ("경기", "광주시"),
            ("경기", "군포시"), ("경기", "하남시"), ("경기", "오산시"), ("경기", "이천시"),
            ("경기", "안성시"), ("경기", "의왕시"), ("경기", "양평군"), ("경기", "여주시"),
            ("경기", "과천시"), ("경기", "구리시"), ("경기", "양주시"), ("경기", "포천시"),
            ("경기", "동두천시"), ("경기", "가평군"), ("경기", "연천군"),
            
            # 강원도 (18개시군)
            ("강원", "춘천시"), ("강원", "원주시"), ("강원", "강릉시"), ("강원", "동해시"),
            ("강원", "태백시"), ("강원", "속초시"), ("강원", "삼척시"), ("강원", "홍천군"),
            ("강원", "횡성군"), ("강원", "영월군"), ("강원", "평창군"), ("강원", "정선군"),
            ("강원", "철원군"), ("강원", "화천군"), ("강원", "양구군"), ("강원", "인제군"),
            ("강원", "고성군"), ("강원", "양양군"),
            
            # 충청북도 (11개시군)
            ("충북", "청주시"), ("충북", "충주시"), ("충북", "제천시"), ("충북", "보은군"),
            ("충북", "옥천군"), ("충북", "영동군"), ("충북", "증평군"), ("충북", "진천군"),
            ("충북", "괴산군"), ("충북", "음성군"), ("충북", "단양군"),
            
            # 충청남도 (15개시군)
            ("충남", "천안시"), ("충남", "공주시"), ("충남", "보령시"), ("충남", "아산시"),
            ("충남", "서산시"), ("충남", "논산시"), ("충남", "계룡시"), ("충남", "당진시"),
            ("충남", "금산군"), ("충남", "부여군"), ("충남", "서천군"), ("충남", "청양군"),
            ("충남", "홍성군"), ("충남", "예산군"), ("충남", "태안군"),
            
            # 전라북도 (14개시군)
            ("전북", "전주시"), ("전북", "군산시"), ("전북", "익산시"), ("전북", "정읍시"),
            ("전북", "남원시"), ("전북", "김제시"), ("전북", "완주군"), ("전북", "진안군"),
            ("전북", "무주군"), ("전북", "장수군"), ("전북", "임실군"), ("전북", "순창군"),
            ("전북", "고창군"), ("전북", "부안군"),
            
            # 전라남도 (22개시군)
            ("전남", "목포시"), ("전남", "여수시"), ("전남", "순천시"), ("전남", "나주시"),
            ("전남", "광양시"), ("전남", "담양군"), ("전남", "곡성군"), ("전남", "구례군"),
            ("전남", "고흥군"), ("전남", "보성군"), ("전남", "화순군"), ("전남", "장흥군"),
            ("전남", "강진군"), ("전남", "해남군"), ("전남", "영암군"), ("전남", "무안군"),
            ("전남", "함평군"), ("전남", "영광군"), ("전남", "장성군"), ("전남", "완도군"),
            ("전남", "진도군"), ("전남", "신안군"),
            
            # 경상북도 (23개시군)
            ("경북", "포항시"), ("경북", "경주시"), ("경북", "김천시"), ("경북", "안동시"),
            ("경북", "구미시"), ("경북", "영주시"), ("경북", "영천시"), ("경북", "상주시"),
            ("경북", "문경시"), ("경북", "경산시"), ("경북", "군위군"), ("경북", "의성군"),
            ("경북", "청송군"), ("경북", "영양군"), ("경북", "영덕군"), ("경북", "청도군"),
            ("경북", "고령군"), ("경북", "성주군"), ("경북", "칠곡군"), ("경북", "예천군"),
            ("경북", "봉화군"), ("경북", "울진군"), ("경북", "울릉군"),
            
            # 경상남도 (18개시군)
            ("경남", "창원시"), ("경남", "진주시"), ("경남", "통영시"), ("경남", "사천시"),
            ("경남", "김해시"), ("경남", "밀양시"), ("경남", "거제시"), ("경남", "양산시"),
            ("경남", "의령군"), ("경남", "함안군"), ("경남", "창녕군"), ("경남", "고성군"),
            ("경남", "남해군"), ("경남", "하동군"), ("경남", "산청군"), ("경남", "함양군"),
            ("경남", "거창군"), ("경남", "합천군"),
            
            # 제주특별자치도 (2개시)
            ("제주", "제주시"), ("제주", "서귀포시"),
        ]
        
        print(f"🏙️ 전국 {len(regions)}개 지역 크롤링 시작")
        print(f"💾 SQLite 저장: {self.db_path}")
        print("=" * 50)
        
        total_saved = 0
        
        for i, (city, district) in enumerate(regions, 1):
            print(f"\n[{i}/{len(regions)}] {city} {district}")
            
            try:
                saved = await self.crawl_and_save_region(city, district)
                total_saved += saved
                
                # IP 차단 방지를 위한 대기 (10-15초 랜덤)
                import random
                delay = random.randint(10, 15)
                print(f"⏱️ {delay}초 대기... (IP 차단 방지)")
                await asyncio.sleep(delay)
                
            except Exception as e:
                print(f"❌ {city} {district} 크롤링 실패: {e}")
                continue
        
        print(f"\n🎉 전체 크롤링 완료!")
        print(f"📊 총 저장된 아파트: {total_saved}개")
        print(f"💾 SQLite 파일: {self.db_path}")
        
        return total_saved

async def main():
    print("🚀 전국 부동산 크롤링 + SQLite 저장 시작!")
    print(f"📅 시작 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)
    
    crawler_sqlite = CrawlerWithSQLite()
    
    try:
        # 전국 크롤링 실행
        total_saved = await crawler_sqlite.crawl_all_regions()
        
        print(f"\n🎉 전국 크롤링 완료!")
        print(f"📅 종료 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📈 최종 결과: {total_saved}개 아파트 SQLite 저장 완료")
        
    except KeyboardInterrupt:
        print("\n⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        print(f"\n❌ 크롤링 중 오류 발생: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())