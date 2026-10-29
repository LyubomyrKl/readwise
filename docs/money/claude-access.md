# Claude's access to money

Claude reads the ledger through a token you create and can revoke at any time:
**Settings → Money → Claude**. A token is shown once; only its SHA-256 is stored.

| Scope | Claude can |
|---|---|
| Read | answer from live data: net worth, this month, any month, allocation, accounts, transactions, positions, drafts |
| Read and propose | older tokens only: the same, and propose movements as drafts (the web no longer shows drafts; new tokens are read only) |

Both the MCP server and the REST API sit at `/api/money/claude/*`, the only API path Caddy
routes past the web app. Every write a token makes is in the audit log as `token:<id>`.

## The Claude app (claude.ai, desktop, mobile): custom connector

Claude's apps connect from Anthropic's cloud and sign in with OAuth, so a token
is never pasted into a chat. Set `MONEY_CLAUDE_PUBLIC_URL` to the public base
URL Tailscale Funnel serves (e.g. `https://<host>.ts.net:8443`) and publish only
these paths there: `/api/money/claude`, `/.well-known/oauth-authorization-server`,
`/.well-known/oauth-protected-resource`, `/api/money/oauth/token`,
`/api/money/oauth/register`. Everything else, including the approval page
(`/apps/money/connect`), stays on the private address.

In claude.ai: Settings → Connectors → Add custom connector → the MCP URL shown
under **Settings → Money → Claude** (`<public URL>/api/money/claude/mcp`). Claude
registers itself, your browser opens the approval page in Workbench (you must be
on the tailnet and signed in), and after **Allow** Claude holds a read token
named "Claude connector", revocable in the same list. Codes are single use, live
five minutes, need PKCE (S256) and Claude's callback
(`https://claude.ai/api/mcp/auth_callback`); nothing else can register.

Hardening: Caddy answers those public paths only for `MONEY_CLAUDE_ALLOWED_IPS`
(default: Anthropic's ranges `160.79.104.0/21` and `2607:6bc0::/48`, and the tailnet; Caddy logs every call to those paths), working
out the client strictly from what Tailscale forwards. A connector token lives a
day and Claude renews it with a refresh token (rotated each time, 30 days from the
last renewal); revoking ends both. The list shows when and from where each token
was last used.

## MCP server

`POST https://<your site>/api/money/claude/mcp`, Streamable HTTP, stateless, JSON responses,
with `Authorization: Bearer mny_…`.

Tools: `get_summary` (start here: the three answers at once), `get_month`, `get_monthly`,
`get_net_worth`, `get_allocation`, `list_accounts`, `list_categories`, `list_transactions`,
`get_positions`, `list_drafts`; with a draft token also `propose_movement`.

Claude Code:

```bash
claude mcp add --transport http money https://<your site>/api/money/claude/mcp --header "Authorization: Bearer mny_…"
```

The Claude API (MCP connector), in TypeScript:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
  fallbacks: "default", // a declined request is re-run on Anthropic's recommended model
  mcp_servers: [
    {
      type: "url",
      url: "https://<your site>/api/money/claude/mcp",
      name: "money",
      authorization_token: process.env.MONEY_TOKEN,
    },
  ],
  tools: [{ type: "mcp_toolset", mcp_server_name: "money" }],
  messages: [{ role: "user", content: "What's my savings rate this month?" }],
});

if (response.stop_reason === "refusal") {
  console.error("Declined:", response.stop_details?.explanation);
} else {
  for (const block of response.content) {
    if (block.type === "text") console.log(block.text);
  }
}
```

## REST API

The same answers as plain JSON, with the same bearer token:

| Endpoint | Answers |
|---|---|
| `GET /api/money/claude/summary?base=EUR` | net worth, this month (income, expenses, invested, savings rate), allocation, drafts waiting |
| `GET /api/money/claude/month/2026-10` | one month with income and expenses by category |
| `GET /api/money/claude/monthly?from=2026-01&to=2026-10` | each month of a range |
| `GET /api/money/claude/net-worth?asOf=2026-09-30` | by account, currency and class |
| `GET /api/money/claude/allocation` | each class against its target |
| `GET /api/money/claude/accounts`, `/categories`, `/positions`, `/drafts` | the lists |
| `GET /api/money/claude/transactions?from=…&to=…&q=…` | newest first, `nextCursor` → `before` |
| `POST /api/money/claude/drafts` | `{ "kind": "expense", "input": { … } }`, draft tokens only |

Amounts are exact decimal strings with their currency (`"1234.50 PLN"`); totals are in the
base currency of your settings unless `base` names another, converted for display only.
