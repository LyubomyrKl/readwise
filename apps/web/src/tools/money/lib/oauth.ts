/**
 * The OAuth authorization request Claude's custom connector sends to the connect page
 * (authorization code with PKCE). The API checks all of it again; this only decides
 * whether the page shows the Allow/Deny buttons or an error.
 */
import type { OAuthAuthorizeInput } from "../types";

/** The only callbacks a Deny is sent back to; any other redirect_uri just shows "Denied". */
export const CLAUDE_CALLBACKS: readonly string[] = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export type OAuthRequestCheck = { ok: true; request: OAuthAuthorizeInput } | { ok: false; error: string };

type Params = { get(name: string): string | null };

export function parseAuthorizeRequest(params: Params): OAuthRequestCheck {
  const value = (name: string) => {
    const v = params.get(name);
    return v === null || v === "" ? undefined : v;
  };
  const responseType = value("response_type");
  const clientId = value("client_id");
  const redirectUri = value("redirect_uri");
  const codeChallenge = value("code_challenge");
  const codeChallengeMethod = value("code_challenge_method");

  if (responseType !== "code") return { ok: false, error: 'Unsupported response_type: expected "code".' };
  if (!clientId) return { ok: false, error: "The request has no client_id." };
  if (!redirectUri) return { ok: false, error: "The request has no redirect_uri." };
  if (!codeChallenge) return { ok: false, error: "The request has no code_challenge." };
  if (codeChallengeMethod !== "S256") return { ok: false, error: 'Unsupported code_challenge_method: expected "S256".' };
  if (!redirectHost(redirectUri)) return { ok: false, error: "The redirect_uri is not a valid URL." };

  const request: OAuthAuthorizeInput = { clientId, redirectUri, codeChallenge, codeChallengeMethod };
  const state = value("state");
  const scope = value("scope");
  const resource = value("resource");
  if (state !== undefined) request.state = state;
  if (scope !== undefined) request.scope = scope;
  if (resource !== undefined) request.resource = resource;
  return { ok: true, request };
}

/** The host the approval goes back to, shown on the page; null when it is not a URL. */
export function redirectHost(redirectUri: string): string | null {
  try {
    return new URL(redirectUri).host || null;
  } catch {
    return null;
  }
}

/** Where Deny sends the browser, or null when the redirect_uri is not one of Claude's callbacks. */
export function denyUrl(redirectUri: string, state?: string): string | null {
  if (!CLAUDE_CALLBACKS.includes(redirectUri)) return null;
  return `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=access_denied${state ? `&state=${encodeURIComponent(state)}` : ""}`;
}
