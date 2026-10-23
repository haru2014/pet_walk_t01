/**
 * [편안하개 - PetWalk]
 * 탄력적 멀티 타깃 API 클라이언트 (US-F1, US-G1, US-A1)
 *
 * 1순위: Render 배포 서버 (EXPO_PUBLIC_API_URL 또는 https://pet-walk-t01-z095.onrender.com)
 * 2순위: 로컬 FastAPI 개발 서버 (http://127.0.0.1:8000)
 * 3순위: 양쪽 모두 실패 시 호출자(Service)가 오프라인 안전 폴백(Fallback) 수행
 */

export const RENDER_API_BASE_URL = 'https://pet-walk-t01-z095.onrender.com';
export const LOCAL_API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * 1순위 기본 API 베이스 URL 반환 (환경 변수 또는 Render 배포 서버)
 */
export function getPrimaryApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  // 구 Render 주소(pet-walk-t01.onrender.com)가 설정된 경우 실제 배포 인스턴스(-z095)로 자동 보정
  if (envUrl === 'https://pet-walk-t01.onrender.com' || envUrl === 'http://pet-walk-t01.onrender.com') {
    return RENDER_API_BASE_URL;
  }
  return envUrl || RENDER_API_BASE_URL;
}

/**
 * 2순위 로컬 폴백 API 베이스 URL 반환
 * (단, 1순위가 이미 127.0.0.1/localhost인 경우 불필요한 중복 호출 방지를 위해 null 반환)
 */
export function getFallbackApiBaseUrl(): string | null {
  const primary = getPrimaryApiBaseUrl();
  if (primary.includes('127.0.0.1') || primary.includes('localhost')) {
    return null;
  }
  return LOCAL_API_BASE_URL;
}

/**
 * 백엔드 서버(Render 콜드 스타트 대응) 비동기 사전 웜업
 */
export function warmupBackendServer(): void {
  const primary = getPrimaryApiBaseUrl();
  if (primary?.startsWith('http')) {
    fetch(`${primary}/health`).catch(() => {});
  }
}

/**
 * 타임아웃 지원 fetch 래퍼 (Render 콜드 스타트 10~15초 대응을 위해 기본 15초)
 */
async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // 상위에서 전달된 AbortSignal이 있다면 연동
  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () => controller.abort());
    }
  }

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Render 우선 연결 후 장애/타임아웃 시 127.0.0.1 로컬 백엔드로 자동 폴백하는 탄력적 fetch
 */
export async function fetchWithServerFallback(
  endpoint: string,
  init?: RequestInit,
  primaryTimeoutMs = 15000,
  fallbackTimeoutMs = 2000
): Promise<Response> {
  const primaryBase = getPrimaryApiBaseUrl();
  const fallbackBase = getFallbackApiBaseUrl();

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  let primaryFailed = false;
  let primaryResponse: Response | null = null;

  // 1순위 시도: Render 서버 (또는 EXPO_PUBLIC_API_URL)
  try {
    const res = await fetchWithTimeout(`${primaryBase}${cleanEndpoint}`, init, primaryTimeoutMs);
    // 500~504 등 서버 오류 또는 게이트웨이 다운 상태일 때는 2순위 로컬 백엔드로 시도 허용
    if (res && res.status >= 500 && res.status <= 504 && fallbackBase) {
      primaryFailed = true;
    } else if (res) {
      return res;
    } else {
      primaryFailed = true;
    }
  } catch {
    primaryFailed = true;
  }

  // 1순위 실패이고 2순위 로컬 백엔드가 설정되어 있는 경우 시도
  if (primaryFailed && fallbackBase) {
    try {
      const fbRes = await fetchWithTimeout(`${fallbackBase}${cleanEndpoint}`, init, fallbackTimeoutMs);
      if (fbRes) {
        return fbRes;
      }
    } catch {
      // 로컬 백엔드마저 실패한 경우 아래에서 throw하여 호출자 서비스가 오프라인 폴백 처리
    }
  }

  if (primaryResponse) {
    return primaryResponse;
  }

  throw new Error(`[apiClient] All API endpoints failed: primary(${primaryBase}), fallback(${fallbackBase ?? 'none'})`);
}
