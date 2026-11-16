# Financial services

An Arabic personal finance MVP for newly employed people, focused on social spending and pressure to join outings.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- AI requires `OPENROUTER_API_KEY` or the user's existing `open_sec` Replit Secret, server-side only.
- The API server stores each browser's salary settings and expenses in Supabase. A signed, HTTP-only browser cookie identifies the profile; clearing cookies loses access, and there is no account or cross-device sync yet.
- Supabase service credentials are used only by the API server. The browser never receives a service-role or secret key; RLS remains enabled with no public table policies.
- Shared daily and lifetime AI request limits are reserved atomically in Supabase before OpenRouter is called. Request caps are not dollar caps; see `artifacts/api-server/GUIDE-USAGE.md` for setup and charge-free checks.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Use direct OpenRouter access with the user's own key, not Replit's OpenAI proxy.
- AI conversations remain in page memory; only a message, recent history, and budget numbers are sent for guidance. No expense names are needed.
- Keep demo finances separate from AI responses: the assistant cannot mutate money, expenses, or settings.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Work in small, runnable steps and explain simply. The user has now asked to connect Supabase for app data. Do not enable anonymous sign-in, publish, or push to GitHub without a new request.
- Keep both Arabic (RTL) and English (LTR) available, with light and dark appearance options.
- Use Kuwaiti dinars (KD / د.ك), with three decimal places (1000 fils = 1 dinar). Demo face values are not FX-converted.
- The MVP is limited to salary payment date, expense entry, remaining salary, alerts, AI decision guidance, an outings budget limit, and a dashboard. Investment guidance is future vision, not current scope.
- The requested tools are Replit for development and hosting, GitHub for code, and Supabase for data/backend. Vercel is not needed; do not use it. Do not substitute a different database. Redis was cancelled and must not be reintroduced.
- Family profiles have no password and each has a separate budget. New profiles start with no financial data and must be set up by the user; never copy legacy browser budgets into them. Existing saved profiles are not reset. Profiles are scoped to the signed browser cookie, not verified identities or private accounts, and do not sync across devices.
- Supabase URL and service-role/secret keys belong in server-side environment variables, never hardcoded or sent to the browser.
- The user requested a private GitHub repository named `financial-services` and a sanitized snapshot with no secrets. Do not publish/deploy without a separate request.
- No Vercel configuration is needed. No payments are in scope; if requested later, Stripe must stay in test mode.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
