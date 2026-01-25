import type {
  LoginDto,
  RegisterDto,
  RefreshDto,
  AuthBundle,
  Tokens,
  SafeUser,
  MePayload,
  LogoutResult,
} from "@satoru-satoshi/summarize-api-sdk";

// Re-export SDK types for convenience
export type {
  LoginDto as LoginReqType,
  RegisterDto as RegisterReqType,
  RefreshDto as RefreshReqType,
  AuthBundle as AuthBundleType,
  Tokens as TokensType,
  SafeUser as SafeUserType,
  MePayload as MePayloadType,
  LogoutResult as LogoutResultType,
};
