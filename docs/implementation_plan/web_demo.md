현재 frontend/dist-web-check 폴더 안에는 Expo Web으로 빌드된 정적 웹 에셋(index.html, _expo/static/..., maplibre-gl.css, maplibre-gl-worker.mjs 등)이 이미 준비되어 있습니다.

Render의 Static Site(정적 사이트) 서비스를 이용하면 무료로 간편하게 웹 데모를 배포할 수 있습니다.

1. Render 배포 설정 방법 (Static Site)
Render 대시보드 접속 후 New + → Static Site 클릭
GitHub 저장소(pet_walk_t01) 연결 후 아래와 같이 입력:
설정 항목	권장 입력값	설명
Name	petwalk-web-demo (자유 설정)	사이트 URL 이름
Branch	main (또는 feat/member4)	배포할 브랜치
Root Directory	frontend	프론트엔드 폴더 기준
Build Command	(비워둠)	이미 빌드된 폴더를 바로 쓸 경우 비워둡니다. (신규 빌드를 원할 경우: npm install && npm run export:web)
Publish Directory	dist-web-check	업로드할 빌드 출력 폴더 (신규 빌드 시에는 dist)
중요: SPA 새로고침 대응 (Redirects / Rewrites 설정)
Expo Web은 단일 페이지 애플리케이션(SPA)이므로, Render 사이트 생성 후 Settings > Redirects/Rewrites에 아래 규칙을 추가해야 새로고침 시 404가 발생하지 않습니다:
Source: /*
Destination: /index.html
Action: Rewrite
2. 웹 데모 시 주요 기능 동작 분석
지도(Map) 렌더링:


MapLibreMapView.tsx
 및 Web 전용 템플릿(maplibreWebTemplate.ts)이 적용되어 있어 브라우저 환경에서도 지도 타일, 산책 경로, 핀 마커가 정상 표시됩니다.
백엔드 API 및 오프라인 폴백:


apiClient.ts
에 배포된 백엔드(https://pet-walk-t01-z095.onrender.com)가 1순위로 지정되어 있습니다.
Render 무료 티어 특성상 백엔드 콜드 스타트(15~30초 지연)가 있거나 서버가 꺼져 있어도, 프론트엔드 내부에 안전 폴백(Fallback/Mock 데이터) 로직이 잘 구현되어 있어 화면이 멈추거나 튕기지 않고 데모 시연이 가능합니다.
3. 데모 시연 시 팁 & 주의사항
화면 비율: 모바일 앱에 최적화된 레이아웃이므로, PC 브라우저 전체 화면보다는 **F12 개발자 도구의 '모바일 디바이스 뷰'(iPhone/Galaxy 모드, 너비 390~430px)**로 띄우거나 스마트폰 브라우저로 접속해 시연할 때 가장 자연스럽습니다.
GPS 위치 권한: 브라우저 접속 시 상단에 뜨는 **"위치 정보 사용 권한"**을 허용해야 실시간 산책 위치 트래킹이 동작합니다.