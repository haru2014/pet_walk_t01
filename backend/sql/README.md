# 편안하개 DB 약속 문서 (Data Contract)

> 작성: 3번 노희선 (DB 담당) · 대상: 앱·서버에서 Supabase 표를 읽고 쓰는 모든 사람
> 이 문서는 `supabase_schema.sql`, `supabase_auth_schema.sql` 을 **SQL을 안 읽어도** 이해하도록 풀어 쓴 것입니다.
> 기준이 되는 진실은 SQL 파일입니다. 둘이 다르면 SQL이 맞고, 이 문서를 고쳐 주세요.

## 0. 먼저 지킬 약속 5개

| # | 약속 | 어기면 |
|---|---|---|
| 1 | **`id` 는 UUID** (예: `3f2a9c1e-7b4d-4f6a-9d2e-1a8b5c0d7e44`). `dog_123` 같은 글자 금지 | DB가 `400 invalid input syntax for type uuid` 로 거절 |
| 2 | **`user_id` 는 로그인 계정 번호** (`supabase.auth.getUser()` 의 `user.id`, UUID). 로그인 전에는 저장하지 않는다 | 로그인 계정과 다르면 보안 규칙(RLS)이 거절 |
| 3 | 사진 파일은 **Storage `pet-photos` 보관함의 `<user_id>/…` 폴더**에만 올린다 | 다른 폴더는 보안 규칙이 거절 |
| 4 | 표에는 사진 **파일 자체가 아니라 경로(문자열)** 만 저장한다 | - |
| 5 | **저장이 실패하면 사용자에게 알린다.** 오류를 조용히 삼키지 않는다 (`const { error } = await …` 의 `error` 확인) | 화면은 정상인데 DB는 비어 있는 "조용한 실패" |

> supabase-js 는 실패해도 예외(throw)를 던지지 않고 `{ error }` 를 돌려줍니다. `try/catch` 만으로는 못 잡습니다.

## 1. `dog_profiles` (개 프로필) — 앱이 직접 읽고 씀 (RLS: 본인 것만)

| 칸 | 형식 | 필수 | 누가 채우나 | 규칙·예시 |
|---|---|:---:|---|---|
| `id` | UUID | ✅ | **앱이 생성해서 보냄** | 폰에 저장한 개의 id 와 **같은 값**을 DB에도 쓴다 (`crypto.randomUUID()`) |
| `user_id` | UUID | ✅ | 앱 | 로그인 계정 번호 |
| `name` | 글자 ≤30 | ✅ | 앱 | `"코코"` |
| `breed` | 글자 ≤50 | | 앱 | `"말티즈"` |
| `age_years` | 정수 0~30 | | 앱 | `3` |
| `weight_kg` | 소수 (0 초과 120 미만) | | 앱 | `5.5` |
| `joint_care_level` | 정수 0~3 | 기본 1 | 앱 | 0 일반 · 1 주의 · 2 · 3 적극보호 |
| `speed_kmh` | 소수 | 기본 2.8 | 앱 | `2.8` |
| `photo_path` | 글자 | | 앱 | `"<user_id>/coco_profile.jpg"` (Storage 경로) |
| `is_primary` | true/false | 기본 true | 앱 | 한 사람의 여러 마리 중 **대표견 1마리** |
| `created_at`, `updated_at` | 날짜·시각 | 자동 | **DB가 자동** | 앱은 보내지 않아도 됨 |

- **필수는 `id`, `user_id`, `name` 뿐**입니다. 나머지는 나중에 채워도 됩니다.
- 한 사람이 여러 마리 등록 가능. `is_primary = true` 는 한 마리만 두는 것을 권장합니다.

예시 (앱 → Supabase):

```ts
const { error } = await supabase.from('dog_profiles').upsert({
  id: crypto.randomUUID(),          // 처음 만들 때 한 번만. 이후 수정은 같은 id 로 upsert
  user_id: user.id,
  name: '코코',
  breed: '말티즈',
});
if (error) { /* 사용자에게 알림 + 로컬 유지 */ }
```

## 2. `walk_records` (산책 기록, 마이페이지) — 앱이 직접 읽고 씀 (**단, 공개 설정은 서버만**, 아래 ⚠️)

