# Member C 외장 활동 및 인프라 매뉴얼: Backend & Spatial Routing Lead (3번 노희선)

## 1. 개요
본 문서는 Member C(3번 노희선: Backend & Spatial Routing Lead)가 AI 어시스턴트에 위임할 수 없는 **Supabase 클라우드 데이터베이스 프로비저닝, PostGIS 확장 기능 활성화, OSRM / OpenRouteService 보행 네트워크 어댑터 구축, 백엔드 클라우드 호스팅 인프라 구축 및 SSL/CORS 환경설정 절차**를 규정합니다.

---

## 2. Supabase Cloud 인프라 구축 및 PostGIS 설정

편안하개는 공간 지리 인덱싱(Spatial Query)과 200m 마스킹 커뮤니티 데이터 영속 관리를 위해 Supabase PostgreSQL 엔진을 활용합니다.

### 2.1 Supabase 프로젝트 생성
1. **Supabase 접속**: [supabase.com](https://supabase.com/) 접속 및 GitHub 계정으로 로그인.
2. **New Project 생성**:
   - Organization: 팀 공용 조직 선택.
   - Name: `petwalk-backend`
   - Database Password: 16자리 이상의 강력한 난수 암호 생성 후 팀 키스토어에 보관.
   - Region: **Northeast (Seoul) - ap-northeast-2** 선택 (지연시간 최소화 필수).
   - Pricing Plan: Free Tier.

### 2.2 PostGIS 확장 기능(Extension) 수동 활성화
PostGIS는 대시보드에서 직접 활성화해야 합니다.
1. Supabase 대시보드 ➔ 좌측 메뉴 **"Database" ➔ "Extensions"** 클릭.
2. 검색창에 `postgis` 검색.
3. `postgis: PostGIS geometry and geography spatial types and functions` 토글을 **ON**으로 전환.
4. **SQL Editor에서 활성화 검증**:
   ```sql
   SELECT PostGIS_Version();
   -- 출력 결과: "3.3 USE_GEOS=1 USE_PROJ=1 USE_STATS=1" 등이 정상 반환되는지 확인
   ```

### 2.3 Row Level Security (RLS) 및 커뮤니티 테이블 정책 수동 적용
SQL Editor에서 [`docs/sql/supabase_community_schema.sql`](/pet_walk_t01/docs/sql/supabase_community_schema.sql)을 실행하여 테이블 생성 및 RLS 정책을 수동 적용합니다:
```sql
-- community_courses 및 hazard_reports 테이블 생성
CREATE TABLE IF NOT EXISTS public.community_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    masked_polyline JSONB NOT NULL,
    distance_m DOUBLE PRECISION NOT NULL,
    duration_min INTEGER NOT NULL,
    rating DOUBLE PRECISION DEFAULT 5.0,
    is_origin_masked BOOLEAN DEFAULT TRUE,
    intersection_snapped BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 활성화 및 공개 읽기 허용
ALTER TABLE public.community_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.community_courses FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.community_courses FOR INSERT WITH CHECK (true);
```

---

## 3. 외부 공간 라우팅(Routing) 서비스 및 OSRM 어댑터 관리

보행자 및 반려동물 보행 네트워크 계산을 위한 OSRM Foot Routing 및 ORS 어댑터를 관리합니다.

### 3.1 OSRM Foot Routing 및 투기적 병렬 보정
1. [`backend/agent/road_network_routes.py`](/pet_walk_t01/backend/agent/road_network_routes.py) 및 [`backend/agent/loop_route_planner.py`](/pet_walk_t01/backend/agent/loop_route_planner.py)를 통해 보행 도로망 경로를 연산.
2. **1.5초 응답 보장 아키텍처**:
   - 1회 OSRM 질의 타임아웃 1.2초 상한.
   - 첫 라운드에 3개 배율(0.8, 1.0, 1.25)을 동시에 질의하는 투기적 병렬(Speculative Parallel) 쿼리 적용.
   - 10분 TTL 캐시 레이어 및 서킷 브레이커 탑재.
3. **오프라인 무결성 도로망 폴백**:
   - OSRM 서비스 장애 시 [`backend/agent/offline_walk_network.py`](/pet_walk_t01/backend/agent/offline_walk_network.py)를 통해 건물 관통 없는 안전 도로망 루프 반환.

---

## 4. 백엔드 클라우드 호스팅 인프라 구축 (Render / Railway / 로컬 서비스)

FastAPI 애플리케이션([`backend/main.py`](/pet_walk_t01/backend/main.py))을 인터넷망에 안전하게 배포하고 SSL 인증서를 연동합니다.

### 4.1 Cloud PaaS 인스턴스 프로비저닝
1. 호스팅 플랫폼 접속 ➔ **New Web Service** 선택.
2. GitHub 저장소 연동 (`pet_walk_t01` 지정 및 **Root Directory: `backend`** 설정).
3. **기본 런타임 설정**:
   - Environment: `Python 3.11`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2`
4. **Environment Variables(환경 변수) 수동 등록**:
   - `GEMINI_API_KEY`: (Member A 제공)
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `eyJh...`
   - `ORS_API_KEY`: (선택)

---

## 5. 서버 헬스체크 및 무중단 듀얼 모드 점검

1. **헬스체크 엔드포인트 모니터링**:
   - `GET /health` 호출 시 `supabase_connected` 상태를 실시간 확인:
     ```json
     { "status": "ok", "mode": "live", "supabase_connected": true }
     ```
   - Supabase 장애 시에도 인메모리 캐시로 0.1초 내 무중단 자동 폴백(Dual-Mode)되는지 정기 확인.
2. **단위 테스트 가드레일**:
   - 배포 전 `pytest` 156개 전체 통과 확인.
