# AI Execution Guide: Integrating Page Agent with indofun-aigc-v1.8

This document is written for a future AI coding agent. Follow it as an execution contract, not as a loose idea list.

## Objective

Build a controlled Page Agent proof of concept inside:

```text
/Users/indofun/Developer/indofun-aigc-v1.8/integration
```

The POC should add an authenticated in-page assistant that can help a normal user operate the v1.8 UI, while keeping LLM credentials server-side and blocking sensitive content/actions.

## Non-goals

- Do not replace the existing OpenClaw integration under `/api/openclaw/*`.
- Do not integrate Chrome extension or MCP in the first implementation.
- Do not expose Page Agent on wallet-admin, users, settings, or destructive admin workflows.
- Do not enable `experimentalScriptExecutionTool`.
- Do not put real LLM API keys in frontend code, HTML, localStorage, or checked-in config.
- Do not use the public demo LLM endpoint for production-like testing.

## Repositories

Source project:

```text
/Users/indofun/Developer/page-agent
```

Target project:

```text
/Users/indofun/Developer/indofun-aigc-v1.8/integration
```

The v1.8 parent directory contains multiple worktrees. Treat `integration` as the runtime validation target unless the user explicitly chooses another v1.8 worktree.

## Current Page Agent Facts

- Package version observed: `1.10.0`.
- `packages/page-agent/src/PageAgent.ts` creates `PageController` and `Panel`.
- `PageAgentCore.execute()` runs observe -> LLM -> macro tool -> DOM action loops.
- Built-in tools include `done`, `wait`, `ask_user`, `click_element_by_index`, `input_text`, `select_dropdown_option`, `scroll`, `scroll_horizontally`, and optional `execute_javascript`.
- `execute_javascript` is removed unless `experimentalScriptExecutionTool` is true.
- `PageController.updateTree()` automatically blacklists elements matching `[data-page-agent-not-interactive]`.
- The implementation default for `viewportExpansion` is `-1`, which means full-page extraction. Set `viewportExpansion: 0` explicitly for v1.8 POC.
- Production docs recommend backend LLM proxy plus `customFetch` credentials.

## Current v1.8 Facts

- Frontend is static HTML/CSS/JS, no runtime frontend build requirement.
- Frontend structure:
  - `web/index.html`
  - `web/js/app.js`
  - `web/js/core/*`
  - `web/js/features/*`
  - `web/styles/app.css`
- Architecture rule: `web/js/app.js` should stay as bootstrap/controller wiring. New frontend behavior belongs in `web/js/features/*` with matching tests.
- Backend is Express under `server/src/index.js`.
- Authenticated routes use `requireAuth` and `requireActiveAccount`.
- Existing OpenClaw page is implemented by `web/js/features/agent.js` and `server/src/routes/openclaw.js`.
- Integration runtime convention is port `4800`.

## Recommended Implementation Shape

Add a new feature, not a rewrite:

```text
web/js/features/pageAgentAssistant.js
web/pageAgentAssistant.test.cjs
server/src/routes/pageAgent.js
server/src/routes/pageAgent.test.js
```

Wire it through:

```text
web/index.html
web/js/app.js
web/js/core/state.js
server/src/index.js
server/.env.example
.env.docker.example
README.md or DEPLOY.md if config is user-facing
```

Use existing project style:

- Browser modules use IIFE helpers on `window.AppX`.
- Unit tests use Node `test` and CommonJS `.test.cjs` for frontend helpers.
- Keep `app.js` minimal: import `createPageAgentAssistantController`, instantiate it, and pass dependencies.

## Frontend Contract

Create:

```js
root.AppPageAgentAssistant = {
  createPageAgentAssistantController,
};
```

Controller responsibilities:

1. Check server feature status, e.g. `GET /api/page-agent/status`.
2. Render or reveal an assistant entry only when enabled.
3. Load the self-hosted Page Agent script with `autoInit=false`, or initialize after script is already present.
4. Instantiate `new window.PageAgent(...)`.
5. Use a backend proxy:

```js
baseURL: '/api/page-agent/llm-proxy',
apiKey: 'NA',
customFetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
```

6. Set strict config:

```js
language: 'zh-CN',
maxSteps: 20,
enableMask: true,
viewportExpansion: 0,
experimentalScriptExecutionTool: false,
transformPageContent: maskVodAigcPageContent,
interactiveBlacklist: resolvePageAgentBlockedElements(),
instructions: { system: PAGE_AGENT_SYSTEM_INSTRUCTIONS },
```

7. Block or hide the assistant on views:

```text
admin
wallet-admin
users
settings
```

8. Require confirmation before submitting generation tasks. Prefer `ask_user` / panel confirmation or stop at a pre-submit state in the POC.

## Backend Contract

Add route:

```js
app.use('/api/page-agent', requireAuth, requireActiveAccount, pageAgentRouter);
```