| 칸 | 형식 | 필수 | 누가 채우나 | 규칙·예시 |
|---|---|:---:|---|---|
| `id` | UUID | ✅ | 앱 생성 | `crypto.randomUUID()` |
| `user_id` | UUID | ✅ | 앱 | 로그인 계정 번호 |
| `dog_id` | UUID | | 앱 | `dog_profiles.id` 와 같은 값. **개 프로필이 DB에 먼저 있어야** 합니다 |
| `course_id` | 글자 | | 앱 | 추천 코스로 걸었다면 `"candidate-loop-01"` |
| `started_at` | 날짜·시각 | ✅ | 앱 | ISO 형식 `"2026-10-14T12:00:00Z"` |
| `ended_at` | 날짜·시각 | | 앱 | |
| `distance_m` | 소수 ≥ 0 | ✅ | 앱 | 미터 |
| `duration_min` | 정수 ≥ 0 | ✅ | 앱 | 분 |
| `route_coords` | JSON 배열 | 기본 `[]` | 앱 | **`[[경도, 위도], …]`** 순서 주의 (lon, lat) |
| `photo_paths` | JSON 배열 | 기본 `[]` | 앱 | `["<user_id>/walks/…jpg"]` Storage 경로들 |
| `note` | 글자 | | 앱 | 한 줄 메모 |
| `rating` | 정수 1~5 | | 앱 | 별점 |
| `is_public` | true/false | 기본 **false** | **서버만** | 공개 후기 여부. 앱이 직접 쓰지 못합니다 (DB 권한으로 막음) |
| `public_route_coords` | JSON 배열 | | **서버만** | 공개용 좌표: 서버가 출발·도착 200m 를 가린 `[[경도, 위도], …]`. `is_public=true` 이면 반드시 있어야 합니다 |
| `created_at` | 날짜·시각 | 자동 | **DB가 자동** | |

- **`is_public` 기본은 비공개(false)**. 공개하려면 앱이 서버 API 를 부릅니다 (아래 ⚠️). 사진·메모가 공개되므로 반드시 사용자가 눌렀을 때만 합니다.
- `route_coords` 에는 **출발·도착 200m 마스킹 전의 실제 좌표**가 들어가고 **본인만** 읽을 수 있습니다. 공개 후기에는 이 칸이 나가지 않습니다.

### ⚠️ 후기 공개는 서버만 한다 (이슈 #116, 방식 "가": 마스킹한 좌표만 공개)
행 단위 보안 규칙(RLS)은 **칸 단위로 가릴 수 없어서**, "공개 행은 누구나 읽기" 정책을 두면 원본 경로(집 앞 포함)까지 공개됩니다. 그래서 이렇게 나눴습니다.

| 하는 일 | 누가 | 어떻게 |
|---|---|---|
| 공개 / 해제 | **서버** | `POST /api/v1/walks/{id}/share`, `POST /api/v1/walks/{id}/unshare` (헤더 `Authorization: Bearer <로그인 토큰>`). 서버가 토큰·소유자를 확인하고, 200m 를 가린 좌표를 `public_route_coords` 에 저장 |
| 공개 후기 읽기 | 누구나 | 표가 아니라 **전용 창구(view) `public_walk_reviews_v`** 로만. 원본 좌표·`user_id`·`dog_id`·사진·시각은 없음 |
| 본인 기록 읽기/쓰기 | 앱 | `walk_records` 에 직접. 단 `is_public`, `public_route_coords` 는 **쓰기 권한이 없음** (INSERT/UPDATE 를 칸 단위로만 허용) |

오류 응답(앱이 알려 줄 문구가 있어야 함): `401 AUTH_REQUIRED/AUTH_INVALID`, `404 WALK_NOT_FOUND`(없거나 남의 기록), `422 ROUTE_TOO_SHORT_TO_MASK`(가리면 남는 경로가 없음)/`INVALID_ROUTE`/`INVALID_WALK_ID`, `503 DB_NOT_CONNECTED`.
**주의**: 앱의 산책 기록 목록은 지금 폰 안(로컬)에 저장돼 있어서, 클라우드에 올라가지 않은 기록은 `404`로 공개할 수 없습니다.

**적용 순서**: `supabase_auth_schema.sql` → `supabase_walk_public_migration.sql` (재실행 안전). 이미 쓰는 DB 는 마이그레이션 파일만 실행하면 됩니다.

## 3. 서버가 쓰는 표 (앱은 직접 쓰지 않음)

| 표 | 용도 | 쓰는 곳 | 비고 |
|---|---|---|---|
| `community_courses` | 공유 코스 피드 (200m 마스킹 후) | 서버 `POST /api/v1/community/share` | 공개 읽기만 허용. `user_id` 는 아직 글자(TEXT)이고 로그인 연동 전 (TODO) |
| `hazard_reports` | 현장 위험 제보 | 서버 `POST /api/v1/hazards` | 공개 읽기만 허용 |

## 4. 사진 보관함 `pet-photos` (비공개)

