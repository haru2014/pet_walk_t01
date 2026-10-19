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
| **[#128](https://github.com/haru2014/pet_walk_t01/issues/128)** | 🟡 P1 (UX) | **산책 완료 후 내보내기 기능의 사용자 접근성 개선** | `@kululu81` | 10/19 | ⏳ 다음 진행 예정 |
| **[#129](https://github.com/haru2014/pet_walk_t01/issues/129)** | 🟡 P1 (기능) | **산책 기록의 지도 시각화 (실제 이동 경로 및 배변 마킹)** | `@kululu81` | 10/19 | ⏳ 대기 중 |
| **[#130](https://github.com/haru2014/pet_walk_t01/issues/130)** | 🟡 P1 (기능) | **산책 기록 누적에 따른 목록 관리 (최근 1주일 우선/과거 조회)** | `@kululu81` | 10/19 | ⏳ 대기 중 |

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

## 3. 🟡 Issue #128: 산책 완료 후 내보내기 기능의 사용자 접근성 개선

- **이슈 링크**: [#128](https://github.com/haru2014/pet_walk_t01/issues/128) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  산책 완료 모달에서 일반 사용자에게 생소한 CSV/JSON 파일 내보내기 버튼이 전면에 강조되어 사용성이 저하됨. 일반 사용자가 자신의 산책 활동 내역(이동 거리, 소요 시간, 소모 칼로리, 배변 횟수)을 직관적으로 확인하고 감상할 수 있도록 카드 UI 우선 배치.

### 📋 세부 작업 TODO
- [ ] `frontend/src/components/walk/WalkCompletionModal.tsx` UI 개편
  - [ ] 최상단: 산책 성과 요약 카드 (총 거리, 시간, 평균 속도, 배변 횟수, 획득 뱃지) 시각화 강화
  - [ ] [지도에서 내 산책 경로 보기] 메인 액션 버튼을 최우선 CTA로 배치
  - [ ] CSV 내보내기 및 JSON 백업 버튼은 하단 접이식(`고급 데이터 내보내기 ▾`) 또는 보조 링크로 위계 조정
- [ ] 단위 테스트 보강
  - [ ] `WalkCompletionModal.test.tsx` 렌더링 검증

---

## 4. 🟡 Issue #129: 산책 기록의 지도 시각화 (경로 및 배변 마킹)

- **이슈 링크**: [#129](https://github.com/haru2014/pet_walk_t01/issues/129) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  산책 완료 후 실제 이동한 GPS 경로(LineString)를 지도 위에 시각화하고, 산책 중 기록한 배변(대변/소변) 위치를 지도 마커(아이콘)로 표시. 산책 기록 목록에서 특정 기록을 탭했을 때 상세 지도 화면으로 전환.

### 📋 세부 작업 TODO
- [ ] 산책 기록 상세 화면/모달 구현 (`frontend/src/components/walk/WalkRecordDetailModal.tsx` 또는 신규 컴포넌트)
  - [ ] 기록에 저장된 `coordinates: [lon, lat][]` 기반 `RouteMapView` 또는 `MapLibreMapView` 경로 렌더링
  - [ ] `poopLocations: { lat, lon, type: 'pee' | 'poop', timestamp }[]` 마커 레이어 오버레이
  - [ ] 출발지(초록 마커) 및 도착지(빨간 마커) 핀 표출
- [ ] 산책 기록 관리 연동 (`frontend/src/screens/WalkHistoryScreen.tsx` 또는 `HomeScreen.tsx`)
  - [ ] 목록 아이템 터치 시 상세 지도 모달/뷰 열기 이벤트 연동
- [ ] 단위 테스트 작성 및 통과
  - [ ] `WalkRecordDetailModal.test.tsx` 렌더링 및 마커 표출 검증

---

## 5. 🟡 Issue #130: 산책 기록 누적에 따른 목록 관리

- **이슈 링크**: [#130](https://github.com/haru2014/pet_walk_t01/issues/130) (부모 이슈 [#124](https://github.com/haru2014/pet_walk_t01/issues/124))
- **작성자**: `@kululu81` (조현정)
- **핵심 내용**:
  산책 기록이 지속적으로 쌓일 때 홈 화면이나 목록 화면이 과도하게 길어지는 문제 방지. 최근 1주일간의 기록을 기본 노출하고, 주간 단위 묶음/날짜별 필터 및 과거 기록 더보기(페이징) 제공.

### 📋 세부 작업 TODO
- [ ] `frontend/src/services/walkStatisticsService.ts` / `storage.ts`
  - [ ] `filterRecordsByPeriod(records, 'week' | 'month' | 'all')` 필터 유틸 함수 추가
  - [ ] 최근 7일(1주일) 기본 필터링 로직 구현
- [ ] `frontend/src/components/walk/WalkRecordListView.tsx` (또는 홈 화면 위젯)
  - [ ] 기본 보기: "최근 1주일 산책 기록" (최신순 최대 5~7건 노출)
  - [ ] 필터 탭 또는 버튼: `[최근 1주일] [이번 달] [전체 기록]`
  - [ ] 주간 단위 접기/펼치기 아코디언 또는 날짜 그룹핑 지원
- [ ] 단위 테스트 작성 및 통과
  - [ ] `walkStatisticsService.test.ts` 기간별 필터링 단위 테스트 추가

---

## 🚀 권장 작업 순서 및 마일스톤

1. **Step 1 (P0 버그 신속 해결):**
   - **#117** 공유 실패 처리 버그 수정 (`communityApi.ts`)
   - **#127** 음성 안내 남성/여성 성별 음색 불일치 수정 (`voiceSettings.ts`)
2. **Step 2 (P1 산책 완료 및 시각화 개선):**
   - **#128** 산책 완료 모달 내보내기 위계 조정 및 활동 성과 중심 개편 (`WalkCompletionModal.tsx`)
   - **#129** 산책 기록 상세 지도 시각화 (실제 보행 경로 + 배변 위치 마커)
3. **Step 3 (P1 기록 누적 목록 관리):**
   - **#130** 최근 1주일 우선 표시 및 주간/월간 기간별 필터링 기능 구현
