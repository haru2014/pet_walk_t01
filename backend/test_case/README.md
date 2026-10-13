# 🧪 편안하개 백엔드 TDD (Test-Driven Development) 테스트 스위트

본 디렉토리(`backend/test_case/`)는 **편안하개 (AI Native 반려견 맞춤형 안심 노면 산책 에이전트 및 핸즈프리 모바일 플랫폼)**의 **7개 핵심 에픽(Epic A, B, C, E, F, G, H) 및 18개 핵심 애자일 사용자 스토리(77 pt)**와 **차기 확장 백로그(Phase 2 / US-D1, US-D2, US-17 ~ US-29)**를 포괄하는 종합 백엔드 TDD 테스트 스위트입니다.

본 프로젝트는 **GitHub Actions CI 워크플로우(`.github/workflows/ci.yml`)**를 통해 Push 및 Pull Request 시 자동으로 모든 단위·계약·통합 테스트(156개)를 실행하여 무결성을 검증합니다.

---

## 📂 테스트 스위트 구조 및 사용자 스토리 매핑 (총 20개 테스트 모듈, 156개 테스트 100% Pass)

| 테스트 파일명 | 대상 에픽 & 사용자 스토리 (Story ID) | 주요 검증 내용 (인수 조건 & DoD 연계) |
|---|:---:|---|
| [`test_langgraph_walk_agent.py`](./test_langgraph_walk_agent.py) | **[1번 R&R 코어]<br>US-A1, A3, B1~B3, E3** | • **[LangGraph ReAct 오케스트레이션]**: StateGraph 노드(`parse_intent`, `calibrate_constraints`, `generate_candidates`, `score_and_rank`, `synthesize_briefing`) 워크플로우 컴파일 및 전주기 실행 검증<br>• 노령견/소형견/대형견 체급별 속도 모델링 및 $\pm 15\%$ 수렴도 검증<br>• Candidate Route Scorer 100점 채점 및 웰니스 카피라이팅 가드레일(질병 용어 0건) 음성 브리핑 검증 |
| [`test_walk_plan_agent_schema.py`](./test_walk_plan_agent_schema.py) | **[Epic A] US-A1, US-A2<br>[Epic E] US-E3** | • **[US-A1]**: 자연어 발화 의도 파싱(`TargetDuration`, `AvoidStairs`, `SlopePreference`, `ShadePriority`) Pydantic V2 엄격 검증 및 불명확 질의 안전 Fallback<br>• **[US-A2]**: Local-First `AsyncStorage` 프로필 영속화, JSON 내보내기/가져오기 백업/복원 무결성, 웰니스 카피라이팅 가드레일 (질병 단어 검출 0건)<br>• **[US-E3]**: 로컬 누적 피드백(경사 불만족 등) 전달 시 무상태(Stateless)로 최대 허용 경사도 1~2% 하향 보정 |
| [`test_loop_target_duration.py`](./test_loop_target_duration.py) | **[Epic A] US-A3** | • **[US-A3]**: 표준 보행 속도 모델(소형 2.8, 중형 3.6, 대형 4.2, 노령 2.2 km/h) 기반 목표 거리 환산($D = V \times T$)<br>• 10~90분 슬라이더(기본 권장 15~60분) 입력 유효성 검증<br>• 순환(Loop) 경로 목표 거리 대비 **오차 ±15% 이내 수렴 및 2개 이상 루프 후보 생성** 검증 |
| [`test_surface_cost_model.py`](./test_surface_cost_model.py) | **[Epic B] US-B1, US-B2, US-B3** | • **[US-B1]**: OSM 보행망 `highway=steps` 링크 하드 회피(Hard Constraint) 및 무장애길 메타데이터 투명 반환<br>• **[US-B2]**: DEM 고도 및 기상청 연동 지면온도 추정 모델 기반 고온(>35℃) 노면 회피 라우팅<br>• **[US-B3]**: Candidate Route Scorer 다요소 종합 채점(계단 배제, 완만 경사, 지면온도 안전, 거리 적합도) 및 최적 코스 선정<br>• OSM 보행망 속성 결합 및 공원 폴리곤 기반 노면 출처 투명성 검증 |
| [`test_surface_slope_evaluation.py`](./test_surface_slope_evaluation.py) | **[Epic B] US-B1** | • DEM 30m 래스터 고도 보간 및 구간별 경사도(%) 계산<br>• 15도 미만 완만/안심/주의 3색(Green/Blue/Orange) GeoJSON LineString 구간 분할 및 연속성 검증 |
| [`test_building_avoidance.py`](./test_building_avoidance.py) | **[Epic B] US-B1, B3** | • Shapely 공간 교차 연산 기반 서울시 건물 외곽선 관통 차단<br>• 건축물 폴리곤 관통 시 즉시 무효화 및 도로망 우회 경로 대체 검증 |
| [`test_road_network_routes.py`](./test_road_network_routes.py) | **[Epic B] US-B3** | • OSRM Foot Routing 어댑터 통신 및 Waypoint 다각형 루프 생성<br>• 순환 시작/종료점 일치 및 도로망 노드 스냅 무결성 검증 |
| [`test_route_geometry_validation.py`](./test_route_geometry_validation.py) | **[Epic B] US-B3, A3** | • 생성된 경로 기하(Geometry)의 폐곡선(Loop Closure) 무결성 검증<br>• 180도 U턴 왕복 궤적(Spur/Backtracking) 비율 15% 이하 제약 검증 |
| [`test_walk_plan_latency.py`](./test_walk_plan_latency.py) | **[Epic B] US-B3, A3** | • 순환 코스 생성 1.5초 이내 응답 보장 레이턴시 벤치마크<br>• 10분 TTL 인메모리 캐시 및 연속 3회 실패 시 서킷 브레이커(60초) 동작 검증 |
| [`test_offline_walk_network.py`](./test_offline_walk_network.py) | **[Epic B] US-B3** | • 외부 라우팅 서버 다운 시 오프라인 정적 보행 그래프 기반 순환 경로 폴백 생성<br>• 무장애 규칙 및 건물 관통 방지 오프라인 보장 검증 |
| [`test_hazard_service.py`](./test_hazard_service.py) | **[Epic D] US-D2** | • 현장 위험 요소(높은 턱, 공사 등) 제보 수집 및 저장<br>• 위험 좌표 반경 내 도로 링크 비용 페널티 부여 및 3초 이내 동적 우회로 재탐색 검증 |
| [`test_vision_safety_inspector.py`](./test_vision_safety_inspector.py) | **[Phase 2] US-D1, US-D2** | • **[US-D1]**: Gemini 가용 모델 우선순위 체인(3.5 Flash-Lite ➔ 3.1 Flash-Lite ➔ 3.6 Flash) 기반 순차 자동 선택(Cascading Fallback, 1.5 계열 차단) 및 현장 높은 턱(25cm), 야외 계단, 공사 장애물 분석 DTO, 공원 종합안내판 판독(`ParkBoardInspector`) 반려견 금지구역 파싱<br>• **[US-D2]**: 현장 위험 감지 시 해당 링크 비용 10배 페널티/차단 적용 및 3초 이내 대안 우회로 동적 재산출(`POST /api/v1/walk/reroute`) |
| [`test_mobile_and_voice_navigation.py`](./test_mobile_and_voice_navigation.py) | **[Epic C] US-C1, US-C2** | • **[US-C1]**: React Native Maps Polyline 구간별 색상 분기 렌더링 계약 검증<br>• **[US-C2]**: 시선 해방(Eyes-Free) 백그라운드 핸즈프리 음성 내비게이션: Android Foreground Service GPS 연동, 회전 30m 전 `expo-speech` TTS 사전 브리핑, 40m 이상 이탈 감지 시 재탐색 음성 알림 |
| [`test_walk_tracking_and_feedback.py`](./test_walk_tracking_and_feedback.py) | **[Epic E] US-E1, US-E2<br>[Epic H] US-H1** | • **[US-E1]**: 백그라운드 GPS 궤적 로컬 스토리지(`@pet_walk:walk_history`) 영속화, 최근 100회 산책 기록 한도(FIFO) 관리, 자택 좌표 서버 미전송 보장<br>• **[US-E2]**: 완주 인포그래픽 리포트 생성 및 3초 원터치 체감 피드백(완만함, 그늘, 발 편함) 수집 검증 |
| [`test_thermal_and_parking.py`](./test_thermal_and_parking.py) | **[Epic F] US-F1<br>[Epic G] US-G1** | • **[US-F1]**: 기상청 단기예보(기온, 일사량) 기반 지면열 추정 수지식 연산 및 35℃ 이하 안전 산책 골든타임 카드 도출<br>• **[US-G1]**: 현위치 반경 1.5km 이내 공영주차장(P&R) 필터링 및 주차장 출입구 시작/종료 순환 코스 스냅 DTO 검증 |
| [`test_spatial_masking.py`](./test_spatial_masking.py) | **[Epic G] US-G2** | • 코스 커뮤니티 공유 시 **출발지 및 도착지 반경 200m 공간 절단 및 최근접 교차로(Node) 스냅** 알고리즘 검증<br>• 비매핑 지역 Trajectory 코너 스냅 폴백 검증 |
| [`test_supabase_repository.py`](./test_supabase_repository.py) | **[Epic G] US-G2** | • Supabase PostgreSQL 커뮤니티 피드 조회/저장 Dual-Mode (Live DB + 인메모리 폴백) 무결성 검증 |
| [`test_api_contracts.py`](./test_api_contracts.py) | **REST API Contract** | • FastAPI 백엔드 v1 엔드포인트 입출력 계약 DTO 전수 검증 (`POST /api/v1/walk/plan`, `POST /api/v1/community/share`, `GET /health` 등) |
| [`test_eas_update_ota.py`](./test_eas_update_ota.py) | **[Epic H] US-H1** | • EAS Update 무선 OTA 매니페스트 DTO 및 무중단 업데이트 롤아웃 설정 검증 |
| [`test_phase2_extended_features.py`](./test_phase2_extended_features.py) | **[Phase 2 / Icebox]<br>US-17 ~ US-29** | • **[US-17]**: H3 헥사곤 기반 안심 완만길(경사<=5%, 계단 0) 점령 시 2.5배 Calm Bonus 및 초록색 타일(`10B981`) 매핑<br>• **[US-18]**: 한 손 원터치 배변 마킹 및 공원 세족장(Paw Wash Station)/음수대 커뮤니티 POI 등록<br>• **[US-19]**: 완만길 70% 이상 달성 시 유기견 영양제 기부 포인트 2배 적립<br>• **[US-20]**: 예민견을 위한 혼잡도 역가중치 및 도로 폭 3m+ 시야 확보 구간 우선 추천<br>• **[US-22]**: 긴급 산책 중단 시 현재 위치에서 출발점까지 2초 이내 복귀 경로(Return to Start) 재산출<br>• **[US-24]**: 다견(Multi-Dog) 동시 산책 시 최솟값 속도($V_{\min}$) 및 보수적 계단 회피 제약 결합<br>• **[US-26]**: 24시간 누적 강수량 10mm 이상 시 흙길 진흙탕 3배 페널티 및 탄성/포장 대안 추천<br>• **[US-29]**: 나만의 안심 코스 즐겨찾기(`@pet_walk:favorites`) 로컬 CRUD 및 원터치 즉시 재산책 |

