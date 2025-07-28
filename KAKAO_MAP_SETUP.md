# 카카오맵 API 설정 가이드

## 🗺️ 카카오맵이 표시되지 않는 경우

프로젝트의 카카오맵 API 키가 만료되었습니다. 다음 단계를 따라 새로운 키를 설정해주세요.

## 📋 설정 단계

### 1. 카카오 개발자 계정 생성
1. [카카오 개발자 콘솔](https://developers.kakao.com)에 접속
2. 카카오 계정으로 로그인
3. 개발자 등록 (최초 1회만)

### 2. 애플리케이션 생성
1. **내 애플리케이션** → **애플리케이션 추가하기**
2. 앱 이름: `부동산 플랫폼` (또는 원하는 이름)
3. 사업자명: 개인 또는 회사명
4. **저장** 클릭

### 3. JavaScript 키 발급
1. 생성한 앱 선택
2. **앱 설정** → **앱 키** 메뉴
3. **JavaScript 키** 복사 (예: `1234567890abcdef1234567890abcdef`)

### 4. 플랫폼 등록
1. **앱 설정** → **플랫폼** 메뉴
2. **Web 플랫폼 등록**
3. 사이트 도메인 입력:
   - `http://localhost:3000`
   - `http://localhost:3001` 
   - `http://localhost:3002`
   - `http://localhost:3003`
   - 기타 사용하는 로컬 포트

### 5. 프로젝트에 API 키 적용

#### 방법 1: HTML 파일 직접 수정
`dashboard/index.html` 파일에서:

```html
<!-- 현재 (주석 처리됨) -->
<!-- <script type="text/javascript" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=YOUR_KAKAO_API_KEY&libraries=services&autoload=false"></script> -->

<!-- 수정 후 (주석 해제하고 API 키 교체) -->
<script type="text/javascript" src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=1234567890abcdef1234567890abcdef&libraries=services&autoload=false"></script>
```

#### 방법 2: 환경변수 사용
`dashboard/.env` 파일에서:

```bash
# 기존
VITE_KAKAO_MAP_API_KEY=aaa8e2d31d0492266d2ff2e09b6ab804

# 수정 후 (새로운 JavaScript 키로 교체)
VITE_KAKAO_MAP_API_KEY=1234567890abcdef1234567890abcdef
```

### 6. 개발 서버 재시작
```bash
cd dashboard
npm run dev
```

## ✅ 확인 방법

1. 브라우저에서 `http://localhost:3003` 접속
2. 지도 페이지에서 강남역 중심의 카카오맵이 표시되는지 확인
3. 브라우저 개발자 도구의 콘솔에서 오류 메시지 확인

## 🚨 문제 해결

### API 키 관련 오류
- `HTTP 401 Unauthorized`: API 키가 잘못됨
- `HTTP 403 Forbidden`: 도메인이 등록되지 않음
- `HTTP 404 Not Found`: 존재하지 않는 API 키

### 도메인 등록 확인
카카오 개발자 콘솔에서 다음 도메인들이 모두 등록되어 있는지 확인:
- `http://localhost:3000` 
- `http://localhost:3001`
- `http://localhost:3002`
- `http://localhost:3003`

## 📞 추가 도움

설정 과정에서 문제가 발생하면:
1. [카카오맵 API 가이드](https://apis.map.kakao.com/web/guide/) 참조
2. 브라우저 개발자 도구의 Network 탭에서 API 호출 상태 확인
3. Console 탭에서 JavaScript 오류 메시지 확인