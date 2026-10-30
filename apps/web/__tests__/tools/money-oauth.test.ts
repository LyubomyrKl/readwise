import { denyUrl, parseAuthorizeRequest, redirectHost } from "@tools/money/lib/oauth";

const valid = {
  response_type: "code",
  client_id: "client-1",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  state: "st ate",
  code_challenge: "abc123",
  code_challenge_method: "S256",
  scope: "money:read",
  resource: "https://money.example/api/money/claude/mcp",
};

const params = (over: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...valid, ...over })) if (v !== undefined) q.set(k, v);
  return q;
};

describe("Claude connector OAuth request", () => {
  it("accepts a well-formed request and maps it to the API body", () => {
    expect(parseAuthorizeRequest(params())).toEqual({
      ok: true,
      request: {
        clientId: "client-1",
        redirectUri: "https://claude.ai/api/mcp/auth_callback",
        codeChallenge: "abc123",
        codeChallengeMethod: "S256",
        state: "st ate",
        scope: "money:read",
        resource: "https://money.example/api/money/claude/mcp",
      },
    });
  });

  it("leaves the optional fields out when absent", () => {
    const check = parseAuthorizeRequest(params({ state: undefined, scope: undefined, resource: "" }));
    expect(check.ok && check.request).toEqual({
      clientId: "client-1",
      redirectUri: "https://claude.ai/api/mcp/auth_callback",
      codeChallenge: "abc123",
      codeChallengeMethod: "S256",
    });
  });

  it.each([
    ["response_type", { response_type: "token" }],
    ["missing response_type", { response_type: undefined }],
    ["plain PKCE", { code_challenge_method: "plain" }],
    ["missing PKCE method", { code_challenge_method: undefined }],
    ["missing code_challenge", { code_challenge: undefined }],
    ["missing redirect_uri", { redirect_uri: undefined }],
    ["bad redirect_uri", { redirect_uri: "not a url" }],
    ["missing client_id", { client_id: undefined }],
  ])("rejects %s", (_label, over) => {
    expect(parseAuthorizeRequest(params(over)).ok).toBe(false);
  });

  it("shows the redirect host", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHost("nope")).toBeNull();
  });

  it("sends Deny back only to Claude's callbacks", () => {
    expect(denyUrl("https://claude.ai/api/mcp/auth_callback", "a&b")).toBe(
      "https://claude.ai/api/mcp/auth_callback?error=access_denied&state=a%26b"
    );
    expect(denyUrl("https://claude.com/api/mcp/auth_callback")).toBe("https://claude.com/api/mcp/auth_callback?error=access_denied");
    expect(denyUrl("https://evil.example/api/mcp/auth_callback", "s")).toBeNull();
    expect(denyUrl("https://claude.ai/api/mcp/auth_callback?x=1", "s")).toBeNull();
  });
});