---

## 🚀 테스트 실행 방법

### 1. 가상환경 및 의존성 확인
```bash
cd backend
python -m pip install -r requirements.txt
```

### 2. 전체 백엔드 테스트 스위트 실행 (156개 테스트 전수 100% Pass)
```bash
# backend 디렉토리에서 실행
pytest test_case/ -v

# 또는 프로젝트 루트에서 실행 (pytest.ini 기반 자동 감지)
python -m pytest
```

### 3. 모듈별 단위 테스트 실행 예시
```bash
# [1번 코어 R&R] LangGraph ReAct Walk Planning Agent 전주기 오케스트레이션
pytest test_case/test_langgraph_walk_agent.py -v

# [Epic A] 산책 시간 및 표준 속도 환산
pytest test_case/test_loop_target_duration.py -v

# [Epic B] 무장애길·지면온도 라우팅 및 다요소 스코어러
pytest test_case/test_surface_cost_model.py -v

# [Epic B] 건물 관통 방지 공간 교차 검증
pytest test_case/test_building_avoidance.py -v

# [Epic B] 경로 생성 1.5초 응답 레이턴시 벤치마크
pytest test_case/test_walk_plan_latency.py -v

# [Epic C] 모바일 Polyline 색상 분기 및 핸즈프리 음성 안내
pytest test_case/test_mobile_and_voice_navigation.py -v

# [Phase 2: US-D1, US-D2] Vision AI 현장 위험 분석 및 동적 우회 재탐색
pytest test_case/test_vision_safety_inspector.py -v

# [Epic G] 200m 교차로 스냅 마스킹 및 커뮤니티 피드
pytest test_case/test_spatial_masking.py -v
pytest test_case/test_supabase_repository.py -v
```

---

## ⚙️ GitHub Actions CI / TDD 파이프라인 연동 (`.github/workflows/ci.yml`)

편안하개는 GitHub Actions 기반 Continuous Integration(CI)을 통해 품질 가드레일과 TDD 자동화를 실현합니다:

1. **백엔드 CI 파이프라인 (`backend-test`)**:
   - `backend/` 작업 디렉토리 기준 Python 3.11, 3.12 환경 매트릭스 실행
   - `backend/requirements.txt` 의존성 자동 캐싱
   - 156개 pytest 전수 실행 및 무결성 검증
2. **프론트엔드 CI 파이프라인 (`frontend-test`)**:
   - `frontend/` 작업 디렉토리 기준 Node 20.x 환경 실행
   - 78개 Vitest 모바일 단위 테스트 및 `tsc --noEmit` TypeScript 정적 타입 검증
3. **가드레일 감사**:
   - 웰니스 카피라이팅 가드레일 (질병 단어 0건)
   - Gemini 3.x Cascading Chain 준수 검증
   - 단일 파일 줄 수 250줄 이하 SonarLint 가드레일 검증
