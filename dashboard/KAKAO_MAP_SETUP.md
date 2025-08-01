# 🗺️ 카카오맵 API 설정 가이드

## 📋 카카오맵 API 키 발급 방법

### 1. 카카오 개발자 사이트 접속
- [카카오 개발자 사이트](https://developers.kakao.com)에 접속
- 카카오 계정으로 로그인

### 2. 애플리케이션 생성
- "내 애플리케이션" 페이지에서 "애플리케이션 추가" 클릭
- 앱 이름: `부동산 플랫폼` (원하는 이름으로 설정)
- 사업자명: 개인 또는 회사명 입력

### 3. 웹 플랫폼 등록
- 생성된 앱 선택
- 좌측 메뉴의 "플랫폼" 클릭
- "Web 플랫폼 등록" 클릭
- 사이트 도메인 입력:
  - 개발: `http://localhost:3000`
  - 운영: `https://your-domain.com`

### 4. API 키 확인
- "요약 정보" 탭에서 "JavaScript 키" 복사
- 이 키를 환경변수로 설정

## 🔧 프로젝트 설정

### 1. 환경변수 설정
`dashboard/.env` 파일에 API 키 입력:

```bash
# 카카오맵 API 키 (JavaScript 키)
VITE_KAKAO_MAP_API_KEY=your_javascript_key_here

# 기타 설정
VITE_API_BASE_URL=http://localhost:4000
VITE_APP_ENV=development
```

### 2. 개발 서버 재시작
```bash
cd dashboard
npm run dev
```

### 3. 지도 확인
- 브라우저에서 `http://localhost:3000/map` 접속
- 지도가 정상적으로 표시되는지 확인

## 📍 현재 구현된 기능

### 🗺️ 지도 기능
- **실시간 로딩**: 카카오맵 API 대기 및 로드
- **마커 표시**: 20개 단지 위치 마커
- **정보창**: 단지 클릭 시 상세 정보 표시
- **지역 필터**: 서울 25개 구별 지역 선택
- **지도 이동**: 선택한 지역으로 자동 이동
- **초기화**: 지도 위치 및 필터 초기화

### 📊 단지 정보 표시
- 단지명, 지역, 건축년도
- 동수, 세대수
- 좌표 정보 (위도, 경도)
- 매물 현황 (매매, 전세)

### 🎯 지역별 좌표 매핑
- 서울 25개 구 좌표 데이터
- 지역명 기반 자동 좌표 매핑
- 동일 지역 내 여러 단지 오프셋 적용

## ⚠️ 주의사항

### API 사용량 제한
- 카카오맵 API는 일일 사용량 제한이 있습니다
- 기본 무료 할당량: 일 300,000건
- 상업적 이용 시 유료 플랜 고려

### 보안 고려사항
- JavaScript 키는 브라우저에서 노출됩니다
- 도메인 제한을 통해 보안 강화
- 운영 환경에서는 레퍼러 검증 설정

### 개발 환경 설정
- 로컬 개발: `http://localhost:3000`
- HTTPS 필요 시: `https://localhost:3000`
- 포트 변경 시 카카오 앱 설정도 업데이트 필요

## 🔧 문제 해결

### 지도가 표시되지 않는 경우
1. API 키 확인
2. 도메인 등록 확인
3. 브라우저 콘솔 에러 확인
4. 네트워크 연결 확인

### 마커가 표시되지 않는 경우
1. 단지 데이터 API 연결 확인
2. 좌표 데이터 유효성 확인
3. 브라우저 콘솔 로그 확인

## 📞 지원

문제가 발생하면 다음을 확인하세요:
- [카카오맵 API 문서](https://apis.map.kakao.com/web/guide/)
- [카카오 개발자 포럼](https://devtalk.kakao.com/)
- 프로젝트 GitHub Issues

---

**최종 업데이트**: 2025년 7월 18일  
**버전**: v1.0.0  
**상태**: 개발 완료, 테스트 필요