/** Auth shapes shared with the API (apps/api/src/platform/auth/auth.models.ts). */

export interface LoginDto {
  email: string;
  password: string;
  /** authenticator app code, when the second factor is on */
  code?: string;
}

/** Codes the API puts on a 401 from /auth/login when the authenticator app is on. */
export type LoginErrorCode = "TOTP_REQUIRED" | "TOTP_INVALID";

export interface SecondFactorStatus {
  totpEnabled: boolean;
  passkeys: { id: string; name: string | null; createdAt: string; lastUsedAt: string | null }[];
}

export interface TotpSetup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
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
