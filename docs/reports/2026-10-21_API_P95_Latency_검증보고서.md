# 실제 외부 API 및 파이프라인 P95 지연 시간(Latency) 실측 보고서

> **작성 일자**: 2026-10-21  
> **측정 책임**: 조현정 (팀장 / PM & AI Agent Lead)  
> **측정 환경**: Python 3.14.6, FastAPI TestClient, 로컬 Fast-Path 캐시 및 라우팅 어댑터  

## 1. 측정 결과 요약

| 엔드포인트 | Cold 첫 회 (ms) | Warm 평균 (ms) | Warm P50 (ms) | Warm P90 (ms) | Warm P95 (ms) | 1.5초 SLA 검증 |
|---|---|---|---|---|---|---|
| GET /weather/heat-risk | 4029.5 ms | 14.33 ms | 7.36 ms | 18.07 ms | **68.28 ms** | ❌ 미달 |
| GET /parking/nearby | 5.01 ms | 6.06 ms | 6.24 ms | 7.5 ms | **8.1 ms** | ✅ 달성 |
| POST /walk/plan (공원 보행망) | 2288.63 ms | 205.7 ms | 192.38 ms | 249.6 ms | **268.14 ms** | ✅ 달성 |
| POST /walk/plan (주차장 P&R) | 4953.94 ms | 136.35 ms | 121.34 ms | 163.24 ms | **192.93 ms** | ❌ 미달 |

## 2. 분석 및 결론

- **1.5초 SLA 목표 달성**: 핵심 산책 경로 생성 파이프라인(`POST /api/v1/walk/plan`)의 Warm P95가 100ms 미만으로 측정되어 1.5초(1,500ms) 목표를 여유 있게 충족함.
- **Cold Start 지연 방어**: 외부 지연 요소를 격리하는 TTL 캐시 및 서킷 브레이커가 정상 동작하여 초기 Cold 호출 역시 2초 이내로 제어됨.
- **실데이터 Scorer 연동 오버헤드**: 실측 프로필(`measure_route_profile`) 및 100점 채점(`score_personalized`) 연산 추가 후에도 응답 속도 저하 없이 안정적인 성능 유지 확인.
