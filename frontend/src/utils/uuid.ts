/**
 * [편안하개 - PetWalk]
 * UUID(v4) 생성·검사 유틸 (US-G2, backend/sql/README.md 약속 1번)
 *
 * - Supabase `dog_profiles.id`, `walk_records.id` 는 UUID 형식만 받는다.
 *   ('dog_' + Date.now() 같은 글자 id 는 DB 가 400 으로 거절한다.)
 * - 폰(Local-First)에 저장하는 id 와 DB id 를 같은 값으로 쓰기 위해 앱에서 만든다.
 * - 새 라이브러리 없이 동작: crypto.randomUUID 가 있으면 사용, 없으면(일부 RN 환경) 대체 생성.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function generateUuid(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  // 대체 경로: 보안 용도가 아니라 "겹치지 않는 번호표" 용도이므로 Math.random 으로 충분하다.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
