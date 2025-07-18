"""
주요 아파트 단지 점진적 크롤링 시스템
단계별로 범위를 확대하며 매물호가 및 단지정보 수집
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Set
import logging

from .enhanced_naver_crawler import crawl_enhanced_single
from .nationwide_crawler import NationwideCrawler
from database.simple_data_processor import process_json_file

# 로깅 설정
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MajorComplexesCrawler:
    """주요 단지 점진적 크롤링 시스템"""
    
    def __init__(self, max_concurrent=2):
        self.max_concurrent = max_concurrent
        self.nationwide_crawler = NationwideCrawler(max_concurrent=max_concurrent)
        
    def get_major_complexes_by_stage(self) -> Dict[str, List[Dict]]:
        """단계별 주요 단지 목록"""
        
        return {
            "stage1_gangnam": [
                # 강남권 초고가 단지 (시세 20억 이상)
                {"id": "1168", "name": "래미안 퍼스티지", "area": "강남구", "priority": 1},
                {"id": "1418", "name": "헬리오시티", "area": "강남구", "priority": 1},
                {"id": "2592", "name": "정든한진6차", "area": "분당구", "priority": 1},
                {"id": "4568", "name": "대치동 아이파크", "area": "강남구", "priority": 1},
                {"id": "105", "name": "타워팰리스", "area": "강남구", "priority": 1},
                {"id": "1309", "name": "아크로리버파크", "area": "강남구", "priority": 1},
                {"id": "934", "name": "대치아이파크", "area": "강남구", "priority": 1},
                {"id": "856", "name": "압구정현대", "area": "강남구", "priority": 1},
                {"id": "1205", "name": "롯데캐슬 골드", "area": "강남구", "priority": 1},
                {"id": "1876", "name": "현대아이파크", "area": "강남구", "priority": 1},
            ],
            
            "stage2_bundang_pangyo": [
                # 분당/판교 주요 단지
                {"id": "3847", "name": "분당 서현 푸르지오", "area": "분당구", "priority": 2},
                {"id": "2845", "name": "판교 알파리움", "area": "분당구", "priority": 2},
                {"id": "3921", "name": "정자 롯데캐슬", "area": "분당구", "priority": 2},
                {"id": "1734", "name": "백현마을 두산위브", "area": "분당구", "priority": 2},
                {"id": "2654", "name": "판교 푸르지오", "area": "분당구", "priority": 2},
                {"id": "3456", "name": "미금 래미안", "area": "분당구", "priority": 2},
                {"id": "4123", "name": "서현 두산위브", "area": "분당구", "priority": 2},
                {"id": "2789", "name": "수지 롯데캐슬", "area": "용인시", "priority": 2},
                {"id": "3567", "name": "동천 래미안", "area": "용인시", "priority": 2},
                {"id": "4234", "name": "판교원 힐스테이트", "area": "분당구", "priority": 2},
            ],
            
            "stage3_seoul_prime": [
                # 서울 주요 지역 (서초, 송파, 마포 등)
                {"id": "567", "name": "반포 센트럴시티", "area": "서초구", "priority": 3},
                {"id": "789", "name": "잠실 롯데캐슬", "area": "송파구", "priority": 3},
                {"id": "1023", "name": "여의도 파크원", "area": "영등포구", "priority": 3},
                {"id": "1456", "name": "서초 아크로", "area": "서초구", "priority": 3},
                {"id": "2345", "name": "송파 헬리오시티", "area": "송파구", "priority": 3},
                {"id": "3678", "name": "마포 래미안", "area": "마포구", "priority": 3},
                {"id": "4567", "name": "용산 아이파크", "area": "용산구", "priority": 3},
                {"id": "1789", "name": "목동 하이페리온", "area": "양천구", "priority": 3},
                {"id": "2890", "name": "노원 상계 롯데캐슬", "area": "노원구", "priority": 3},
                {"id": "3901", "name": "강북 미아 래미안", "area": "강북구", "priority": 3},
            ],
            
            "stage4_seoul_all": [
                # 서울 전체 확대 (중가 단지들)
                {"id": "1234", "name": "은평 뉴타운", "area": "은평구", "priority": 4},
                {"id": "2345", "name": "구로 개봉", "area": "구로구", "priority": 4},
                {"id": "3456", "name": "관악 신림", "area": "관악구", "priority": 4},
                {"id": "4567", "name": "성북 장위", "area": "성북구", "priority": 4},
                {"id": "5678", "name": "동대문 신설", "area": "동대문구", "priority": 4},
                {"id": "6789", "name": "금천 독산", "area": "금천구", "priority": 4},
                {"id": "7890", "name": "성동 왕십리", "area": "성동구", "priority": 4},
                {"id": "8901", "name": "광진 자양", "area": "광진구", "priority": 4},
                {"id": "9012", "name": "동작 상도", "area": "동작구", "priority": 4},
                {"id": "1357", "name": "중랑 면목", "area": "중랑구", "priority": 4},
            ],
            
            "stage5_metropolitan": [
                # 수도권 전체 확대
                {"id": "2468", "name": "인천 송도", "area": "연수구", "priority": 5},
                {"id": "3579", "name": "일산 라페스타", "area": "일산동구", "priority": 5},
                {"id": "4680", "name": "평촌 범계", "area": "동안구", "priority": 5},
                {"id": "5791", "name": "안양 관양", "area": "동안구", "priority": 5},
                {"id": "6802", "name": "수원 영통", "area": "영통구", "priority": 5},
                {"id": "7913", "name": "안산 중앙", "area": "단원구", "priority": 5},
                {"id": "8024", "name": "부천 중동", "area": "부천시", "priority": 5},
                {"id": "9135", "name": "구리 교문", "area": "구리시", "priority": 5},
                {"id": "1246", "name": "남양주 별내", "area": "남양주시", "priority": 5},
                {"id": "2357", "name": "하남 미사", "area": "하남시", "priority": 5},
            ]
        }
    
    async def crawl_by_stage(self, stage_name: str, max_complexes: int = None):
        """특정 단계 크롤링 실행"""
        complexes_data = self.get_major_complexes_by_stage()
        
        if stage_name not in complexes_data:
            logger.error(f"알 수 없는 단계: {stage_name}")
            return
            
        stage_complexes = complexes_data[stage_name]
        if max_complexes:
            stage_complexes = stage_complexes[:max_complexes]
            
        logger.info(f"🎯 {stage_name} 단계 크롤링 시작 ({len(stage_complexes)}개 단지)")
        
        successful_count = 0
        failed_count = 0
        
        # 단지별 크롤링 실행
        for complex_info in stage_complexes:
            try:
                logger.info(f"🏢 크롤링 시작: {complex_info['name']} (ID: {complex_info['id']})")
                
                url = f"https://new.land.naver.com/complexes/{complex_info['id']}"
                result = await crawl_enhanced_single(
                    url, 
                    complex_info['name'], 
                    headless=True
                )
                
                if result['success']:
                    # DB 저장 로직 추가
                    json_file = result['files']['json_file']
                    db_success = process_json_file(json_file, {'database': 'data/naver_real_estate.db'})
                    
                    if db_success:
                        successful_count += 1
                        logger.info(f"✅ 성공: {complex_info['name']} - 매물 {result['data_summary']['listings_count']}개 (DB 저장 완료)")
                    else:
                        failed_count += 1
                        logger.error(f"⚠️ 크롤링 성공, DB 저장 실패: {complex_info['name']}")
                else:
                    failed_count += 1
                    logger.error(f"❌ 크롤링 실패: {complex_info['name']} - {result.get('error', 'Unknown error')}")
                    
                # 요청 간격 조절
                await asyncio.sleep(5)
                
            except Exception as e:
                failed_count += 1
                logger.error(f"❌ 예외: {complex_info['name']} - {e}")
                
        # 결과 요약
        logger.info(f"\n🎉 {stage_name} 단계 크롤링 완료!")
        logger.info(f"  성공: {successful_count}개")
        logger.info(f"  실패: {failed_count}개")
        logger.info(f"  성공률: {successful_count/(successful_count+failed_count)*100:.1f}%")
        
        return {
            'stage': stage_name,
            'successful': successful_count,
            'failed': failed_count,
            'total': len(stage_complexes)
        }
    
    async def crawl_progressive(self, start_stage: str = "stage1_gangnam"):
        """점진적 단계별 크롤링"""
        stages = ["stage1_gangnam", "stage2_bundang_pangyo", "stage3_seoul_prime", 
                 "stage4_seoul_all", "stage5_metropolitan"]
        
        start_index = stages.index(start_stage) if start_stage in stages else 0
        
        logger.info(f"🚀 점진적 크롤링 시작 ({start_stage}부터)")
        
        total_results = []
        
        for stage in stages[start_index:]:
            logger.info(f"\n📍 {stage} 단계 진입")
            
            # 각 단계별 크롤링
            result = await self.crawl_by_stage(stage)
            total_results.append(result)
            
            # 단계간 대기 시간
            if stage != stages[-1]:
                wait_time = 30
                logger.info(f"⏳ 다음 단계까지 {wait_time}초 대기...")
                await asyncio.sleep(wait_time)
        
        # 전체 결과 요약
        total_successful = sum(r['successful'] for r in total_results)
        total_failed = sum(r['failed'] for r in total_results)
        total_complexes = sum(r['total'] for r in total_results)
        
        logger.info(f"\n🎊 전체 점진적 크롤링 완료!")
        logger.info(f"  총 단지: {total_complexes}개")
        logger.info(f"  성공: {total_successful}개")
        logger.info(f"  실패: {total_failed}개")
        logger.info(f"  전체 성공률: {total_successful/total_complexes*100:.1f}%")
        
        return total_results

# 실행 함수들
async def crawl_stage1_gangnam():
    """1단계: 강남권 초고가 단지 크롤링"""
    crawler = MajorComplexesCrawler(max_concurrent=2)
    return await crawler.crawl_by_stage("stage1_gangnam")

async def crawl_stage2_bundang():
    """2단계: 분당/판교 주요 단지 크롤링"""
    crawler = MajorComplexesCrawler(max_concurrent=2)
    return await crawler.crawl_by_stage("stage2_bundang_pangyo")

async def crawl_all_progressive():
    """전체 점진적 크롤링"""
    crawler = MajorComplexesCrawler(max_concurrent=2)
    return await crawler.crawl_progressive()

if __name__ == "__main__":
    # 1단계부터 시작
    asyncio.run(crawl_stage1_gangnam())