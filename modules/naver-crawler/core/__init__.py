"""
네이버 부동산 크롤링 모듈
다른 프로젝트에서 쉽게 사용할 수 있는 모듈화된 크롤러

사용 예시:
    from naver_real_estate_module import NaverRealEstateCrawler
    
    crawler = NaverRealEstateCrawler()
    apartments = await crawler.get_apartments("서울", "강남구", trade_type="매매")
"""

from .enhanced_naver_crawler import EnhancedNaverCrawler, crawl_enhanced_single
from .duplicate_detector import DuplicateDetector, remove_duplicates_from_listings
from .full_scale_crawler import FullScaleCrawler

__version__ = "1.0.0"
__author__ = "Claude"
__all__ = [
    "EnhancedNaverCrawler",
    "crawl_enhanced_single",
    "DuplicateDetector",
    "remove_duplicates_from_listings",
    "FullScaleCrawler"
]