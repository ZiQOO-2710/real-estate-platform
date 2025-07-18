#!/usr/bin/env python3
"""
🚀 전국 아파트 단지 종합 크롤러 시작 스크립트
- 환경 검증 및 크롤러 실행
"""

import asyncio
import sys
import os
import subprocess
import logging
from pathlib import Path

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def check_environment():
    """실행 환경 검증"""
    logger.info("🔍 실행 환경 검증 중...")
    
    # Python 버전 확인
    python_version = sys.version_info
    if python_version.major < 3 or (python_version.major == 3 and python_version.minor < 8):
        logger.error("❌ Python 3.8 이상이 필요합니다")
        return False
    
    logger.info(f"✅ Python {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    # 필수 모듈 확인
    required_modules = [
        'playwright',
        'sqlite3',
        'aiohttp',
        'asyncio'
    ]
    
    missing_modules = []
    for module in required_modules:
        try:
            __import__(module)
            logger.info(f"✅ {module} 모듈 확인")
        except ImportError:
            missing_modules.append(module)
            logger.error(f"❌ {module} 모듈 없음")
    
    if missing_modules:
        logger.error(f"❌ 누락된 모듈: {', '.join(missing_modules)}")
        logger.info("💡 설치 명령: pip install playwright aiohttp")
        return False
    
    # Playwright 브라우저 확인
    try:
        result = subprocess.run(
            ['playwright', 'install', 'chromium'],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode == 0:
            logger.info("✅ Playwright 브라우저 설치/확인 완료")
        else:
            logger.warning("⚠️ Playwright 브라우저 설치 중 경고")
    except Exception as e:
        logger.warning(f"⚠️ Playwright 브라우저 확인 실패: {e}")
    
    # VPN 도구 확인
    vpn_tools = []
    
    # WARP CLI 확인
    try:
        result = subprocess.run(['warp-cli', '--version'], capture_output=True, timeout=5)
        if result.returncode == 0:
            vpn_tools.append("WARP")
            logger.info("✅ WARP CLI 확인")
        else:
            logger.warning("⚠️ WARP CLI 없음")
    except:
        logger.warning("⚠️ WARP CLI 없음")
    
    # NordVPN CLI 확인
    try:
        result = subprocess.run(['nordvpn', '--version'], capture_output=True, timeout=5)
        if result.returncode == 0:
            vpn_tools.append("NordVPN")
            logger.info("✅ NordVPN CLI 확인")
        else:
            logger.warning("⚠️ NordVPN CLI 없음")
    except:
        logger.warning("⚠️ NordVPN CLI 없음")
    
    if not vpn_tools:
        logger.warning("⚠️ VPN 도구가 설치되어 있지 않습니다")
        logger.info("💡 WARP 설치: https://1.1.1.1/")
        logger.info("💡 NordVPN 설치: https://nordvpn.com/download/")
        
        logger.info("VPN 없이 진행합니다")
    
    # 디스크 공간 확인
    disk_usage = os.statvfs('.') if hasattr(os, 'statvfs') else None
    if disk_usage:
        free_space_gb = (disk_usage.f_frsize * disk_usage.f_bavail) / (1024**3)
        logger.info(f"💾 사용 가능한 디스크 공간: {free_space_gb:.1f}GB")
        
        if free_space_gb < 5:
            logger.warning("⚠️ 디스크 공간이 부족할 수 있습니다 (5GB 이상 권장)")
    
    logger.info("✅ 환경 검증 완료")
    return True

async def start_crawler():
    """크롤러 시작"""
    logger.info("🚀 전국 아파트 단지 종합 크롤러 시작!")
    
    try:
        # 환경 검증
        if not await check_environment():
            logger.error("❌ 환경 검증 실패")
            return
        
        # 크롤러 임포트 및 실행
        sys.path.append(str(Path(__file__).parent))
        from comprehensive_nationwide_crawler import ComprehensiveNationwideCrawler
        
        crawler = ComprehensiveNationwideCrawler()
        
        logger.info("\n" + "="*60)
        logger.info("🌍 전국 아파트 단지 종합 크롤링 시작")
        logger.info("📋 수집 대상:")
        logger.info("  - 전국 17개 시도")
        logger.info("  - 모든 아파트 단지")
        logger.info("  - 매매/전세/월세 매물")
        logger.info("  - VPN 로테이션 지원")
        logger.info("="*60)
        
        # 크롤링 자동 시작
        logger.info("크롤링을 시작합니다...")
        
        # 크롤러 초기화 및 실행
        await crawler.init_crawler()
        await crawler.start_comprehensive_crawling()
        
    except KeyboardInterrupt:
        logger.info("\n⏹️ 사용자에 의해 중단됨")
    except Exception as e:
        logger.error(f"❌ 크롤러 실행 중 오류: {e}")
        import traceback
        traceback.print_exc()

def main():
    """메인 함수"""
    print("전국 아파트 단지 종합 크롤러 v2.0")
    print("="*50)
    
    try:
        asyncio.run(start_crawler())
    except Exception as e:
        logger.error(f"시작 실패: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()