/**
 * [편안하개 - PetWalk]
 * Supabase Auth, Dog Profiles, Walk Records DTO (US-G2, backend/sql/supabase_auth_schema.sql)
 */

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly createdAt?: string;
}

export interface AuthSession {
  readonly user: AuthUser;
  readonly accessToken: string;
  readonly refreshToken?: string;
}

export interface DogProfileRemote {
  id: string;
  user_id: string;
  name: string;
  breed?: string;
  age_years?: number;
  weight_kg?: number;
  joint_care_level: number;
  speed_kmh: number;
  photo_path?: string; // pet-photos/<user_id>/...
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface WalkRecordRemote {
  id: string;
  user_id: string;
  dog_id?: string;
  course_id?: string;
  started_at: string;
  ended_at?: string;
  distance_m: number;
  duration_min: number;
  route_coords?: [number, number][];
  photo_paths?: string[];
  note?: string;
  rating?: number;
  is_public: boolean;
  created_at?: string;
}
