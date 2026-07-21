// Auth Request DTOs
export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

export interface RefreshDto {
  refreshToken: string;
}

// Auth Response Types
export interface SafeUser {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthBundle {
  user: SafeUser;
  tokens: Tokens;
}

export interface MePayload {
  user: SafeUser;
}

export interface LogoutResult {
  success: boolean;
}
