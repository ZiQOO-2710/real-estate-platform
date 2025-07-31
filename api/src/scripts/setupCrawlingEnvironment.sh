#!/bin/bash

echo "🚀 크롤링 환경 설정 시작"
echo "============================="

echo "📡 1단계: Cloudflare WARP 설치 확인"
if command -v warp-cli &> /dev/null; then
    echo "✅ WARP CLI 이미 설치됨"
    warp-cli status
else
    echo "❌ WARP CLI 설치 필요"
    echo "다음 명령어로 설치하세요:"
    echo "brew install cloudflare-warp"
    echo ""
    echo "또는 다음 링크에서 앱 다운로드:"
    echo "https://1.1.1.1/"
fi

echo ""
echo "🔒 2단계: NordVPN 설치 확인"
if command -v nordvpn &> /dev/null; then
    echo "✅ NordVPN CLI 이미 설치됨"
    nordvpn status
else
    echo "❌ NordVPN CLI 설치 필요"
    echo "다음 명령어로 설치하세요:"
    echo "brew install --cask nordvpn"
fi

echo ""
echo "🐍 3단계: Python 크롤링 환경 확인"
cd /Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler
if [ -f "requirements.txt" ]; then
    echo "📦 Python 패키지 설치 확인 중..."
    pip install -r requirements.txt
    echo "✅ Python 환경 준비 완료"
else
    echo "❌ requirements.txt 파일을 찾을 수 없습니다"
fi

echo ""
echo "🌐 4단계: Playwright 브라우저 확인"
playwright install chromium
echo "✅ Chromium 브라우저 준비 완료"

echo ""
echo "📁 5단계: 로그 디렉토리 생성"
mkdir -p /Users/seongjunkim/projects/real-estate-platform/api/logs/crawling
mkdir -p /Users/seongjunkim/projects/real-estate-platform/api/logs/vpn
echo "✅ 로그 디렉토리 생성 완료"

echo ""
echo "🎉 크롤링 환경 설정 완료!"
echo "============================="