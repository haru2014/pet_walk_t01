/**
 * [편안하개 - PetWalk]
 * Supabase Auth, Storage (pet-photos), DB (dog_profiles, walk_records) 클라이언트 서비스 (US-G2)
 *
 * - Supabase Auth 이메일/비밀번호 가입 및 로그인 (CBT Confirm email OFF)
 * - pet-photos 비공개 보관함 사진 업로드 (`<user_id>/...` RLS 정책 준수)
 * - dog_profiles 및 walk_records(is_public 공개 후기 토글) 실시간 연동
 * - 서버 미연결/오프라인 시 무중단 Local-First 시뮬레이션 자동 지원
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthSession, AuthUser, DogProfileRemote, WalkRecordRemote } from '../types/auth';
import { WalkRecord } from '../types/storage';
import { LocalStorageService } from './storage';
import { generateUuid, isUuid } from '../utils/uuid';
import { fetchWithServerFallback } from './apiClient';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_KEY || '';
const SESSION_KEY = '@편안하개:auth_session';

/** 후기 공개/해제 결과. 실패하면 이유(code)와 사용자에게 보여 줄 문구(message)를 담는다. */
export type WalkShareResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

const WALK_SHARE_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: '로그인이 필요해요. 로그인한 뒤 다시 시도해 주세요.',
  AUTH_INVALID: '로그인 정보가 만료됐어요. 다시 로그인해 주세요.',
  WALK_NOT_FOUND: '계정에 아직 저장되지 않은 산책 기록이라 공개할 수 없어요.',
  ROUTE_TOO_SHORT_TO_MASK: '산책길이 짧아 집 근처 위치를 보호하고 나면 공유할 길이 남지 않아요.',
  INVALID_ROUTE: '공개할 수 있는 경로가 아니에요.',
  WALK_SPEED_TOO_FAST: '평균 속도가 너무 빨라 산책 기록으로 공개할 수 없어요. 이동 수단이 섞였거나 GPS가 튄 기록일 수 있어요.',
  INVALID_WALK_ID: '산책 기록을 확인할 수 없어 공개하지 못했어요.',
  DB_NOT_CONNECTED: '지금은 서버가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.',
  WALK_SHARE_DB_ERROR: '산책 기록을 커뮤니티에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
  WALK_SHARE_FAILED: '산책 기록을 공개하는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
  HTTP_500: '서버가 산책 기록 공개 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
  HTTP_502: '공개 서버가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.',
  HTTP_503: '공개 서버가 준비되지 않았어요. 잠시 후 다시 시도해 주세요.',
  HTTP_504: '공개 서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.',
  NETWORK: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
};
// Render가 절전 상태에서 깨어나는 시간(운영 상태 확인에서 약 17초)을 포함한다.
const WALK_SHARE_TIMEOUT_MS = 60000;

function walkShareFailure(code: string): WalkShareResult {
  return { ok: false, code, message: WALK_SHARE_MESSAGES[code] ?? '지금은 공개 설정을 바꿀 수 없어요. 잠시 후 다시 시도해 주세요.' };
}

function resolveWalkRemoteId(record: WalkRecord): string {
  if (isUuid(record.remoteId)) return record.remoteId;
  if (isUuid(record.id)) return record.id;
  return generateUuid();
}

class SupabaseServiceManager {
  private readonly client: SupabaseClient | null = null;
  private currentSession: AuthSession | null = null;
  private hasCloudAuthSession = false;

