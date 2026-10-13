# 🐾 편안하개 (PetWalk) - Backend & Supabase

FastAPI 기반의 무상태(Stateless) AI 산책 라우팅 백엔드와 Supabase PostgreSQL / PostGIS 영속성 클라우드 데이터베이스 모듈입니다.

---

## 📌 1. 아키텍처 개요

- **REST API Framework**: FastAPI (Python 3.11+)
- **AI Agent Orchestration**: LangGraph ReAct StateGraph (`agent/walk_planning_agent.py`)
- **Spatial Routing**: OSRM / OpenRouteService Foot Adapter + 1.5초 캐시 (`agent/loop_route_planner.py`)
- **Barrier-Free & Slope Evaluation**: OSM 계단 배제 + DEM 15도 미만 3색 분기 (`agent/surface_slope_evaluator.py`)
- **Building Avoidance**: 건물 외곽선 폴리곤 공간 교차 검증 (`agent/building_geometry.py`)
- **Spatial Masking**: 교차로(Node) 스냅 200m 공간 절단 및 사생활 보호 (`agent/spatial_masking.py`)
- **Hazard Rerouting**: 돌발 위험 구간 페널티 부여 및 3초 우회로 재산출 (`agent/hazard_service.py`)
- **Database & Persistence**: Supabase PostgreSQL + PostGIS (인메모리 듀얼 모드 폴백 지원) (`agent/supabase_repository.py`)

---

## 📂 2. 폴더 구조

```text
backend/
├── main.py                     # FastAPI 메인 애플리케이션 엔트리포인트 (v1 REST API)
├── requirements.txt            # Python 의존성 패키지 목록
├── pytest.ini                  # 백엔드 단위 테스트 환경 설정
├── .env.example                # 백엔드 환경 변수 템플릿
├── sql/
│   └── supabase_schema.sql     # Supabase PostgreSQL DDL 테이블 및 인덱스 정의서
├── agent/                      # AI 에이전트 및 GIS/라우팅 핵심 로직
│   ├── walk_planning_agent.py  # LangGraph 산책 플래너 에이전트
│   ├── loop_route_planner.py   # OSRM 순환 루프 생성기
│   ├── surface_slope_evaluator.py # 무장애 노면 및 경사도 3색 평가기
│   ├── building_geometry.py    # 건물 관통 방지 검증 모듈
│   ├── spatial_masking.py      # 200m 교차로 스냅 마스킹 모듈
│   ├── supabase_repository.py  # Supabase 클라우드 저장소 (Dual-Mode)
│   ├── hazard_service.py       # 위험 제보 및 동적 우회 서비스
│   └── ...
├── fixtures/                   # 테스트용 서울시 건물 외곽선 GeoJSON
└── test_case/                  # TDD 156개 전수 단위 테스트 (pytest)
```

---

## 🚀 3. 로컬 실행 및 개발 가이드

### 3.1 가상환경 세팅 및 패키지 설치
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3.2 환경 변수 설정
```bash
cp .env.example .env
# .env 파일 내 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 등을 설정합니다.
# (미설정 시에도 인메모리 및 Mock 모드로 자동 폴백 동작합니다.)
```

### 3.3 로컬 API 서버 기동
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- **API 서버 주소**: `http://localhost:8000`
- **Swagger 대화형 문서**: `http://localhost:8000/docs`
- **ReDoc 문서**: `http://localhost:8000/redoc`

### 3.4 단위 테스트 실행
```bash
pytest test_case/ -v
```

---

## ☁️ 4. Supabase 데이터베이스 세팅

Supabase 대시보드(SQL Editor)에서 [`sql/supabase_schema.sql`](./sql/supabase_schema.sql) 스크립트를 실행하여 다음 테이블을 생성합니다:
1. `community_courses`: 이웃과 공유된 안심 산책로 (200m 마스킹 적용)
2. `hazard_reports`: 현장 돌발 위험(높은 턱, 계단, 공사 구간 등) 제보 데이터
