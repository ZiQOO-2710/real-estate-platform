"""
네이버 부동산 매물 중복 탐지 및 제거 모듈
동일 매물을 여러 중개사에서 올린 경우 중복 제거
"""

import re
import hashlib
from typing import List, Dict, Set, Tuple, Optional
from dataclasses import dataclass
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)

@dataclass
class ListingFingerprint:
    """매물 지문 (Fingerprint) 데이터 클래스"""
    complex_id: str
    deal_type: str
    price_amount: Optional[int]
    area_info: str  # 면적 정보 (예: "121/99m²")
    floor_info: str
    building_info: str  # 동 정보
    room_structure: str  # 방 구조
    direction: str  # 방향
    unique_key: str  # 유니크 키
    similarity_key: str  # 유사도 비교용 키

class DuplicateDetector:
    """매물 중복 탐지기"""
    
    def __init__(self, similarity_threshold=0.85):
        self.similarity_threshold = similarity_threshold
        self.seen_fingerprints: Set[str] = set()
        self.processed_listings: List[Dict] = []
        
    def extract_fingerprint(self, listing: Dict) -> ListingFingerprint:
        """매물에서 지문 정보 추출"""
        raw_text = listing.get('text', '') or listing.get('raw_text', '')
        
        # 1. 기본 정보 추출
        complex_id = listing.get('complex_id', '')
        deal_type = listing.get('deal_type', '') or self._extract_deal_type(raw_text)
        price_amount = listing.get('price_amount')
        
        # 2. 면적 정보 추출
        area_info = self._extract_area_info(raw_text)
        
        # 3. 층수 정보 추출
        floor_info = self._extract_floor_info(raw_text)
        
        # 4. 동 정보 추출
        building_info = self._extract_building_info(raw_text)
        
        # 5. 방 구조 추출
        room_structure = self._extract_room_structure(raw_text)
        
        # 6. 방향 정보 추출
        direction = self._extract_direction(raw_text)
        
        # 7. 유니크 키 생성 (정확한 매칭용)
        unique_key = self._generate_unique_key(
            complex_id, deal_type, price_amount, area_info, 
            floor_info, building_info, direction
        )
        
        # 8. 유사도 키 생성 (유사 매물 탐지용)
        similarity_key = self._generate_similarity_key(
            complex_id, deal_type, price_amount, area_info, building_info
        )
        
        return ListingFingerprint(
            complex_id=complex_id,
            deal_type=deal_type,
            price_amount=price_amount,
            area_info=area_info,
            floor_info=floor_info,
            building_info=building_info,
            room_structure=room_structure,
            direction=direction,
            unique_key=unique_key,
            similarity_key=similarity_key
        )
        
    def _extract_area_info(self, text: str) -> str:
        """면적 정보 추출 (121/99m² 형태)"""
        # "121/99m²" 또는 "121/99㎡" 형태 찾기
        area_patterns = [
            r'(\d+)/(\d+)m²',
            r'(\d+)/(\d+)㎡',
            r'(\d+\.?\d*)㎡',
            r'(\d+\.?\d*)m²',
            r'(\d+)평'
        ]
        
        for pattern in area_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
                
        return 'unknown'
        
    def _extract_floor_info(self, text: str) -> str:
        """층수 정보 추출"""
        # "1/14층" 또는 "15층" 형태
        floor_patterns = [
            r'(\d+)/(\d+)층',
            r'(\d+)층',
            r'(고층|저층|중층)'
        ]
        
        for pattern in floor_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
                
        return 'unknown'
        
    def _extract_building_info(self, text: str) -> str:
        """동 정보 추출"""
        # "601동", "605동" 등
        building_match = re.search(r'(\d+)동', text)
        if building_match:
            return building_match.group(0)
            
        return 'unknown'
        
    def _extract_room_structure(self, text: str) -> str:
        """방 구조 추출"""
        room_patterns = [
            r'(원룸|투룸|쓰리룸|방1|방2|방3|방4)',
            r'(\d+)룸',
            r'(방\d+)',
        ]
        
        for pattern in room_patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(0)
                
        return 'unknown'
        
    def _extract_direction(self, text: str) -> str:
        """방향 정보 추출"""
        directions = ['남향', '북향', '동향', '서향', '남동향', '남서향', '북동향', '북서향']
        for direction in directions:
            if direction in text:
                return direction
                
        return 'unknown'
        
    def _extract_deal_type(self, text: str) -> str:
        """거래유형 추출"""
        if '월세' in text:
            return '월세'
        elif '전세' in text:
            return '전세'
        elif '매매' in text:
            return '매매'
        return 'unknown'
        
    def _generate_unique_key(self, complex_id: str, deal_type: str, 
                           price_amount: Optional[int], area_info: str,
                           floor_info: str, building_info: str, direction: str) -> str:
        """정확한 매칭을 위한 유니크 키 생성"""
        # 주요 식별 요소들을 조합하여 유니크 키 생성
        key_components = [
            complex_id,
            deal_type,
            str(price_amount) if price_amount else 'no_price',
            area_info,
            floor_info,
            building_info,
            direction
        ]
        
        key_string = '|'.join(key_components)
        return hashlib.md5(key_string.encode('utf-8')).hexdigest()[:16]
        
    def _generate_similarity_key(self, complex_id: str, deal_type: str,
                                price_amount: Optional[int], area_info: str,
                                building_info: str) -> str:
        """유사 매물 탐지를 위한 유사도 키 생성"""
        # 층수와 방향을 제외한 핵심 요소들
        key_components = [
            complex_id,
            deal_type,
            str(price_amount) if price_amount else 'no_price',
            area_info,
            building_info
        ]
        
        key_string = '|'.join(key_components)
        return hashlib.md5(key_string.encode('utf-8')).hexdigest()[:12]
        
    def _calculate_text_similarity(self, text1: str, text2: str) -> float:
        """두 텍스트 간 유사도 계산"""
        # 특수문자 및 공백 제거 후 비교
        clean_text1 = re.sub(r'[^\w상-힣]', '', text1.lower())
        clean_text2 = re.sub(r'[^\w상-힣]', '', text2.lower())
        
        return SequenceMatcher(None, clean_text1, clean_text2).ratio()
        
    def is_duplicate(self, listing: Dict, fingerprint: ListingFingerprint) -> Tuple[bool, str]:
        """매물이 중복인지 확인"""
        # 1. 정확한 중복 확인 (unique_key 기반)
        if fingerprint.unique_key in self.seen_fingerprints:
            return True, 'exact_match'
            
        # 2. 유사 매물 확인 (similarity_key 기반)
        for processed in self.processed_listings:
            processed_fp = processed['fingerprint']
            
            # 유사도 키가 같은 경우
            if processed_fp.similarity_key == fingerprint.similarity_key:
                # 텍스트 유사도 추가 확인
                text_similarity = self._calculate_text_similarity(
                    listing.get('text', ''),
                    processed['listing'].get('text', '')
                )
                
                if text_similarity >= self.similarity_threshold:
                    return True, f'similar_match_{text_similarity:.2f}'
                    
        return False, 'unique'
        
    def add_listing(self, listing: Dict, fingerprint: ListingFingerprint) -> None:
        """매물을 처리된 목록에 추가"""
        self.seen_fingerprints.add(fingerprint.unique_key)
        self.processed_listings.append({
            'listing': listing,
            'fingerprint': fingerprint
        })
        
    def deduplicate_listings(self, listings: List[Dict]) -> Tuple[List[Dict], Dict]:
        """매물 목록에서 중복 제거"""
        unique_listings = []
        duplicate_stats = {
            'total_input': len(listings),
            'unique_count': 0,
            'duplicate_count': 0,
            'exact_matches': 0,
            'similar_matches': 0,
            'duplicate_reasons': []
        }
        
        logger.info(f"크롤링 매물 중복 제거 시작: {len(listings)}개")
        
        for i, listing in enumerate(listings):
            try:
                # 매물 지문 추출
                fingerprint = self.extract_fingerprint(listing)
                
                # 중복 확인
                is_dup, reason = self.is_duplicate(listing, fingerprint)
                
                if is_dup:
                    duplicate_stats['duplicate_count'] += 1
                    duplicate_stats['duplicate_reasons'].append(reason)
                    
                    if reason == 'exact_match':
                        duplicate_stats['exact_matches'] += 1
                    elif 'similar_match' in reason:
                        duplicate_stats['similar_matches'] += 1
                        
                    logger.debug(f"중복 매물 발견: {reason} - {fingerprint.unique_key}")
                else:
                    # 유니크 매물인 경우 추가
                    unique_listings.append(listing)
                    self.add_listing(listing, fingerprint)
                    duplicate_stats['unique_count'] += 1
                    
            except Exception as e:
                logger.warning(f"매물 처리 오류: {e} - {listing}")
                # 오류 시 유니크로 처리
                unique_listings.append(listing)
                duplicate_stats['unique_count'] += 1
                
        logger.info(f"중복 제거 완료: {duplicate_stats['unique_count']}개 유니크, {duplicate_stats['duplicate_count']}개 중복")
        
        return unique_listings, duplicate_stats
        
    def get_duplicate_report(self, duplicate_stats: Dict) -> str:
        """중복 제거 리포트 생성"""
        total = duplicate_stats['total_input']
        unique = duplicate_stats['unique_count']
        duplicates = duplicate_stats['duplicate_count']
        exact = duplicate_stats['exact_matches']
        similar = duplicate_stats['similar_matches']
        
        reduction_rate = (duplicates / total * 100) if total > 0 else 0
        
        report = f"""
🔍 매물 중복 제거 리포트
{'=' * 30}
📊 전체 매물: {total}개
✅ 유니크 매물: {unique}개
❌ 중복 매물: {duplicates}개
   - 정확한 중복: {exact}개
   - 유사 매물: {similar}개
📉 중복 제거율: {reduction_rate:.1f}%
        """
        
        return report
        
    def reset(self):
        """상태 초기화"""
        self.seen_fingerprints.clear()
        self.processed_listings.clear()

# 사용 예시 함수
def remove_duplicates_from_listings(listings: List[Dict], 
                                  similarity_threshold: float = 0.85) -> Tuple[List[Dict], str]:
    """매물 목록에서 중복 제거"""
    detector = DuplicateDetector(similarity_threshold=similarity_threshold)
    unique_listings, stats = detector.deduplicate_listings(listings)
    report = detector.get_duplicate_report(stats)
    
    return unique_listings, report

if __name__ == "__main__":
    # 테스트 코드
    sample_listings = [
        {
            'complex_id': '2592',
            'text': '정든한진6차 601동매매14억 5,000아파트121/99m², 1/14층, 동향확장특올수리',
            'price_amount': 145000,
            'deal_type': '매매'
        },
        {
            'complex_id': '2592',
            'text': '정든한진6차 601동매매14억 5,000아파트121/99m², 1/14층, 동향샷시포함확장특올수리',
            'price_amount': 145000,
            'deal_type': '매매'
        }
    ]
    
    unique, report = remove_duplicates_from_listings(sample_listings)
    print(report)
    print(f"유니크 매물: {len(unique)}개")
