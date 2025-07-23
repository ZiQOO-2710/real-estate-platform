#!/usr/bin/env python3
"""
국토부 실거래가 DB 좌표 수정 v2
- api_data JSON에서 아파트 정보 추출
- apt_master_info와 매칭하여 정확한 좌표 적용
"""

import json
import sqlite3
import re
from datetime import datetime
from pathlib import Path

class MolitCoordinateFixerV2:
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
                
            if 'data' in json_data:
                self.apt_master_data = json_data['data']
            else:
                self.apt_master_data = json_data
                
            print(f"✅ apt_master 데이터 로드 완료: {len(self.apt_master_data):,}개 레코드")
            return True
            
        except Exception as e:
            print(f"❌ apt_master 데이터 로드 실패: {e}")
            return False
    
    def connect_molit_db(self):
        """국토부 DB 연결"""
        print("🔌 국토부 실거래가 DB 연결 중...")
        
        try:
            self.molit_conn = sqlite3.connect(self.molit_db_path)
            cursor = self.molit_conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM apartment_transactions")
            count = cursor.fetchone()[0]
            print(f"✅ 국토부 DB 연결 완료: {count:,}개 레코드")
            return True
            
        except Exception as e:
            print(f"❌ 국토부 DB 연결 실패: {e}")
            return False
    
    def normalize_apartment_name(self, name):
        """아파트명 정규화"""
        if not name:
            return ""
            
        # 기본 정리
        normalized = str(name).strip()
        
        # 괄호 내용 제거 (1동, 2차 등)
        normalized = re.sub(r'\\([^)]*\\)', '', normalized)
        
        # 공백 제거
        normalized = re.sub(r'\\s+', '', normalized)
        
        # 아파트, 빌라 등 접미사 제거
        normalized = re.sub(r'(아파트|아파트힐스|힐스|아파트빌|빌|apt|villa|빌라|오피스텔|officetel|타워|tower)$', '', normalized, flags=re.IGNORECASE)
        
        # 숫자 단지 정리
        normalized = re.sub(r'(\\d+)단지$', r'\\1', normalized)
        
        return normalized.lower()
    
    def create_apt_master_index(self):
        """apt_master 검색 인덱스 생성"""
        print("🔍 apt_master 검색 인덱스 생성 중...")
        
        self.apt_index = {}
        
        for apt in self.apt_master_data:
            apt_name = apt.get('apt_nm', '')
            normalized_name = self.normalize_apartment_name(apt_name)
            
            if normalized_name:
                if normalized_name not in self.apt_index:
                    self.apt_index[normalized_name] = []
                    
                self.apt_index[normalized_name].append({
                    'original_name': apt_name,
                    'longitude': apt.get('lo'),
                    'latitude': apt.get('la'),
                    'legal_addr': apt.get('lnno_adres', ''),
                    'road_addr': apt.get('rdnmadr', ''),
                    'legal_dong_cd': apt.get('legaldong_cd', '')
                })
        
        print(f"✅ 검색 인덱스 생성 완료: {len(self.apt_index):,}개 아파트명")
        
        # 인덱스 샘플 확인
        sample_keys = list(self.apt_index.keys())[:5]
        print("📋 인덱스 샘플:")
        for key in sample_keys:
            count = len(self.apt_index[key])
            sample_apt = self.apt_index[key][0]
            print(f"   '{key}' -> {sample_apt['original_name']} ({count}개 후보)")
        
        return True
    
    def extract_apartment_info_from_api(self, api_data_str):
        """API 데이터에서 아파트 정보 추출"""
        try:
            api_data = json.loads(api_data_str)
            
            apt_name = api_data.get('aptNm', '')
            legal_dong = api_data.get('umdNm', '')  # 읍면동명
            jibun = f"{api_data.get('bonbun', '')}-{api_data.get('bubun', '')}"
            road_name = api_data.get('roadNm', '')
            
            return {
                'apt_name': apt_name,
                'legal_dong': legal_dong,
                'jibun': jibun,
                'road_name': road_name,
                'full_api': api_data
            }
            
        except Exception as e:
            return None
    
    def find_matching_apartment(self, molit_info):
        """매칭되는 아파트 찾기"""
        apt_name = molit_info.get('apt_name', '')
        normalized_name = self.normalize_apartment_name(apt_name)
        
        # 직접 매칭
        if normalized_name in self.apt_index:
            candidates = self.apt_index[normalized_name]
            
            # 지역 정보가 있으면 더 정확한 매칭
            legal_dong = molit_info.get('legal_dong', '')
            if legal_dong and len(candidates) > 1:
                for candidate in candidates:
                    legal_addr = candidate.get('legal_addr') or ''
                    if legal_dong in legal_addr:
                        return candidate
            
            # 첫 번째 후보 반환
            return candidates[0]
        
        # 부분 매칭 시도
        if len(normalized_name) > 3:  # 너무 짧은 이름은 제외
            for indexed_name, candidates in self.apt_index.items():
                # 포함 관계 확인
                if normalized_name in indexed_name or indexed_name in normalized_name:
                    return candidates[0]
        
        return None
    
    def update_coordinates_from_api(self, batch_size=5000):
        """API 데이터를 기반으로 좌표 업데이트"""
        print("🎯 API 데이터 기반 좌표 업데이트 시작...")
        
        cursor = self.molit_conn.cursor()
        
        # API 데이터가 있는 레코드 수 확인
        cursor.execute("""
            SELECT COUNT(*) FROM apartment_transactions 
            WHERE api_data IS NOT NULL AND api_data != ''
        """)
        total_count = cursor.fetchone()[0]
        print(f"📊 API 데이터가 있는 레코드: {total_count:,}개")
        
        matched_count = 0
        processed_count = 0
        
        # 배치 단위로 처리
        for offset in range(0, total_count, batch_size):
            print(f"📦 배치 처리: {offset+1:,} - {min(offset+batch_size, total_count):,}")
            
            # 배치 데이터 조회
            cursor.execute("""
                SELECT id, api_data
                FROM apartment_transactions 
                WHERE api_data IS NOT NULL AND api_data != ''
                LIMIT ? OFFSET ?
            """, (batch_size, offset))
            
            batch_records = cursor.fetchall()
            updates = []
            
            for record in batch_records:
                record_id = record[0]
                api_data_str = record[1]
                
                # API 데이터에서 아파트 정보 추출
                molit_info = self.extract_apartment_info_from_api(api_data_str)
                
                if molit_info:
                    # 매칭 아파트 찾기
                    matched_apt = self.find_matching_apartment(molit_info)
                    
                    if matched_apt and matched_apt['longitude'] and matched_apt['latitude']:
                        try:
                            updates.append((
                                float(matched_apt['longitude']),
                                float(matched_apt['latitude']),
                                'apt_master_info',
                                molit_info['apt_name'],  # 원본 아파트명도 저장
                                record_id
                            ))
                            matched_count += 1
                        except ValueError:
                            continue  # 좌표 변환 실패시 건너뛰기
                
                processed_count += 1
            
            # 배치 업데이트 실행
            if updates:
                # apartment_name 컬럼도 함께 업데이트
                cursor.executemany("""
                    UPDATE apartment_transactions 
                    SET longitude = ?, latitude = ?, coordinate_source = ?, apartment_name = ?
                    WHERE id = ?
                """, updates)
                
                self.molit_conn.commit()
                print(f"   ✅ {len(updates):,}개 레코드 좌표 업데이트")
            
            # 진행률 표시
            progress = (processed_count / total_count) * 100
            match_rate = (matched_count / processed_count) * 100 if processed_count > 0 else 0
            print(f"   📈 진행률: {progress:.1f}% (매칭률: {match_rate:.1f}%)")
        
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
        
        # 매칭된 아파트명 샘플 확인
        cursor.execute("""
            SELECT apartment_name, longitude, latitude, coordinate_source
            FROM apartment_transactions 
            WHERE longitude IS NOT NULL 
            LIMIT 10
        """)
        samples = cursor.fetchall()
        
        if samples:
            print("📋 업데이트된 샘플:")
            for sample in samples:
                print(f"   {sample[0]} | ({sample[1]:.6f}, {sample[2]:.6f}) | {sample[3]}")
        
        # 매칭률 높은 아파트 확인
        cursor.execute("""
            SELECT apartment_name, COUNT(*) as count
            FROM apartment_transactions 
            WHERE longitude IS NOT NULL 
            GROUP BY apartment_name 
            ORDER BY count DESC 
            LIMIT 5
        """)
        top_matched = cursor.fetchall()
        
        if top_matched:
            print("\n🏆 매칭 건수가 많은 아파트:")
            for apt, count in top_matched:
                print(f"   {apt}: {count:,}건")
        
        return True
    
    def run(self):
        """전체 프로세스 실행"""
        print("🚀 국토부 실거래가 좌표 수정 v2 시작!")
        print("=" * 60)
        
        # 1. apt_master 데이터 로드
        if not self.load_apt_master_data():
            return False
        
        # 2. 국토부 DB 연결
        if not self.connect_molit_db():
            return False
        
        # 3. apt_master 인덱스 생성
        if not self.create_apt_master_index():
            return False
        
        # 4. 좌표 업데이트
        if not self.update_coordinates_from_api():
            return False
        
        # 5. 결과 검증
        self.verify_results()
        
        # 6. 연결 종료
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
    fixer = MolitCoordinateFixerV2(molit_db_path, apt_master_json_path)
    success = fixer.run()
    
    if success:
        print("\n✅ 좌표 수정 작업 성공!")
        print("\n📋 다음 단계:")
        print("1. API에서 새로운 좌표 확인")
        print("2. 지도에서 위치 정확성 검증")
        print("3. 매칭률 개선 방안 검토")
    else:
        print("\n❌ 좌표 수정 작업 실패")

if __name__ == "__main__":
    main()