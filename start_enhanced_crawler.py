#!/usr/bin/env python3
"""
개선된 크롤러 백그라운드 실행기
"""

import subprocess
import sys
import os
from datetime import datetime

def start_enhanced_crawler():
    """개선된 크롤러를 백그라운드로 시작"""
    try:
        print(f"[{datetime.now()}] Enhanced Nationwide Crawler 백그라운드 시작...")
        
        # Windows에서 백그라운드 실행
        if sys.platform == "win32":
            process = subprocess.Popen(
                [sys.executable, "enhanced_nationwide_crawler.py"],
                stdout=open("enhanced_crawling.log", "w", encoding="utf-8"),
                stderr=open("enhanced_crawling_error.log", "w", encoding="utf-8"),
                creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
            )
        else:
            process = subprocess.Popen(
                [sys.executable, "enhanced_nationwide_crawler.py"],
                stdout=open("enhanced_crawling.log", "w", encoding="utf-8"),
                stderr=open("enhanced_crawling_error.log", "w", encoding="utf-8")
            )
        
        print(f"Enhanced Crawler 프로세스 시작됨 - PID: {process.pid}")
        print(f"로그 파일: enhanced_crawling.log")
        print(f"에러 로그: enhanced_crawling_error.log")
        print("크롤링 진행 상황은 로그 파일에서 확인하세요.")
        
        return process.pid
        
    except Exception as e:
        print(f"백그라운드 실행 오류: {e}")
        return None

if __name__ == "__main__":
    start_enhanced_crawler()