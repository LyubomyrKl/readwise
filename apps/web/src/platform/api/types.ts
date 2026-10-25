/** Auth shapes shared with the API (apps/api/src/platform/auth/auth.models.ts). */

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthBundle {
  user: SafeUser;
  tokens: Tokens;
}
