"""산책 시간 한도 (분) — 서버 전체가 이 값 하나를 쓴다.

앱(frontend/src/types/walkSettings.ts)이 고를 수 있는 15~120분을 모두 받아야 한다.
(예전에는 서버가 10~90분만 받아 105분·120분을 고르면 400 오류가 났다. 이슈 #125)
앱의 옵션이 늘면 test_walk_duration_limits.py 가 실패해 알려 준다.
"""

MIN_WALK_MINUTES = 10
MAX_WALK_MINUTES = 120