Minimum endpoints:

```text
GET  /api/page-agent/status
POST /api/page-agent/llm-proxy/chat/completions
```

Environment variables:

```text
PAGE_AGENT_ENABLED=0
PAGE_AGENT_LLM_BASE_URL=
PAGE_AGENT_LLM_MODEL=
PAGE_AGENT_LLM_API_KEY=
PAGE_AGENT_MAX_REQUEST_BYTES=200000
PAGE_AGENT_TIMEOUT_MS=60000
```

Proxy rules:

- Return disabled status when `PAGE_AGENT_ENABLED !== "1"`.
- Require authenticated active user through route mounting.
- Forward only to the configured LLM base URL.
- Override `model` server-side with `PAGE_AGENT_LLM_MODEL`; do not trust browser-provided model for the POC.
- Inject `Authorization: Bearer ${PAGE_AGENT_LLM_API_KEY}` server-side.
- Enforce request size and timeout.
- Log owner, request size, model, status, latency, and error class. Do not log full prompts by default.
- Strip or reject browser-supplied `Authorization` headers.

## Sensitive Data Rules

The frontend `transformPageContent` must mask at least:

- JWT-like tokens and bearer strings.
- Emails.
- Phone numbers.
- API keys and secret-looking values.
- COS signed URLs or query strings containing signatures.
- Request IDs if they are internal debugging values.
- Wallet entries and balances outside coarse summary text.

The DOM blacklist must exclude:

- `[data-page-agent-not-interactive]`
- wallet adjustment buttons/forms
- user create/disable/delete/reset-password controls
- admin settings controls
- API key inputs
- delete/batch-delete buttons
- payment/refund/recharge confirmation controls

If the target markup does not have stable selectors, add `data-page-agent-not-interactive` and feature-specific `data-page-agent-blocked="..."` markers.

## Self-hosted Page Agent Asset

Preferred POC options:

1. Build Page Agent IIFE from the source repo and copy the resulting browser asset into v1.8 under a vendor path.
2. Or install/use the npm package in a controlled build step if v1.8 later gains frontend build tooling.

Do not load the public demo CDN in production-like v1.8 testing. If using the current IIFE demo asset only to expose `window.PageAgent`, load it with `?autoInit=false` and override all runtime config.

## Tests To Add

Frontend tests:

- `pageAgentAssistant` initializes only when enabled.
- It refuses to initialize when `window.PageAgent` is missing and surfaces a visible error.
- `maskVodAigcPageContent` masks emails, phones, bearer tokens, signed URLs, and wallet-sensitive lines.
- `resolvePageAgentBlockedElements` includes dangerous controls and `[data-page-agent-not-interactive]`.
- `app.js` only wires the controller and does not contain implementation-heavy helper functions.
- `index.html` loads the assistant feature before `app.js`.

Backend tests:

- Disabled status when `PAGE_AGENT_ENABLED` is off.
- LLM proxy rejects unauthenticated requests through existing auth wiring if route-level test helpers exist.
- LLM proxy injects server-side model and authorization.
- LLM proxy rejects oversized payloads.
- LLM proxy times out cleanly.
- LLM proxy does not forward browser-supplied `Authorization`.

## Manual Validation

Run in target project:

```bash
cd /Users/indofun/Developer/indofun-aigc-v1.8/integration
```

Suggested checks:

```bash
node web/pageAgentAssistant.test.cjs
node server/src/routes/pageAgent.test.js
node web/frontendStructure.test.cjs
```

If broader impact is possible, run the existing relevant test set for frontend structure, auth, OpenClaw, and server routes.

Runtime validation:

1. Start v1.8 integration on its normal port.
2. Login as a normal creator user.
3. Confirm assistant appears only on allowed views.
4. Ask it to navigate to the creation page and fill a harmless prompt.
5. Confirm it stops before final submit or asks for confirmation.
6. Inspect the LLM proxy request server-side; verify sensitive values are masked.
7. Switch to admin/wallet/settings views and confirm dangerous controls are not available to Page Agent.
8. Set `PAGE_AGENT_ENABLED=0`, restart, and confirm the entry disappears and proxy is disabled.

## Rollback

Rollback should be configuration-first:

```text
PAGE_AGENT_ENABLED=0
```

Then restart the v1.8 server/container. The feature should have no database migration and no required persistent state in the POC.

If code rollback is needed, revert only the Page Agent files and script tags introduced by this integration.

## Acceptance Criteria

The first implementation is acceptable only when:

- No LLM API key is visible in frontend source, HTML, localStorage, or browser responses.
- Normal creator workflow can be assisted without admin access.
- Dangerous admin/wallet/account/system actions are blocked.
- Sensitive page content is masked before LLM proxy calls.
- Existing OpenClaw agent page still works.
- Existing v1.8 frontend structure tests still pass.
- The feature can be fully disabled by environment variable.
