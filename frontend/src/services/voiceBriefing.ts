/** 서버 응답과 온디바이스 폴백 모두 화면·TTS로 전달하기 전에 정제한다. */
export function sanitizeVoiceBriefing(value?: string | null): string | null {
  const blocked = ['탈진', '화상', '열사병', '관절염', '슬개골', '수술', '질병'];
  if (value && blocked.some((word) => value.includes(word))) {
    return '발바닥이 편안한 길에서 여유롭게 산책하고, 필요하면 시원한 곳에서 쉬어 주세요.';
  }
  return value ?? null;
}