  constructor() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            storage: AsyncStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
          },
        });
      } catch (e) {
        console.warn('[SupabaseService] 클라이언트 초기화 실패 (로컬 모드 유지):', e);
      }
    }
  }

  private async fetchCloudSession(): Promise<AuthSession | null> {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.auth.getSession();
      if (!error && data.session?.user) {
        return {
          user: {
            id: data.session.user.id,
            email: data.session.user.email ?? '',
          },
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        };
      }
    } catch (error) {
      console.warn('[SupabaseService] 클라우드 로그인 세션 복원 실패:', error);
    }
    return null;
  }

  private async refreshSavedSession(saved: AuthSession): Promise<AuthSession | null> {
    if (!this.client || !saved.refreshToken) return null;
    try {
      const { data, error } = await this.client.auth.setSession({
        access_token: saved.accessToken,
        refresh_token: saved.refreshToken,
      });
      if (!error && data.session?.user) {
        return {
          user: {
            id: data.session.user.id,
            email: data.session.user.email ?? saved.user.email,
          },
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        };
      }
    } catch (error) {
      console.warn('[SupabaseService] 저장된 로그인 세션 갱신 실패:', error);
    }
    return null;
  }

  async initSession(): Promise<AuthSession | null> {
    const cloudSession = await this.fetchCloudSession();
    if (cloudSession) {
      this.currentSession = cloudSession;
      this.hasCloudAuthSession = true;
      await LocalStorageService.setItem(SESSION_KEY, cloudSession);
      return cloudSession;
    }
    if (this.client) this.hasCloudAuthSession = false;

    if (this.currentSession && !this.client) return this.currentSession;
    const saved = await LocalStorageService.getItem<AuthSession>(SESSION_KEY) ?? this.currentSession;
    if (saved) {
      const refreshed = await this.refreshSavedSession(saved);
      if (refreshed) {
        this.currentSession = refreshed;
        this.hasCloudAuthSession = isUuid(refreshed.user.id);
        await LocalStorageService.setItem(SESSION_KEY, refreshed);
        return refreshed;
      }
      this.currentSession = saved;
    }
    return this.currentSession;
  }

  getWalkShareAccess(): { readonly ok: true } | { readonly ok: false; readonly code: 'CLOUD_NOT_CONFIGURED' | 'AUTH_REQUIRED' | 'CLOUD_ACCOUNT_REQUIRED'; readonly message: string } {
    if (!this.client) {
      return { ok: false, code: 'CLOUD_NOT_CONFIGURED', message: '지금은 산책 기록을 공유할 수 없어요. 잠시 후 다시 시도해 주세요.' };
    }
    if (!this.currentSession || !this.hasCloudAuthSession) {
      if (this.currentSession && (!isUuid(this.currentSession.user.id) || this.currentSession.accessToken.startsWith('local_token_'))) {
        return { ok: false, code: 'CLOUD_ACCOUNT_REQUIRED', message: '체험용 계정으로 이용 중이에요. 회원 계정으로 로그인한 뒤 다시 시도해 주세요.' };
      }
      return { ok: false, code: 'AUTH_REQUIRED', message: '로그인이 필요해요. 회원 계정으로 로그인한 뒤 다시 시도해 주세요.' };
    }
    if (!isUuid(this.currentSession.user.id) || !this.currentSession.accessToken || this.currentSession.accessToken.startsWith('local_token_')) {
      return { ok: false, code: 'CLOUD_ACCOUNT_REQUIRED', message: '실제 회원 계정으로 로그인한 뒤 산책 기록을 공유해 주세요.' };
    }
    return { ok: true };
  }

  getSession(): AuthSession | null {
    return this.currentSession;
  }

  getCurrentUser(): AuthUser | null {
    return this.currentSession?.user ?? null;
  }

  getAccessToken(): string | null {
    return this.currentSession?.accessToken ?? null;
  }

  async signUp(email: string, password: string): Promise<{ user: AuthUser | null; error?: string }> {
    if (this.client) {
      try {
        const { data, error } = await this.client.auth.signUp({ email, password });
        if (error) return { user: null, error: error.message };
        if (data.user) {
          const authUser: AuthUser = { id: data.user.id, email: data.user.email ?? email };
          const session: AuthSession = { user: authUser, accessToken: data.session?.access_token ?? 'token_' + Date.now() };
          this.currentSession = session;
          this.hasCloudAuthSession = Boolean(data.session?.access_token && isUuid(authUser.id));
          await LocalStorageService.setItem(SESSION_KEY, session);
          return { user: authUser };
        }
      } catch (err: any) {
        return { user: null, error: err.message || '가입 중 오류가 발생했습니다.' };
      }
    }

    // 로컬 시뮬레이션 모드 (CBT 오프라인 지원)
    const mockUser: AuthUser = { id: 'usr_' + Date.now(), email, createdAt: new Date().toISOString() };
    const mockSession: AuthSession = { user: mockUser, accessToken: 'local_token_' + Date.now() };
    this.currentSession = mockSession;
    this.hasCloudAuthSession = false;
    await LocalStorageService.setItem(SESSION_KEY, mockSession);
    return { user: mockUser };
  }

  async signIn(email: string, password: string): Promise<{ user: AuthUser | null; error?: string }> {
    if (this.client) {
      try {
        const { data, error } = await this.client.auth.signInWithPassword({ email, password });
        if (error) return { user: null, error: error.message };
        if (data.user && data.session) {
          const authUser: AuthUser = { id: data.user.id, email: data.user.email ?? email };
          const session: AuthSession = {
            user: authUser,
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          };
          this.currentSession = session;
          this.hasCloudAuthSession = true;
          await LocalStorageService.setItem(SESSION_KEY, session);
          return { user: authUser };
        }
      } catch (err: any) {
        return { user: null, error: err.message || '로그인 중 오류가 발생했습니다.' };
      }
    }

    const mockUser: AuthUser = { id: 'usr_' + Date.now(), email, createdAt: new Date().toISOString() };
    const mockSession: AuthSession = { user: mockUser, accessToken: 'local_token_' + Date.now() };
    this.currentSession = mockSession;
    this.hasCloudAuthSession = false;
    await LocalStorageService.setItem(SESSION_KEY, mockSession);
    return { user: mockUser };
  }

  async getDogProfiles(): Promise<DogProfileRemote[]> {
    const user = this.getCurrentUser();
    if (!this.client || !user || !isUuid(user.id)) return [];

    const { data, error } = await this.client
      .from('dog_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw new Error('계정의 반려견 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return (data ?? []) as DogProfileRemote[];
  }

  async signOut(): Promise<void> {
    if (this.client) {
      try {
        await this.client.auth.signOut();
      } catch {
        // 무시
      }
    }
    this.currentSession = null;
    this.hasCloudAuthSession = false;
    await LocalStorageService.removeItem(SESSION_KEY);
  }

  async uploadPetPhoto(userId: string, fileName: string, fileData: Blob | Uint8Array | string): Promise<{ photoPath: string }> {
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const photoPath = `${userId}/${cleanFileName}`;

    if (this.client && typeof fileData !== 'string') {
      try {
        const { error } = await this.client.storage.from('pet-photos').upload(photoPath, fileData, {
          upsert: true,
        });
        if (!error) return { photoPath };
      } catch (e) {
        console.warn('[SupabaseService] 사진 업로드 실패 (로컬 경로 유지):', e);
      }
    }

    return { photoPath };
  }

  async saveDogProfile(profile: Partial<DogProfileRemote> & { name: string }): Promise<DogProfileRemote> {
    const user = this.getCurrentUser();
    const userId = user?.id ?? 'guest_user';
    const remote: DogProfileRemote = {
      // DB 의 id 칸은 UUID 만 받는다 (backend/sql/README.md 약속 1번). 폰에서 정한 id 가 있으면 그대로 쓴다.
      id: profile.id ?? generateUuid(),
      user_id: userId,
      name: profile.name,
      breed: profile.breed,
      age_years: profile.age_years ?? 3,
      weight_kg: profile.weight_kg ?? 5.5,
      joint_care_level: profile.joint_care_level ?? 1,
      speed_kmh: profile.speed_kmh ?? 2.8,
      photo_path: profile.photo_path,
      is_primary: profile.is_primary ?? true,
      updated_at: new Date().toISOString(),
    };

    if (this.client) {
      // 로그인 전이거나 옛 형식(dog_123) id 는 DB 가 거절하므로 보내지 않고 폰에만 둔다 (약속 2번).
      if (!user || !isUuid(user.id) || !isUuid(remote.id)) {
        console.warn('[SupabaseService] dog_profiles 동기화 건너뜀: 로그인 전이거나 id 가 UUID 형식이 아님 (로컬 유지)');
        return remote;
      }
      try {
        // supabase-js 는 실패해도 throw 하지 않고 { error } 를 돌려준다 (약속 5번).
        const { error } = await this.client.from('dog_profiles').upsert(remote);
        if (error) {
          console.warn(`[SupabaseService] dog_profiles 저장 실패 (로컬 유지): ${error.message}`);
        }
      } catch (e) {
        console.warn('[SupabaseService] dog_profiles 동기화 실패 (로컬 유지):', e);
      }
    }
    return remote;
  }

  async deleteDogProfile(dogId: string): Promise<boolean> {
    const user = this.getCurrentUser();
    // Guest/local profiles and legacy non-UUID IDs have no server row to delete.
    if (!this.client || !user || !isUuid(user.id) || !isUuid(dogId)) return true;

    try {
      const { error } = await this.client
        .from('dog_profiles')
        .delete()
        .eq('id', dogId)
        .eq('user_id', user.id);
      if (error) {
        console.warn(`[SupabaseService] dog_profiles 삭제 실패: ${error.message}`);
        return false;
      }
      return true;
    } catch (error) {
      console.warn('[SupabaseService] dog_profiles 삭제 중 오류:', error);
      return false;
    }
  }

  async createWalkRecord(record: Partial<WalkRecordRemote> & { distance_m: number; duration_min: number }): Promise<WalkRecordRemote> {
    const user = this.getCurrentUser();
    const userId = user?.id ?? 'guest_user';
    const newRecord: WalkRecordRemote = {
      id: record.id ?? generateUuid(),
      user_id: userId,
      dog_id: record.dog_id,
      course_id: record.course_id,
      started_at: record.started_at ?? new Date().toISOString(),
      ended_at: record.ended_at ?? new Date().toISOString(),
      distance_m: record.distance_m,
      duration_min: record.duration_min,
      route_coords: record.route_coords ?? [],
      photo_paths: record.photo_paths ?? [],
      note: record.note ?? '',
      rating: record.rating ?? 5,
      is_public: record.is_public ?? false,
      created_at: new Date().toISOString(),
    };

    if (this.client) {
      if (!user || !isUuid(user.id) || !isUuid(newRecord.id)) {
        console.warn('[SupabaseService] walk_records 동기화 건너뜀: 로그인 전이거나 id 가 UUID 형식이 아님 (로컬 유지)');
        return newRecord;
      }
      // DB 로는 앱이 쓸 수 있는 칸만 보낸다. is_public·public_route_coords 는 서버(공개 API)만 쓰고,
      // created_at 은 DB 가 정한다. 이 칸들은 값이 false/null 이어도 이름이 들어 있으면 DB 가 권한 오류로 거절한다. (이슈 #116)
      // dog_id 는 DB 의 개 프로필(UUID)을 가리키는 연결이다. 옛 형식이면 연결 없이 저장한다.
      const payload = {
        id: newRecord.id,
        user_id: newRecord.user_id,
        dog_id: isUuid(newRecord.dog_id) ? newRecord.dog_id : undefined,
        course_id: newRecord.course_id,
        started_at: newRecord.started_at,
        ended_at: newRecord.ended_at,
        distance_m: newRecord.distance_m,
        duration_min: newRecord.duration_min,
        route_coords: newRecord.route_coords,
        photo_paths: newRecord.photo_paths,
        note: newRecord.note,
        rating: newRecord.rating,
      };
      try {
        const { error } = await this.client.from('walk_records').insert(payload);
        if (error) {
          console.warn(`[SupabaseService] walk_records 저장 실패 (로컬 유지): ${error.message}`);
        }
      } catch (e) {
        console.warn('[SupabaseService] walk_records 저장 실패 (로컬 유지):', e);
      }
    }
    return newRecord;
  }

  private async findOwnedCloudDogId(userId: string, dogId?: string): Promise<string | undefined> {
    if (!this.client || !isUuid(dogId)) return undefined;
    const dogProfile = await this.client
      .from('dog_profiles')
      .select('id')
      .eq('id', dogId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!dogProfile.error && dogProfile.data?.id) {
      return String(dogProfile.data.id);
    }
    return undefined;
  }

  private async handleSyncInsertRetry(
    findRemoteRecord: () => Promise<any>,
    insertedError: any
  ): Promise<string> {
    const retry = await findRemoteRecord();
    if (retry.error || !retry.data?.id) {
      console.warn('[SupabaseService] 산책 기록 공유용 동기화 실패:', {
        code: insertedError.code,
        message: insertedError.message,
        details: insertedError.details,
        hint: insertedError.hint,
      });
      if (insertedError.code === '23503') {
        throw new Error('산책 기록과 연결된 반려견 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      throw new Error('산책 기록을 계정에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    const retryId = String(retry.data.id);
    if (!isUuid(retryId)) {
      throw new Error('산책 기록을 확인할 수 없어 공개하지 못했어요.');
    }
    return retryId;
  }

  /** Ensure a locally saved walk has a cloud row and return its UUID for sharing. */
  async ensureWalkRecordSynced(record: WalkRecord): Promise<string> {
    const user = this.getCurrentUser();
    const access = this.getWalkShareAccess();
    if (!access.ok || !user || !this.client) {
      throw new Error(access.ok ? '로그인 정보를 확인한 뒤 다시 시도해 주세요.' : access.message);
    }

    const remoteId = resolveWalkRemoteId(record);

    const findRemoteRecord = async () => this.client!
      .from('walk_records')
      .select('id')
      .eq('id', remoteId)
      .eq('user_id', user.id)
      .maybeSingle();

    const existing = await findRemoteRecord();
    if (existing.error) {
      throw new Error('산책 기록을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (existing.data?.id) {
      const existingId = String(existing.data.id);
      if (!isUuid(existingId)) {
        throw new Error('산책 기록을 확인할 수 없어 공개하지 못했어요.');
      }
      return existingId;
    }

    const cloudDogId = await this.findOwnedCloudDogId(user.id, record.dogId);

    const payload = {
      id: remoteId,
      user_id: user.id,
      ...(cloudDogId ? { dog_id: cloudDogId } : {}),
      started_at: record.startedAt,
      ended_at: record.completedAt,
      distance_m: Math.round(record.totalDistanceKm * 1000),
      duration_min: record.durationMinutes,
      route_coords: record.gpsTrack.map(({ lat, lon }) => [lon, lat] as [number, number]),
      note: record.feedback?.comment ?? '',
      rating: record.feedback?.comfortScore ?? 5,
    };
    const inserted = await this.client.from('walk_records').insert(payload);
    if (inserted.error) {
      return this.handleSyncInsertRetry(findRemoteRecord, inserted.error);
    }
    if (!isUuid(remoteId)) {
      throw new Error('산책 기록 번호를 생성하지 못했어요. 다시 시도해 주세요.');
    }
    return remoteId;
  }

  /**
   * 산책 기록 후기 공개/해제. 서버(POST /api/v1/walks/{id}/share|unshare)가 로그인 토큰과 소유자를 확인하고,
   * 출발·도착 200m 를 가린 좌표만 공개한다. 앱이 DB 의 is_public 을 직접 바꾸지 않는다. (이슈 #116)
   * 실패하면 성공으로 속이지 않고 이유를 돌려준다.
   */
  async setWalkRecordPublic(recordId: string, isPublic: boolean): Promise<WalkShareResult> {
    if (!isUuid(recordId)) return walkShareFailure('INVALID_WALK_ID');
    const walkId = recordId.toLowerCase();
    const token = this.currentSession?.accessToken;
    if (!token) return walkShareFailure('AUTH_REQUIRED');
    try {
      const response = await fetchWithServerFallback(
        `/api/v1/walks/${walkId}/${isPublic ? 'share' : 'unshare'}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
        WALK_SHARE_TIMEOUT_MS
      );
      if (response.ok) return { ok: true };
      const body = await response.json().catch(() => ({}));
      let code: string;
      if (typeof body?.detail?.code === 'string') {
        code = body.detail.code;
      } else if (response.status === 401) {
        code = 'AUTH_INVALID';
      } else {
        code = `HTTP_${response.status}`;
      }
      console.warn('[SupabaseService] 산책 공개 서버 오류:', { status: response.status, code });
      return walkShareFailure(code);
    } catch (e) {
      console.warn('[SupabaseService] 후기 공개 요청 실패:', e);
      return walkShareFailure('NETWORK');
    }
  }
}

export const SupabaseService = new SupabaseServiceManager();
