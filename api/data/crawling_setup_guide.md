# VPN 멀티레이어 크롤링 환경 설정 가이드

## 🔧 현재 상황
- Homebrew가 설치되지 않음 (sudo 권한 필요)
- VPN 도구들 설치 필요
- Python 크롤링 환경 점검 필요

## 📋 수동 설정 단계

### 1단계: Homebrew 설치 (필수)
```bash
# 터미널에서 실행 (암호 입력 필요)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2단계: VPN 도구 설치

**Option A: Cloudflare WARP (CLI)**
```bash
brew install cloudflare-warp
warp-cli register
warp-cli connect
```

**Option B: Cloudflare WARP (앱)**
- 다운로드: https://1.1.1.1/
- 설치 후 연결

**NordVPN 설치:**
```bash
brew install --cask nordvpn
# 설치 후 기존 계정으로 로그인
```

### 3단계: Python 환경 확인
```bash
cd /Users/seongjunkim/projects/real-estate-platform/modules/naver-crawler
pip install -r requirements.txt
playwright install chromium
```

### 4단계: VPN 연결 확인
```bash
# 현재 IP 확인
curl ifconfig.me

# WARP 연결
warp-cli connect

# IP 변경 확인
curl ifconfig.me
```

## 🚀 크롤링 시작

환경 설정 완료 후:
```bash
cd /Users/seongjunkim/projects/real-estate-platform/api
node src/scripts/startAdvancedCrawling.js
```

## 📊 예상 성과
- **일일 목표**: 300개 단지
- **완료 기간**: 67일
- **완료 예정**: 2025년 10월 21일
- **성능 향상**: 기존 대비 4배 빠름

## ⚠️ 주의사항
1. VPN 연결 상태 지속 모니터링
2. 요청 간격 2-5초 유지
3. 성공률 90% 이상 유지
4. 에러 발생시 즉시 중단 후 VPN 전환

## 🔄 다음 단계
1. Homebrew 설치 (사용자 직접)
2. VPN 도구 설치
3. 크롤링 환경 테스트
4. 고속 크롤링 시작