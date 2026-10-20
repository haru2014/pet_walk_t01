**phase1:**
[목표] 홈 화면 레이아웃 개선. 먼저 변경 계획서를 작성하고, 내가 승인하기 전에는 코드를 수정하지 마.

[대상] frontend/src/screens/HomeScreen.tsx 및 frontend/src/components/home/ 하위 (현재 로컬 코드를 직접 열어 확인할 것)

[요구사항]
3. 홈 화면 좌측 최상단의 강아지 선택 버튼(흰 원)을 삭제한다. 삭제 후 미사용 import/props/스타일/테스트도 함께 정리한다.
4. 우측 최상단의 알림(종) 버튼을 갈색 카드 안의 강아지 이름 드롭다운 오른쪽으로 옮긴다. 상단 헤더에 남는 빈 공간은 제거한다.
5. 강아지 이름 드롭다운 목록의 폭을 좌우로 넓힌다. 각 항목은 높이 48px 이상, 좌우 패딩을 늘려 한 손 엄지로 누르기 쉽게 한다.
1. UX_COMPACT_RULES.md 11번 "스크롤 금지"를 홈 화면에 적용한다.
   - ScrollView를 제거하고 전체 콘텐츠를 한 화면에 담는다. RefreshControl(당겨서 새로고침)은 함께 제거하고, 화면 진입/포커스 시 자동 갱신으로 대체한다.
   - 지도 영역은 고정 높이 대신 남는 공간을 채우는 flex 레이아웃으로 바꾸고, useHomeResponsive 훅의 기준을 사용한다.
   - 합격 기준: 360x640dp와 412x915dp 화면에서 세로 스크롤이 발생하지 않고 Trail info, Leaf Green 카드가 하단 탭에 가려지지 않는다.
   - 위 방법으로도 안 들어가면 요소를 임의로 삭제하지 말고, 선택지를 정리해 나에게 보고한 뒤 멈춘다.

[준수 사항]
- GEMINI.md 및 .gemini/UX_COMPACT_RULES.md 준수: 요청하지 않은 기능 추가 금지, 터치 타깃 48px 이상, 파일 250라인/함수 40라인 이하, 중첩 삼항 금지, 미사용 코드 제거
- eas build/update 등 배포 명령은 실행하지 않는다.
- 완료 후 실제 실행한 결과만 보고한다: tsc 타입 검사, 프런트엔드 jest(홈 관련 테스트), 백엔드 pytest. 가짜 결과 금지.
- 변경한 파일 목록과 단계 commit 메시지를 제안한다.

**phase2:**
[대상] 1단계가 승인·완료된 홈 화면

2. 알림 아이콘이 점으로 표시되는 문제를 고친다.
   - 먼저 원인을 확인한다: 아이콘 폰트/이미지 로딩 실패인지, placeholder View인지.
   - 제시된 종 이미지 docs/reference/UI개선/dusty_amber_sage_green_assets_transparent/bell_icon.png 와 bell_icon@2x.png 를 frontend/assets 아래 ASCII 경로(예: frontend/assets/images/home/)로 복사해 require()로 사용한다. docs 폴더(한글 경로)를 직접 참조하지 않는다.
   - Image로 표시하고 터치 영역은 48px 이상으로 한다. accessibilityLabel은 "알림"으로 한다.
6. 갈색 카드의 "Park Walk Mode" 문구를 "바로 산책하기"로 변경한다. 이 문구를 검사하는 테스트도 함께 갱신한다. 의학/질병 용어는 사용하지 않는다.
7. Trail info 카드를 누르면 기존 골든타임 모달(GoldenTimeWidget.tsx의 WeatherDetailModal, 기존 onOpenModal 흐름)이 열리게 한다.
   - 모달을 새로 만들거나 복제하지 말고 기존 것을 재사용한다(SSOT).
   - Trail info 카드를 터치 가능 요소로 감싸고 accessibilityRole="button", 최소 48px 터치 영역을 보장한다.
   - 위 모달이 "골든타임 플래너 모달"이 맞는지 로컬 코드에서 확인하고, 다르면 후보를 보고한다.

[준수 사항과 보고 방식은 1단계와 동일]