- 경로 규칙: `<user_id>/<파일명>` (프로필), `<user_id>/walks/<파일명>` (산책 사진). **첫 폴더가 반드시 로그인 계정 번호**.
- 보기: 비공개 보관함이라 URL만으로는 안 보입니다. `createSignedUrl(path, 3600)` 처럼 **임시 링크**를 만들어 보여 주세요.
- 파일명에 한글·공백이 있으면 영문·숫자·`._-` 로 바꿔 올리세요.

## 5. 앱 개발자 체크리스트

- [ ] 저장할 때 `id` 를 `crypto.randomUUID()` 로 만들었나? (`'dog_' + Date.now()` 금지)
- [ ] `user_id` 가 로그인한 사용자의 `user.id` 인가? (`'guest_user'` 금지)
- [ ] `const { error }` 를 확인하고 실패를 화면에 알리는가?
- [ ] 사진 경로가 `<user_id>/…` 로 시작하는가?
- [ ] 키: 앱에는 **Publishable key(`sb_publishable_…`)만**. Secret key 는 서버 `.env` 에만.

## 6. 설계 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 2026-10-14 | `id` 는 앱이 UUID 로 생성해서 보냄 (DB 기본값은 유지) | 앱이 Local-First 라서 폰과 DB의 id 를 같은 값으로 두는 것이 대응표가 필요 없어 단순 |
| 2026-10-14 | `dog_profiles` 필수는 이름만 | 가입 직후 부담 최소화, 프로필 화면에서 점진 입력 |
| 2026-10-14 | 한 사람이 여러 마리 가능, 대표견 1마리(`is_primary`) | 다견 가구(US-24) 대비 |
| 2026-10-14 | 산책 기록 기본 비공개 | 사진·메모는 개인정보 |
| 2026-10-19 | 후기 공개는 서버가 200m 마스킹한 좌표만 공개 (방식 "가") | 노희선 결정(개인정보 우선). RLS 는 칸을 못 가려 전용 view + 서버 API + 칸 단위 쓰기 권한으로 강제 (이슈 #116) |

## 7. 검증하는 법 (DB 담당)

서버 `.env` 의 service key 로 표를 직접 읽어 앱이 실제로 저장했는지 확인합니다 (`dog_profiles`, `walk_records` 줄 수와 `user_id` 일치 여부).

## 8. 운영 DB 적용 기록

### 2026-10-23 `supabase_walk_public_migration.sql` 적용 (이슈 #139, #116)

운영 DB 에 이 파일이 적용되어 있지 않아 산책 기록 공유가 저장 단계에서 실패하던 상태였고, 같은 날 SQL Editor 에서 전체를 한 번 실행했습니다. 아래는 적용 전후에 읽기 조회로 직접 확인한 결과입니다.

| 확인 항목 | 적용 전 | 적용 후 |
|---|---|---|
| `walk_records.public_route_coords` 칼럼 | 없음 | 있음 |
| `public_walk_reviews_v` 뷰 | 없음 | 있음 |
| `public_walk_reviews` 정책 (원본 행 공개) | 있음 | 없음 (`own_walk_records` 만 남음) |
| 제약 `walk_records_public_requires_masked` | 없음 | 있음 |
| 앱 계정(`authenticated`) 쓰기 권한 | — | INSERT 12칸, UPDATE 9칸, `is_public`·`public_route_coords` 미포함 |
| `walk_records` 전체 / 공개 줄 수 | 2 / 0 | 2 / 0 (비공개로 바뀐 기록 없음) |

서버(`/health`): `status ok`, `supabase_connected true`, `walk_share_service_role_configured true`. 로그인 없이 `POST /api/v1/walks/{id}/share`, `/unshare` 를 호출하면 401 `AUTH_REQUIRED` 가 돌아옵니다.

**공유 성공 확인 (적용 후)**: 폰 앱에서 6,580m 기록으로 공유를 눌러 "후기 공개 설정 — 커뮤니티 공개 후기로 전환되었어요" 안내가 나왔고(김승현 님 폰 캡처), DB 를 다시 조회하니 그 기록이 `is_public = true`, `public_route_coords` 채워짐으로 바뀌어 있었습니다. 서로 다른 두 곳에서 일치합니다. 나머지 30m 짜리 기록은 비공개이며 마스킹 좌표가 없습니다(출발·도착 200m 를 가리면 남는 경로가 없어 공유가 거절될 수 있음, 이 기록으로는 시험하지 않음).

되돌리기가 필요하면 `supabase_walk_public_migration.sql` 맨 아래 ROLLBACK 블록을 참고하되, 개인정보 보호가 약해지므로 꼭 필요할 때만 실행합니다.
