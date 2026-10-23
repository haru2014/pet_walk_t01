# 📋 [팀원 4 김승현] GitHub 할당 이슈 TODO 리스트

> **기준일자**: 2026-10-19  
> **담당자**: 김승현 (`gigantess`, Frontend & Mobile App Lead)  
> **저장소**: [haru2014/pet_walk_t01](https://github.com/haru2014/pet_walk_t01)  
> **조회 기준**: `gh issue list --assignee gigantess --state open`

---

## 📌 전체 할당 이슈 요약

| 이슈 번호 | 우선순위 | 이슈 제목 | 작성자 | 생성일 | 진행 상태 |
|:---:|:---:|---|:---:|:---:|:---:|
| **[#117](https://github.com/haru2014/pet_walk_t01/issues/117)** | 🔴 P0 (버그) | **공유가 실패해도 "공유 완료"처리되는 문제 처리 필요** | `@hippie-jin` | 10/18 | **✅ 완료 (10/19)** |
| **[#127](https://github.com/haru2014/pet_walk_t01/issues/127)** | 🔴 P0 (버그) | **음성 안내 성별 설정 오류 (남성 선택 시 여성 음색 출력)** | `@kululu81` | 10/19 | **✅ 완료 (10/19)** |
| **[#128](https://github.com/haru2014/pet_walk_t01/issues/128)** | 🟡 P1 (UX) | **산책 완료 후 내보내기 기능의 사용자 접근성 개선** | `@kululu81` | 10/19 | **✅ 완료 (10/19)** |
| **[#129](https://github.com/haru2014/pet_walk_t01/issues/129)** | 🟡 P1 (기능) | **산책 기록의 지도 시각화 (실제 이동 경로 및 배변 마킹)** | `@kululu81` | 10/19 | **✅ 완료 (10/19)** |
| **[#130](https://github.com/haru2014/pet_walk_t01/issues/130)** | 🟡 P1 (기능) | **산책 기록 누적에 따른 목록 관리 (최근 1주일 우선/과거 조회)** | `@kululu81` | 10/19 | **✅ 완료 (10/19)** |

---

## 1. 🔴 [완료] Issue #117: 공유가 실패해도 "공유 완료" 처리되는 문제 처리

- **이슈 링크**: [#117](https://github.com/haru2014/pet_walk_t01/issues/117)
- **작성자**: `@hippie-jin` (전황진)
- **핵심 내용**:
  `frontend/src/services/communityApi.ts`의 `shareCommunityCourse`가 서버 요청 실패 시에도 `success: true`를 반환하여 실제로 공유되지 않았음에도 "이웃과 안심 코스를 공유했어요! (200m 사생활 보호 적용)"가 뜨는 치명적 UI 오안내 발생.
- **수정 결과**:
  서버 통신 실패 또는 오류 시 `success: false` 및 `errorMessage: '지금은 공유할 수 없어요. 잠시 후 다시 시도해 주세요.'`를 정확히 반환하도록 수정하고, `WalkReportScreen.tsx`에서 실패 시 `[코스 공유 실패]` 경고창 표시.

### 📋 세부 작업 TODO
- [x] `frontend/src/services/communityApi.ts`
  - [x] `shareCommunityCourse` 함수에서 `fetch` 실패 / 비정상 상태 코드(`res.ok === false`) 시 `success: false` 및 `errorMessage` 반환 처리
  - [x] 에러 메시지 표준화 상수 `COMMUNITY_SHARE_ERROR_MESSAGE` 정의
- [x] UI 컴포넌트 연동 (`frontend/src/screens/WalkReportScreen.tsx`)
  - [x] 공유 실패 시 성공 토스트 대신 실패 안내 경고 메시지(`[코스 공유 실패] 지금은 공유할 수 없어요...`) 노출 및 조기 반환
- [x] 단위 테스트 작성 및 통과
  - [x] `frontend/src/services/communityApi.test.ts` 실패 케이스 검증 추가 (passed)
  - [x] `frontend/src/services/shareCourseFlow.test.ts` 실패 케이스 검증 갱신 (passed)

---

## 2. 🔴 [완료] Issue #127: 음성 안내 성별 설정 오류

- **이슈 링크**: [#127](https://github.com/haru2014/pet_walk_t01/issues/127) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  음성 안내 설정에서 남성 음성을 선택해도 실제 TTS 재생 시 여성 음색으로 고정 출력되는 버그.
- **원인 분석**:
  1. `expo-speech`의 `Speech.speak(text, options)` 호출 시 `voice` 식별자(iOS `ko-kr-x-ism-local` 등, Windows/Edge `InJoon`/`BongJin`) 파라미터가 누락되어 OS 기본값(여성 기본 보이스)으로 고정 재생됨.
  2. `VOICE_PROFILES`에서 `friendly_male`의 pitch가 0.98, `calm_male`의 pitch가 0.88로 여성 기본 pitch(1.0)와 거의 차이가 없어 여성 보이스 음색으로 들림.
- **수정 결과**:
  - `ttsNavigation.ts`: `loadAvailableVoices()` 및 `findVoiceForGender()` 구현으로 기기 내 한국어 남성 전용 TTS 보이스(Android `ism`, Edge `InJoon`/`BongJin` 등)를 탐색하여 `options.voice`로 바인딩.
  - `voiceSettings.ts`: 남성 프로필 기본 pitch를 확실한 중저음 남성 대역(`calm_male: 0.70`, `friendly_male: 0.78`)으로 재조정하여 남성 보이스가 없는 환경에서도 남성 음색 효과 보장.

### 📋 세부 작업 TODO
- [x] `frontend/src/services/ttsNavigation.ts`
  - [x] `Speech.getAvailableVoicesAsync()`를 활용한 기기 설치 보이스 비동기 프리페치 및 캐싱
  - [x] `findVoiceForGender()` 성별 매칭 로직 (female/woman 오탐 방지 필터 포함)
  - [x] `speak()` 호출 시 성별에 일치하는 `voice` identifier 주입
- [x] `frontend/src/types/voiceSettings.ts`
  - [x] 남성 보이스 프로필 피치 캘리브레이션 (`calm_male: 0.70`, `friendly_male: 0.78`)
- [x] 단위 테스트 작성 및 통과
  - [x] `frontend/src/services/voiceSettings.test.ts` 남성/여성 보이스 식별자 매핑 및 발화 옵션 적용 단위 테스트 3건 추가 (11 passed)

---

## 3. 🟡 [완료] Issue #128: 산책 완료 후 내보내기 기능의 사용자 접근성 개선

- **이슈 링크**: [#128](https://github.com/haru2014/pet_walk_t01/issues/128) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  일반 사용자에게 생소한 CSV/JSON 기술적 파일 내보내기 버튼이 산책 기록 상단에 전면 배치되어 UX를 해치는 문제 해결.
  산책 통계 성과 지표(거리, 시간, 평균 속도, 배변 횟수, 완만 노면율)와 누적 산책 기록 카드를 우선적으로 감상할 수 있도록 사용자 중심 위계 재정렬.
- **수정 결과**:
  - `MyWalkHistoryView.tsx`:
    1. 산책 성과 요약 카드에 직관적인 이모지(`🐾 횟수`, `📍 총 거리`, `⏱️ 총 시간`, `🌿 완만 노면율`, `💩 총 배변`)를 도입하여 감상 편의성 극대화.
    2. 산책 기록 목록 스크롤을 최상위 경험으로 올리고, 생소한 CSV/JSON 내보내기 버튼은 하단 접이식 아코디언(`📁 동물병원 제출 및 데이터 백업 ▾`)으로 재배치.
    3. 아코디언 펼침 시 친절한 사용자 안내 제공 ("동물병원 슬개골·관절 진료 상담 및 보험 청구용 엑셀", "스마트폰 변경 시 기기 이전 백업용 원본 데이터").
  - `WalkReportScreen.tsx`: 산책 완료 직후 화면 하단 고지 문구에 마이페이지에서 언제든지 동물병원 제출용 엑셀(CSV)을 저장할 수 있음을 명시하여 접근성 연계.

### 📋 세부 작업 TODO
- [x] `frontend/src/components/profile/MyWalkHistoryView.tsx` UI 위계 개편
  - [x] 최상단: 산책 성과 요약 카드 (거리, 시간, 평균 속도, 배변 횟수, 노면율) 시각화 강화
  - [x] 산책 기록 목록을 사용자 최우선 탐색 영역으로 배치
  - [x] CSV 내보내기 및 JSON 백업 버튼은 하단 접이식(`동물병원 제출 및 데이터 백업 ▾`) 아코디언으로 위계 조정 (기본 접힘, 용도별 부연 설명 제공)
- [x] `frontend/src/screens/WalkReportScreen.tsx` 데이터 접근성 연계
  - [x] 산책 완료 화면에서 마이페이지를 통한 진료용 엑셀(CSV) 다운로드 지원 안내 캡션 추가
- [x] 단위 테스트 작성 및 통과
  - [x] `frontend/src/components/profile/MyWalkHistoryView.test.tsx` 5건 단위 테스트 통과
  - [x] `tsc --noEmit` 무결점 검증 통과
  - [x] 전체 60개 테스트 파일 (344개 테스트) 100% 통과

---

## 4. 🟡 [완료] Issue #129: 산책 기록의 지도 시각화 (경로 및 배변 마킹)

- **이슈 링크**: [#129](https://github.com/haru2014/pet_walk_t01/issues/129) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  산책 완료 후 실제 이동한 GPS 경로(LineString)를 지도 위에 시각화하고, 산책 중 기록한 배변(대변/소변) 위치를 지도 마커(아이콘)로 표시. 산책 기록 목록에서 특정 기록을 탭했을 때 상세 지도 화면으로 전환.
- **수정 결과**:
  - `WalkRecordDetailModal.tsx` 구현:
    1. `buildWalkRecordMapData`: `WalkRecord`의 `gpsTrack` 좌표열로부터 GeoJSON LineString 경로 및 완만 노면율 세그먼트 생성.
    2. 출발지(🚩) 및 도착 완주지(🏁) 핀 배치.
    3. `poopEvents` (대변 `💩`, 소변 `💧`) 좌표 및 마킹 시각 오버레이 핀 생성 (레거시 `poopCount` 자동 배치 지원).
    4. 마커 범례 칩, 4대 보행 지표, 동반견 정보 및 체감 피드백 카드 표출.
  - `MyWalkHistoryView.tsx` 연동:
    - 산책 기록 목록 각 카드에 `[🗺️ 지도 보기]` 버튼 추가 및 터치 시 `WalkRecordDetailModal` 상세 지도 모달 오픈.

### 📋 세부 작업 TODO
- [x] 산책 기록 상세 화면/모달 구현 (`frontend/src/components/walk/WalkRecordDetailModal.tsx`)
  - [x] 기록에 저장된 `gpsTrack`/`coordinates` 기반 `MapLibreMapView` LineString 경로 렌더링
  - [x] `poopEvents` (대변 `💩`, 소변 `💧`) 위치 지도 마커 레이어 오버레이
  - [x] 출발지(🚩) 및 도착지(🏁) 핀 표출
  - [x] 마커 범례, 4대 보행 지표, 피드백 카드 렌더링
- [x] 산책 기록 관리 연동 (`frontend/src/components/profile/MyWalkHistoryView.tsx`)
  - [x] 목록 아이템에 `[🗺️ 지도 보기]` 버튼 추가 및 모달 열기/닫기 이벤트 연동
- [x] 단위 테스트 작성 및 통과
  - [x] `WalkRecordDetailModal.test.tsx` 5건 단위 테스트 통과
  - [x] `MyWalkHistoryView.test.tsx` 지도 보기 버튼 연동 테스트 통과
  - [x] `tsc --noEmit` 무결점 통과
  - [x] 전체 61개 테스트 파일 (349개 테스트) 100% 통과

---

## 5. 🟡 [완료] Issue #130: 산책 기록 누적에 따른 목록 관리

- **이슈 링크**: [#130](https://github.com/haru2014/pet_walk_t01/issues/130) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  산책 기록이 지속적으로 쌓일 때 목록 화면이 과도하게 길어지는 문제 방지. 최근 1주일간의 기록을 기본 노출하고, 기간별 필터링(최근 7일/30일/전체)과 과거 기록 더보기(페이징) 제공.
- **수정 결과**:
  - `walkStatisticsService.ts`:
    - `WalkStatisticsService.filterRecordsByPeriod(records, period, now)` 구현: 선택된 기간('7days' | '30days' | 'all')에 맞춰 기록을 필터링하고 최신순(내림차순) 정렬 보장.
    - `getPeriodStats`와 동기화하여 지표와 목록의 기간 일치 보장.
  - `MyWalkHistoryView.tsx`:
    - 상단 필터 칩(`[최근 7일] [최근 30일] [전체 기록]`) 클릭 시 목록이 즉시 연동 필터링되도록 개선.
    - 기본 5건 우선 노출 후, 초과 시 `[과거 기록 더보기 ▾ (+N건 남음)]` 버튼으로 점진적 페이징 지원.
    - 선택 기간 내 기록이 없을 경우 깔끔한 Empty 안내 카드(`emptyPeriodBox`) 표출.
    - 상단 타이틀에 현재 필터 건수 및 전체 누적 건수 병기 (`최근 7일 5회 / 누적 24회`).

### 📋 세부 작업 TODO
- [x] `frontend/src/services/walkStatisticsService.ts`
  - [x] `filterRecordsByPeriod(records, '7days' | '30days' | 'all')` 유틸 함수 구현
  - [x] 최신순 정렬 및 'week' / 'month' 별칭 호환
- [x] `frontend/src/components/profile/MyWalkHistoryView.tsx`
  - [x] 기본 보기: 최근 1주일 필터 기본 적용
  - [x] 페이징 지원: 기본 5건 노출 + `[과거 기록 더보기 ▾]` 버튼
  - [x] 기간 필터 변경 시 페이징 카운트 리셋 및 즉시 목록 갱신
  - [x] 기간 Empty 상태 카드 UI 추가
- [x] 단위 테스트 작성 및 통과
  - [x] `walkStatisticsService.test.ts` 기간별 필터링 및 최신순 정렬 테스트 통과
  - [x] `MyWalkHistoryView.test.tsx` 페이징(더보기) 및 Empty 상태 테스트 2건 추가 (총 7건 통과)
  - [x] `tsc --noEmit` 무결점 통과
  - [x] 전체 61개 테스트 파일 (352개 테스트) 100% 통과

---

## 🚀 전체 할당 이슈 완료 현황 요약

- **#117** (P0 버그): 코스 공유 실패 시 완료 오안내 처리 완료 (`communityApi.ts`, `WalkReportScreen.tsx`)
- **#127** (P0 버그): TTS 남성 음성 선택 시 여성 음색 출력 버그 수정 (`ttsNavigation.ts`, `voiceSettings.ts`)
- **#128** (P1 UX): 산책 성과 지표 중심 개편 및 CSV/JSON 접이식 아코디언 위계 조정 (`MyWalkHistoryView.tsx`)
- **#129** (P1 기능): 산책 기록의 지도 시각화 (실제 GPS 경로 + 배변/소변 마커) (`WalkRecordDetailModal.tsx`)
- **#130** (P1 기능): 산책 기록 누적에 따른 목록 관리 (최근 1주일 우선 + 페이징 더보기) (`MyWalkHistoryView.tsx`, `walkStatisticsService.ts`)
