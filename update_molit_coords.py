

import json
import sqlite3
import sys
from tqdm import tqdm

def create_master_lookup(master_file_path):
    """
    Loads the master JSON file and creates two dictionaries (lookups) for
    jibun and road addresses to coordinates.
    """
    print(f"마스터 파일 로딩 중: {master_file_path}")
    jibun_to_coords = {}
    road_to_coords = {}

    try:
        with open(master_file_path, 'r', encoding='utf-8') as f:
            master_data = json.load(f)
    except FileNotFoundError:
        print(f"오류: 마스터 파일을 찾을 수 없습니다: {master_file_path}")
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"오류: 마스터 파일이 올바른 JSON 형식이 아닙니다: {master_file_path}")
        sys.exit(1)

    # The actual data is in the 'data' key
    records = master_data.get('data', [])
    if not records:
        print("오류: 마스터 파일에 'data' 키가 없거나 데이터가 비어있습니다.")
        sys.exit(1)

    for record in tqdm(records, desc="마스터 데이터 처리 중"):
        # 도로명 주소와 지번 주소 키를 확인합니다.
        # 'rdnmadr'는 도로명 주소로 확인되었습니다.
        # 'rdnmadr'는 도로명 주소, 'lnno_adres'는 지번 주소입니다.
        road_address = record.get('rdnmadr')
        jibun_address = record.get('lnno_adres')
        
        lat = record.get('la')
        lon = record.get('lo')

        if lat is not None and lon is not None:
            if road_address:
                road_to_coords[road_address] = {'lat': lat, 'lon': lon}
            if jibun_address:
                jibun_to_coords[jibun_address] = {'lat': lat, 'lon': lon}
    
    print(f"마스터 데이터 로딩 완료: 도로명 주소 {len(road_to_coords)}개, 지번 주소 {len(jibun_to_coords)}개")
    return jibun_to_coords, road_to_coords

def update_database_coordinates(db_path, jibun_lookup, road_lookup):
    """
    Updates coordinates in the SQLite database based on the master lookups.
    """
    print(f"데이터베이스 업데이트 시작: {db_path}")
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
    except sqlite3.Error as e:
        print(f"오류: 데이터베이스에 연결할 수 없습니다: {e}")
        sys.exit(1)

    # Fetch all relevant records from the database
    cursor.execute("SELECT id, jibun, road_name FROM apartment_transactions")
    rows = cursor.fetchall()

    updates_to_perform = []
    match_by_jibun = 0
    match_by_road = 0

    for row in tqdm(rows, desc="좌표 매칭 중"):
        db_id = row['id']
        db_jibun = row['jibun']
        db_road = row['road_name']
        
        coords = None
        
        # 1. 지번 주소로 먼저 매칭 시도
        if db_jibun and db_jibun in jibun_lookup:
            coords = jibun_lookup[db_jibun]
            match_by_jibun += 1
        # 2. 지번 주소 매칭 실패 시, 도로명 주소로 매칭 시도
        elif db_road and db_road in road_lookup:
            coords = road_lookup[db_road]
            match_by_road += 1
            
        if coords:
            updates_to_perform.append((
                coords['lat'],
                coords['lon'],
                'master_info',
                db_id
            ))

    print(f"매칭 결과: 지번 주소 {match_by_jibun}건, 도로명 주소 {match_by_road}건")
    
    if not updates_to_perform:
        print("업데이트할 항목이 없습니다.")
        conn.close()
        return

    print(f"총 {len(updates_to_perform)}건의 좌표를 업데이트합니다...")
    
    # Perform batch update
    update_query = """
    UPDATE apartment_transactions
    SET latitude = ?,
        longitude = ?,
        coordinate_source = ?
    WHERE id = ?
    """
    
    try:
        cursor.executemany(update_query, updates_to_perform)
        conn.commit()
        print(f"성공: {cursor.rowcount}개의 행이 업데이트되었습니다.")
    except sqlite3.Error as e:
        print(f"오류: 데이터베이스 업데이트 중 오류 발생: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    MASTER_JSON_PATH = '/Users/seongjunkim/projects/real-estate-platform/apt_master_info_20250723_161139.json'
    MOLIT_DB_PATH = '/Users/seongjunkim/projects/real-estate-platform/molit_complete_data.db'
    
    # 1. 마스터 데이터 로드
    jibun_coords, road_coords = create_master_lookup(MASTER_JSON_PATH)
    
    # 2. 데이터베이스 업데이트
    update_database_coordinates(MOLIT_DB_PATH, jibun_coords, road_coords)
    
    print("\n모든 작업이 완료되었습니다.")

