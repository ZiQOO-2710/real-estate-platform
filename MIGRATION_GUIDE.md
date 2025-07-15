# 🔄 WSL → Windows 이동 가이드

## 📊 현재 상태 (2025-07-15)
- **프로젝트**: 부동산 플랫폼 크롤링 & 분석 시스템
- **크롤링 상태**: 전국 동단위 크롤링 진행 중
- **데이터**: 184개 아파트 단지 수집 완료
- **기능**: 메인 페이지 + 상세 페이지 + 실제 데이터 연동

## 🛠️ 설치해야 할 패키지 (Windows)
```bash
# Node.js 패키지
npm install express cors sqlite3

# Python 패키지 (Windows에서)
pip install requests beautifulsoup4 sqlite3
```

## 🗄️ 중요한 데이터 파일들
- `real_estate_crawling.db` (1.1MB) - 메인 데이터베이스
- `crawled_markers_data.json` (87KB) - 지도 마커 데이터

## 🚀 Windows에서 실행 방법
1. GitHub에서 프로젝트 클론
2. 패키지 설치
3. 데이터베이스 파일 복사 (별도 전송 필요)
4. 서버 실행:
   ```bash
   # HTTP 서버 (포트 7777)
   python -m http.server 7777
   
   # API 서버 (포트 3001)
   node apartment_detail_api.js
   ```

## 📝 실행 중인 프로세스들
- 전국 크롤링: `nationwide_dong_crawler.py` (백그라운드)
- HTTP 서버: 포트 7777
- API 서버: 포트 3001

## 🔗 접속 주소
- 메인 페이지: http://localhost:7777/apartment_viewer_standalone.html
- 상세 페이지: http://localhost:7777/apartment_detail_page.html