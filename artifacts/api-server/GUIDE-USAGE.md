# Decision guide request limits

Supabase stores the shared lifetime and daily request counters. The browser never
receives the Supabase service key. Redis is not used.

## Required configuration

The API server reads the existing Replit Secrets:

- `SUPABASE_URL`
- `supa_sec` (or `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`)

Keep the service key server-side. Do not use a `VITE_` prefix or commit a key.
The API server fails closed with HTTP 503 if Supabase cannot reserve usage.

Optional server environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `GUIDE_DAILY_REQUEST_LIMIT` | `100` | Provider attempts per UTC calendar day |
| `GUIDE_TOTAL_REQUEST_LIMIT` | `1000` | Provider attempts over the lifetime of the counter |

Caps must be non-negative safe integers. Zero pauses new AI requests. Provider
failures, timeouts, and cancellations still consume an attempt because the
provider may already have incurred a charge. Automatic provider retries are off.
Increasing the lifetime cap extends the existing allowance; the counter does
not reset on restart or at midnight UTC.

The API also keeps short-lived per-process protections: 20 requests per minute,
8 per caller per minute, and 3 active requests per instance. These are not shared
across instances; the durable daily and lifetime caps are.

These are **request caps, not dollar caps**. For a monetary ceiling, set a credit
limit on a dedicated OpenRouter key as well. The endpoint is public, so someone
can consume the configured request allowance. No payments or key changes are
made by the app.

## Verification

Run `pnpm --filter @workspace/api-server test` for offline tests. They use a fake
provider and fake quota RPC and do not call OpenRouter or Supabase.

Run `pnpm --filter @workspace/api-server verify:supabase` to test the real
Supabase quota function with both caps set to zero. It verifies fail-closed
behavior and confirms that the live request counters do not increase. It never
calls OpenRouter.
