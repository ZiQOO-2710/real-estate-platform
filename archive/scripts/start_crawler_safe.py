#!/usr/bin/env python3
"""
안전한 크롤러 시작 스크립트 - Windows 인코딩 문제 해결
"""

import os
import sys
import asyncio
import subprocess
from datetime import datetime

# Windows 인코딨 설정
if sys.platform == "win32":
    os.environ['PYTHONIOENCODING'] = 'utf-8'

def start_crawler():
    """크롤러를 백그라운드에서 안전하게 시작"""
    try:
        print(f"시작 시간: {datetime.now()}")
        print("전국 동단위 크롤링 시작 (VPN 백업 시스템 포함)")
        
        # 현재 디렉토리 확인
        current_dir = os.getcwd()
        print(f"작업 디렉토리: {current_dir}")
        
        # nationwide_dong_crawler.py 임포트 및 실행
        sys.path.insert(0, current_dir)
        
        # 직접 임포트해서 실행
        from nationwide_dong_crawler import NationwideDongCrawler
        
        async def run_crawler():
            crawler = NationwideDongCrawler()
            print("VPN 백업 시스템이 적용된 크롤러 초기화 완료")
            await crawler.crawl_nationwide()
        
        # 비동기 실행
        asyncio.run(run_crawler())
        
    except KeyboardInterrupt:
        print("사용자에 의해 중단됨")
    except Exception as e:
        print(f"크롤링 오류: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    start_crawler()