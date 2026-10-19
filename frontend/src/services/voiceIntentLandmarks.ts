/** 음성 입력용 거점 매핑. 알 수 없는 장소는 다른 공원으로 대체하지 않는다. */
export const LANDMARK_TO_PARK_ID: Record<string, string> = {
  유림공원: 'yurim', 유림: 'yurim', 갑천: 'yurim',
  세종호수공원: 'sejong', 세종호수: 'sejong', 호수공원: 'sejong',
  송강공원: 'songgang', 송강근린공원: 'songgang', 송강: 'songgang',
  도안공원: 'doan', 도안호수공원: 'doan', 도안: 'doan',
};

const PARK_IDS: Record<string, string> = {
  yurim: 'yurim', daejeon_yulim: 'yurim',
  sejong: 'sejong', sejong_lake: 'sejong',
  songgang: 'songgang', daejeon_songgang: 'songgang',
  doan: 'doan', daejeon_doan: 'doan',
};

export function normalizeToFrontendParkId(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  const namedPark = /([가-힣A-Za-z]+공원)/.exec(value);
  if (namedPark) return LANDMARK_TO_PARK_ID[namedPark[1]] ?? null;
  return PARK_IDS[value] ?? LANDMARK_TO_PARK_ID[value] ?? null;
}

export function extractVoiceLandmark(text: string): string | null {
  const namedPark = /([가-힣A-Za-z]+공원)(?:에서|으로|에|을|를|\s|$)/.exec(text);
  if (namedPark) return namedPark[1];
  return Object.keys(LANDMARK_TO_PARK_ID)
    .sort((a, b) => b.length - a.length).find((key) => text.includes(key)) ?? null;
}

export function unsupportedParkMessage(landmark: string): string {
  return `${landmark}은 아직 지원하지 않는 공원이에요. 지원 공원이나 현재 위치를 선택해 주세요.`;
}
