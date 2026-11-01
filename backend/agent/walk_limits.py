"""산책 시간 한도 (분) — 서버 전체가 이 값 하나를 쓴다.

앱(frontend/src/types/walkSettings.ts)이 고를 수 있는 15~120분을 모두 받아야 한다.
(예전에는 서버가 10~90분만 받아 105분·120분을 고르면 400 오류가 났다. 이슈 #125)
앱의 옵션이 늘면 test_walk_duration_limits.py 가 실패해 알려 준다.
"""

MIN_WALK_MINUTES = 10
MAX_WALK_MINUTES = 120

# 보행 속도 한도 (km/h). 강아지와 걷는 속도로 가능한 범위만 받는다 (100km/h 같은 값이 14초 걸리던 문제, 2026-10-30 QA).
MIN_SPEED_KMH = 0.5
MAX_SPEED_KMH = 10.0

# 서비스 지역 (대한민국 본토·제주·울릉·독도를 덮는 위경도 범위). 바다 한가운데(0, 0) 같은 좌표에 가짜 코스를 만들지 않는다 (2026-10-30 QA).
SERVICE_LAT_RANGE = (32.9, 38.7)
SERVICE_LON_RANGE = (124.5, 132.0)
