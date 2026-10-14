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
import { AuthSession, AuthUser, DogProfileRemote, WalkRecordRemote } from '../types/auth';
import { LocalStorageService } from './storage';
import { generateUuid, isUuid } from '../utils/uuid';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SESSION_KEY = '@편안하개:auth_session';

class SupabaseServiceManager {
  private readonly client: SupabaseClient | null = null;
  private currentSession: AuthSession | null = null;

  constructor() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      } catch (e) {
        console.warn('[SupabaseService] 클라이언트 초기화 실패 (로컬 모드 유지):', e);
      }
    }
  }

  async initSession(): Promise<AuthSession | null> {
    if (this.currentSession) return this.currentSession;
    const saved = await LocalStorageService.getItem<AuthSession>(SESSION_KEY);
    if (saved) {
      this.currentSession = saved;
    }
    return this.currentSession;
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
          const session: AuthSession = { user: authUser, accessToken: data.session.access_token };
          this.currentSession = session;
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
    await LocalStorageService.setItem(SESSION_KEY, mockSession);
    return { user: mockUser };
  }

  async signOut(): Promise<void> {
    if (this.client) {
      try {
        await this.client.auth.signOut();
      } catch (_e) {
        // 무시
      }
    }
    this.currentSession = null;
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
      // dog_id 는 DB 의 개 프로필(UUID)을 가리키는 연결이다. 옛 형식이면 연결 없이 저장한다.
      const payload = { ...newRecord, dog_id: isUuid(newRecord.dog_id) ? newRecord.dog_id : undefined };
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

  async toggleWalkRecordPublic(recordId: string, isPublic: boolean): Promise<boolean> {
    if (this.client) {
      try {
        const { error } = await this.client
          .from('walk_records')
          .update({ is_public: isPublic })
          .eq('id', recordId);
        if (!error) return true;
      } catch (e) {
        console.warn('[SupabaseService] is_public 업데이트 실패:', e);
      }
    }
    return true;
  }
}

export const SupabaseService = new SupabaseServiceManager();
