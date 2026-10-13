# Member B 외장 활동 및 인프라 매뉴얼: AI & Spatial Data Engineer (2번 전황진)

## 1. 개요
본 문서는 Member B(2번 전황진: AI & Spatial Data Engineer)가 AI 어시스턴트에 의존할 수 없는 **대한민국 공공데이터포털 인가 신청, 수치표고모델(DEM) 원천 데이터 수급, n8n Self-hosted ETL 서버 인프라 구축, 지면온도 수지식 파이프라인 및 200m 교차로 스냅 공간 지터링 수동 운영 절차**를 규정합니다.

---

## 2. 공공데이터포털(data.go.kr) API 활용신청 및 인증키 관리

기상청 단기예보 및 에어코리아 대기오염 정보는 정부 인증 시스템을 통한 실명 인증 및 활용 목적 심사가 필요합니다.

### 2.1 공공데이터포털 가입 및 신청 절차
1. **사이트 접속**: [data.go.kr](https://www.data.go.kr/) 접속 및 개인/기업 공동인증서 로그인.
2. **필수 오픈API 2종 검색 및 신청**:
   - **(1) 기상청_단기예보 ((구) 동네예보) 조회서비스**:
     - 제공기관: 기상청
     - 주요 오퍼레이션: `getUltraSrtFcst`(초단기예보), `getVilageFcst`(단기예보)
     - 활용 목적: "편안하개 - 반려견 맞춤형 웰니스 산책로 열환경 및 온습도 분석 연구" 입력.
     - 심사 기간: 즉시 자동 승인(일반) 또는 1~2영업일.
   - **(2) 한국환경공단_에어코리아_대기오염정보**:
     - 제공기관: 한국환경공단
     - 주요 오퍼레이션: `getCtprvnRltmMesureDnsty`(시도별 실시간 측정정보)
     - 활용 목적: "반려견 호흡기 안전을 위한 미세먼지(PM10/PM2.5) 실시간 모니터링" 입력.
3. **일반 인증키(Encoding / Decoding) 보관**:
   - 마이페이지 ➔ **개발계정 상세보기**에서 `일반 인증키(Encoding)` 복사.
   - 파이썬 `requests` 라이브러리 사용 시 URL 인코딩 이슈가 빈번하므로, **Decoding 키**를 프로젝트 내부 시크릿 매니저에 안전하게 보관.
4. **일일 트래픽 쿼터(Traffic Quota) 확인**:
   - 개발계정 기본 한도: 10,000건/일 (충분함).

---

## 3. 국토지리정보원 DEM(수치표고모델) 데이터 확보 및 수동 가공

경사도 분석을 위한 DEM 원본 래스터 데이터는 대용량 파일이므로 수동 다운로드 및 전처리가 필수입니다.

### 3.1 국토정보플랫폼(map.ngii.go.kr) 수치표고모델 다운로드
1. 국토지리정보원 국토정보플랫폼 접속 ➔ 로그인.
2. **공간정보 받기 ➔ 수치표고모델(DEM)** 선택.
3. 격자 해상도: **5m 또는 10m 격자** 선택 (파일 포맷: GeoTIFF 또는 IMG).
4. 대상 영역: 편안하개 1차 시범 서비스 구역(서울숲/성동구, 서울시청/중구, 성산근린공원/마포구, 강남역 일대 도엽).
5. 비상업적 학술/개발 목적 라이선스 확인 후 다운로드.

### 3.2 QGIS / GDAL을 이용한 로컬 전처리 작업 (인간 수동 작업)
1. 다운로드받은 타일(도엽)들을 QGIS에서 로드.
2. **Merge(병합)**: 여러 도엽을 하나의 `petwalk_seoul_dem_10m.tif` 파일로 병합.
3. **좌표계 변환 (Reproject)**:
   - 원본 EPSG:5186 (Korea 2000 / Central Belt 2010)
   - 표준 서비스 좌표계: **EPSG:4326 (WGS84)** 또는 **EPSG:3857 (Web Mercator)**로 변환.
4. 산출물 서버 저장:
   - Member C의 백엔드 서버 저장소(`backend/agent/surface_slope_evaluator.py` 연계 경로)로 안전 전송.

---

## 4. n8n Self-hosted ETL 자동화 인프라 세팅

n8n을 도커 환경에서 수동으로 띄우고 정기 크론(Cron) 스케줄러를 등록합니다.

### 4.1 Docker 기반 n8n 컨테이너 기동
```bash
# n8n 전용 디렉토리 생성
mkdir -p ~/n8n-petwalk && cd ~/n8n-petwalk

# docker-compose.yml 작성
cat <<EOF > docker-compose.yml
version: '3.8'
services:
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: petwalk_n8n
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=petadmin
      - N8N_BASIC_AUTH_PASSWORD=CHANGE_ME_SECURE_PASSWORD
      - N8N_HOST=n8n.petwalk.internal
      - WEBHOOK_URL=https://n8n.petwalk.internal/
      - GENERIC_TIMEZONE=Asia/Seoul
    volumes:
      - ./n8n_data:/home/node/.n8n
EOF

# 컨테이너 실행
docker-compose up -d
```

### 4.2 n8n 워크플로우 캔버스 수동 세팅
1. 브라우저에서 `http://localhost:5678` 접속 후 로그인.
2. **신규 워크플로우 생성**: `PetWalk_Weather_Heat_Sync`
3. **노드 구성**:
   - `Cron Node`: 매 1시간마다 트리거 (`0 * * * *`).
   - `HTTP Request Node`: 기상청 API 호출 (외기온도, 일사량, 날씨 상태).
   - `Function Node (JS)`: 지면열 추정 수지식 연산 ($\text{Estimated Surface Temp} = \text{Air Temp} + (\text{Insolation Weight} \times 15)$).
   - `HTTP Request Node (POST)`: Member C의 백엔드 `/api/v1/weather/heat-risk` 캐시 동기화.
4. 워크플로우 활성화(Active Toggle On).

---

## 5. 지표면 복사열 보정 및 공간 마스킹 보안 감사(Audit)

1. **실외 지표면 온도 수작업 현장 실측 (월 1회)**:
   - 적외선 표면 온도계(Infrared Thermometer)를 지참하여 한낮(12:00~15:00) 아스팔트, 콘크리트, 천연 잔디, 흙길 표면 온도를 직접 측정.
   - 모델 수지식 예측값과 실측값 간의 오차(RMSE)가 3.0℃ 이내로 수렴하는지 캘리브레이션 계수 수동 튜닝.
2. **교차로(Node) 스냅 200m 공간 마스킹 감사**:
   - [`backend/agent/spatial_masking.py`](/pet_walk_t01/backend/agent/spatial_masking.py)의 절단 알고리즘이 출발/도착지 200m 구간을 최근접 교차로 Node로 정확히 스냅하여 역추적 공격(Trajectory Inference Attack)을 원천 방어하는지 테스트 케이스 수동 감사.
