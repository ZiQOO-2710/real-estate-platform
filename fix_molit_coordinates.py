#!/usr/bin/env python3
"""
국토부 실거래가 DB에 apt_master_info의 정확한 좌표 적용
- 지번주소와 아파트명을 기반으로 매칭
- 좌표 컬럼 추가 및 업데이트
"""

import json
import sqlite3
import re
from datetime import datetime
from pathlib import Path

class MolitCoordinateFixer:
    def __init__(self, molit_db_path, apt_master_json_path):
        self.molit_db_path = molit_db_path
        self.apt_master_json_path = apt_master_json_path
        self.apt_master_data = None
        self.molit_conn = None
        
    def load_apt_master_data(self):
        """apt_master_info JSON 데이터 로드"""
        print("📂 apt_master_info 데이터 로드 중...")
        
        try:
            with open(self.apt_master_json_path, 'r', encoding='utf-8') as f:
                json_data = json.load(f)
                
            # JSON 구조 확인
            if 'data' in json_data:
                self.apt_master_data = json_data['data']
            else:
                self.apt_master_data = json_data
                
            print(f"✅ apt_master 데이터 로드 완료: {len(self.apt_master_data):,}개 레코드")
            
            # 샘플 데이터 확인
            if self.apt_master_data:
                sample = self.apt_master_data[0]
                print(f"📋 샘플 데이터 필드: {list(sample.keys())}")
                print(f"   아파트명: {sample.get('apt_nm', 'N/A')}")
                print(f"   도로명주소: {sample.get('rdnmadr', 'N/A')}")
                print(f"   지번주소: {sample.get('lnno_adres', 'N/A')}")
                print(f"   좌표: ({sample.get('lo', 'N/A')}, {sample.get('la', 'N/A')})")
            
            return True
            
        except Exception as e:
            print(f"❌ apt_master 데이터 로드 실패: {e}")
            return False
    
    def connect_molit_db(self):
        """국토부 DB 연결"""
        print("🔌 국토부 실거래가 DB 연결 중...")
        
        try:
            self.molit_conn = sqlite3.connect(self.molit_db_path)
            
            # 테이블 정보 확인
            cursor = self.molit_conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
            count = cursor.fetchone()[0]
            print(f"✅ 국토부 DB 연결 완료: {count:,}개 레코드")
            
            # 샘플 데이터 확인
            cursor.execute("""
                SELECT apartment_name, legal_dong, jibun, road_name 
                FROM apartment_transactions 
                WHERE apartment_name IS NOT NULL 
                AND length(apartment_name) > 0
                LIMIT 5
            """)
            samples = cursor.fetchall()
            
            if samples:
                print("📋 국토부 DB 샘플:")
                for sample in samples:
                    print(f"   {sample[0]} | {sample[1]} | {sample[2]} | {sample[3]}")
            else:
                print("⚠️ 샘플 데이터가 비어있음")
                
            return True
            
        except Exception as e:
            print(f"❌ 국토부 DB 연결 실패: {e}")
            return False
    
    def add_coordinate_columns(self):
        """좌표 컬럼 추가"""
        print("🏗️ 좌표 컬럼 추가 중...")
        
        try:
            cursor = self.molit_conn.cursor()
            
            # 기존 컬럼 확인
            cursor.execute("PRAGMA table_info(apartment_transactions)")
            columns = [row[1] for row in cursor.fetchall()]
            
            # 좌표 컬럼이 없으면 추가
            if 'longitude' not in columns:
                cursor.execute("ALTER TABLE apartment_transactions ADD COLUMN longitude REAL")
                print("   ✅ longitude 컬럼 추가")
                
            if 'latitude' not in columns:
                cursor.execute("ALTER TABLE apartment_transactions ADD COLUMN latitude REAL")
                print("   ✅ latitude 컬럼 추가")
                
            if 'coordinate_source' not in columns:
                cursor.execute("ALTER TABLE apartment_transactions ADD COLUMN coordinate_source TEXT")
                print("   ✅ coordinate_source 컬럼 추가")
                
            self.molit_conn.commit()
            print("🎉 좌표 컬럼 추가 완료")
            return True
            
        except Exception as e:
            print(f"❌ 좌표 컬럼 추가 실패: {e}")
            return False
    
    def normalize_apartment_name(self, name):
        """아파트명 정규화"""
        if not name:
            return ""
            
        # 공백 제거, 소문자 변환
        normalized = re.sub(r'\\s+', '', str(name)).lower()
        
        # 아파트, 빌라, 오피스텔 등 접미사 통일
        normalized = re.sub(r'(아파트|apt|빌라|villa|오피스텔|officetel)$', '', normalized)
        
        return normalized
    
    def normalize_address(self, address):
        """주소 정규화"""
        if not address:
            return ""
            
        # 공백 정규화, 번지/호수 정리
        normalized = re.sub(r'\\s+', ' ', str(address)).strip()
        normalized = re.sub(r'번지?\\s*\\d*호?', '', normalized)
        normalized = re.sub(r'\\s+', '', normalized).lower()
        
        return normalized
    
    def create_matching_index(self):
        """apt_master_data에 대한 검색 인덱스 생성"""
        print("🔍 매칭 인덱스 생성 중...")
        
        self.apt_index = {}
        
        for apt in self.apt_master_data:
            apt_name = self.normalize_apartment_name(apt.get('apt_nm', ''))
            legal_addr = self.normalize_address(apt.get('lnno_adres', ''))
            road_addr = self.normalize_address(apt.get('rdnmadr', ''))
            
            # 여러 키로 검색 가능하도록 인덱스 생성
            keys = []
            
            if apt_name:
                keys.append(apt_name)
                
            if legal_addr:
                keys.append(legal_addr)
                # 주소에서 동 정보 추출
                dong_match = re.search(r'([가-힣]+동)', apt.get('lnno_adres', ''))
                if dong_match:
                    dong = dong_match.group(1)
                    if apt_name:
                        keys.append(f"{dong}{apt_name}")
                        
            for key in keys:
                if key not in self.apt_index:
                    self.apt_index[key] = []
                self.apt_index[key].append({
                    'apt_nm': apt.get('apt_nm', ''),
                    'longitude': apt.get('lo'),
                    'latitude': apt.get('la'),
                    'legal_addr': apt.get('lnno_adres', ''),
                    'road_addr': apt.get('rdnmadr', ''),
                    'legal_dong_cd': apt.get('legaldong_cd', '')
                })
        
        print(f"✅ 매칭 인덱스 생성 완료: {len(self.apt_index):,}개 키")
        return True
    
    def find_matching_apartment(self, molit_record):
        """국토부 레코드에 매칭되는 아파트 찾기"""
        apt_name = self.normalize_apartment_name(molit_record[0])  # apartment_name
        legal_dong = molit_record[1]  # legal_dong 
        jibun = molit_record[2]       # jibun
        
        # 1순위: 아파트명 + 법정동 조합
        if apt_name and legal_dong:
            dong_key = f"{legal_dong}{apt_name}"
            if dong_key in self.apt_index:
                return self.apt_index[dong_key][0]
        
        # 2순위: 아파트명만
        if apt_name and apt_name in self.apt_index:
            candidates = self.apt_index[apt_name]
            # 법정동이 주소에 포함된 것 우선
            if legal_dong:
                for candidate in candidates:
                    if legal_dong in candidate.get('legal_addr', ''):
                        return candidate
            return candidates[0]
        
        # 3순위: 주소 기반 매칭
        if legal_dong and jibun:
            address_key = self.normalize_address(f"{legal_dong} {jibun}")
            for key, candidates in self.apt_index.items():
                for candidate in candidates:
                    candidate_addr = self.normalize_address(candidate.get('legal_addr', ''))
                    if address_key in candidate_addr or candidate_addr in address_key:
                        return candidate
        
        return None
    
    def update_coordinates(self, batch_size=10000):
        """좌표 업데이트 실행"""
        print("🎯 좌표 업데이트 시작...")
        
        cursor = self.molit_conn.cursor()
        
        # 총 레코드 수 확인
        cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
        total_count = cursor.fetchone()[0]
        
        print(f"📊 처리 대상: {total_count:,}개 레코드")
        
        matched_count = 0
        processed_count = 0
        
        # 배치 단위로 처리
        for offset in range(0, total_count, batch_size):
            print(f"📦 배치 처리: {offset+1:,} - {min(offset+batch_size, total_count):,}")
            
            # 배치 데이터 조회
            cursor.execute("""
                SELECT id, apartment_name, legal_dong, jibun
                FROM apartment_transactions 
                LIMIT ? OFFSET ?
            """, (batch_size, offset))
            
            batch_records = cursor.fetchall()
            updates = []
            
            for record in batch_records:
                record_id = record[0]
                
                # 매칭 아파트 찾기
                matched_apt = self.find_matching_apartment(record[1:])
                
                if matched_apt and matched_apt['longitude'] and matched_apt['latitude']:
                    updates.append((
                        float(matched_apt['longitude']),
                        float(matched_apt['latitude']),
                        'apt_master_info',
                        record_id
                    ))
                    matched_count += 1
                
                processed_count += 1
            
            # 배치 업데이트 실행
            if updates:
                cursor.executemany("""
                    UPDATE apartment_transactions 
                    SET longitude = ?, latitude = ?, coordinate_source = ?
                    WHERE id = ?
                """, updates)
                
                self.molit_conn.commit()
                print(f"   ✅ {len(updates):,}개 레코드 좌표 업데이트")
            
            # 진행률 표시
            progress = (processed_count / total_count) * 100
            print(f"   📈 진행률: {progress:.1f}% (매칭: {matched_count:,}개)")
        
        print(f"🎉 좌표 업데이트 완료!")
        print(f"📊 총 처리: {processed_count:,}개")
        print(f"✅ 매칭 성공: {matched_count:,}개 ({matched_count/processed_count*100:.1f}%)")
        
        return True
    
    def verify_results(self):
        """결과 검증"""
        print("🔍 결과 검증 중...")
        
        cursor = self.molit_conn.cursor()
        
        # 좌표가 업데이트된 레코드 수 확인
        cursor.execute("""
            SELECT COUNT(*) FROM apartment_transactions 
            WHERE longitude IS NOT NULL AND latitude IS NOT NULL
        """)
        updated_count = cursor.fetchone()[0]
        
        # 전체 레코드 수
        cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
        total_count = cursor.fetchone()[0]
        
        print(f"📊 전체 레코드: {total_count:,}개")
        print(f"✅ 좌표 업데이트: {updated_count:,}개 ({updated_count/total_count*100:.1f}%)")
        
        # 샘플 확인
        cursor.execute("""
            SELECT apartment_name, legal_dong, longitude, latitude, coordinate_source
            FROM apartment_transactions 
            WHERE longitude IS NOT NULL 
            LIMIT 5
        """)
        samples = cursor.fetchall()
        
        if samples:
            print("📋 업데이트된 샘플:")
            for sample in samples:
                print(f"   {sample[0]} | {sample[1]} | ({sample[2]:.6f}, {sample[3]:.6f}) | {sample[4]}")
        
        return True
    
    def run(self):
        """전체 프로세스 실행"""
        print("🚀 국토부 실거래가 좌표 수정 시작!")
        print("=" * 60)
        
        # 1. apt_master 데이터 로드
        if not self.load_apt_master_data():
            return False
        
        # 2. 국토부 DB 연결
        if not self.connect_molit_db():
            return False
        
        # 3. 좌표 컬럼 추가
        if not self.add_coordinate_columns():
            return False
        
        # 4. 매칭 인덱스 생성
        if not self.create_matching_index():
            return False
        
        # 5. 좌표 업데이트
        if not self.update_coordinates():
            return False
        
        # 6. 결과 검증
        self.verify_results()
        
        # 7. 연결 종료
        if self.molit_conn:
            self.molit_conn.close()
        
        print("\n🎉 모든 작업 완료!")
        return True

def main():
    """메인 실행 함수"""
    molit_db_path = "molit_complete_data.db"
    apt_master_json_path = "apt_master_info_20250723_161139.json"
    
    # 파일 존재 확인
    if not Path(molit_db_path).exists():
        print(f"❌ 국토부 DB 파일을 찾을 수 없습니다: {molit_db_path}")
        return
        
    if not Path(apt_master_json_path).exists():
        print(f"❌ apt_master JSON 파일을 찾을 수 없습니다: {apt_master_json_path}")
        return
    
    # 좌표 수정 실행
    fixer = MolitCoordinateFixer(molit_db_path, apt_master_json_path)
    success = fixer.run()
    
    if success:
        print("\n✅ 좌표 수정 작업 성공!")
        print("\n📋 다음 단계:")
        print("1. API에서 새로운 좌표 확인")
        print("2. 지도에서 위치 정확성 검증")
        print("3. 필요시 추가 매칭 규칙 개선")
    else:
        print("\n❌ 좌표 수정 작업 실패")

if __name__ == "__main__":
    main()