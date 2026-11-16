# Financial services

A mobile-friendly personal finance MVP in Arabic and English: salary and payday,
fixed commitments, expenses, remaining salary, outing budgets, in-app alerts,
and an optional OpenRouter decision guide.

## Data and privacy

- Budget data is stored in Supabase and tied to a signed, HTTP-only browser
  cookie. There is no account or cross-device sync; clearing the cookie removes
  access to that browser's saved profile.
- Supabase service credentials stay on the API server. The browser never receives
  a service-role or secret key, and the tables keep row-level security enabled.
- Amounts are stored as integer fils: **1 KD = 1,000 fils**.
- Expense names are not sent to OpenRouter. AI conversations are not persisted.

## AI credit protection

The API server atomically reserves each guide request in Supabase before
contacting OpenRouter. Daily and lifetime counters survive restarts and multiple
API instances. Missing or unavailable protection blocks the AI request.

| Server variable | Default |
| --- | --- |
| `GUIDE_DAILY_REQUEST_LIMIT` | `100` attempts per UTC calendar day |
| `GUIDE_TOTAL_REQUEST_LIMIT` | `1000` lifetime attempts |

Caps must be non-negative integers; zero pauses new attempts. The lifetime
counter does not reset. Provider failures, cancellations, and timeouts still
consume an attempt because the provider may already have incurred a charge.
Automatic provider retries are disabled.

These are **request caps, not dollar caps**. For an additional monetary ceiling,
configure a dedicated key's credit limit in OpenRouter. Short-term per-process
request and concurrency limits also remain in place. No payments are included.

## Replit setup

Keep `SUPABASE_URL`, `supa_sec` (or another server-only Supabase service key),
`SESSION_SECRET`, and `open_sec` in Replit Secrets. Never use a `VITE_` prefix
or commit secret values. Run the existing API Server and Financial services
workflows.

## Checks

```sh
pnpm run typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server verify:supabase
```

Offline tests use fake providers and quota stores and do not call OpenRouter.
The Supabase verification uses zero request caps, confirms the live counters
do not change, and never calls OpenRouter.

## Safe GitHub upload

Do not push this workspace's original Git history: it contains previously
committed environment configuration. The export script prepares a clean
snapshot with fresh history, removes Replit environment tables, and checks for
recognized credentials:

```sh
node scripts/src/prepare-github-export.mjs
```

It does not create a remote or push. Publish only to a repository whose
visibility you explicitly chose, and never copy real secrets into exported
files.
