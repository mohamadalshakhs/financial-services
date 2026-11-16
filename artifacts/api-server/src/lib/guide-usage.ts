import { createHmac } from "node:crypto";

const WINDOW_MS = 60_000;
const GLOBAL_PER_MINUTE = 20;
const CALLER_PER_MINUTE = 8;
const MAX_ACTIVE = 3;

export type UsageDecision =
  | { allowed: true; release: () => Promise<void> }
  | {
      allowed: false;
      error: "RATE_LIMITED" | "DAILY_LIMIT_REACHED" | "USAGE_LIMIT_REACHED";
      retryAfter?: number;
    };

export interface UsageLimiter {
  reserve(caller: string): Promise<UsageDecision>;
}

type UsageRpc = (args: { p_daily_limit: number; p_total_limit: number }) => Promise<unknown>;

function requestCap(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid guide request cap");
  }
  return Number(value);
}

export function usageConfig(env: NodeJS.ProcessEnv = process.env) {
  const rawUrl = env.SUPABASE_URL;
  const apiKey = (
    env.SUPABASE_SERVICE_ROLE_KEY ??
    env.SUPABASE_SECRET_KEY ??
    env.supa_sec
  )?.trim();
  if (!rawUrl || !apiKey) throw new Error("Supabase usage protection is not configured");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Supabase usage protection is not configured");
  }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Supabase usage protection is not configured");
  }

  return {
    url: url.origin,
    apiKey,
    daily: requestCap(env.GUIDE_DAILY_REQUEST_LIMIT, 100),
    total: requestCap(env.GUIDE_TOTAL_REQUEST_LIMIT, 1000),
  };
}

async function reserveInSupabase(
  config: ReturnType<typeof usageConfig>,
  args: { p_daily_limit: number; p_total_limit: number },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/reserve_financial_ai_usage`, {
      method: "POST",
      redirect: "error",
      headers: {
        apikey: config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw new Error("Supabase usage protection is unavailable");
  }
  if (!response.ok) throw new Error("Supabase usage protection is unavailable");
  try {
    return await response.json();
  } catch {
    throw new Error("Supabase usage protection returned an invalid response");
  }
}

export function createUsageLimiter(
  env: NodeJS.ProcessEnv = process.env,
  testRpc?: UsageRpc,
  now: () => number = Date.now,
): UsageLimiter {
  let windowStart = now();
  let requestsInWindow = 0;
  let activeRequests = 0;
  const callers = new Map<string, number>();

  return {
    async reserve(caller) {
      const config = usageConfig(env);
      const current = now();
      if (current - windowStart >= WINDOW_MS) {
        windowStart = current;
        requestsInWindow = 0;
        callers.clear();
      }

      const digest = createHmac("sha256", config.apiKey).update(caller).digest("hex");
      const callerCount = callers.get(digest) ?? 0;
      if (requestsInWindow >= GLOBAL_PER_MINUTE ||
          callerCount >= CALLER_PER_MINUTE ||
          activeRequests >= MAX_ACTIVE) {
        const retryAfter = activeRequests >= MAX_ACTIVE
          ? 5
          : Math.max(1, Math.ceil((WINDOW_MS - (current - windowStart)) / 1000));
        return { allowed: false, error: "RATE_LIMITED", retryAfter };
      }

      requestsInWindow++;
      callers.set(digest, callerCount + 1);
      activeRequests++;
      let result: unknown;
      try {
        const args = {
          p_daily_limit: config.daily,
          p_total_limit: config.total,
        };
        result = testRpc ? await testRpc(args) : await reserveInSupabase(config, args);
      } catch {
        activeRequests--;
        throw new Error("Supabase usage protection is unavailable");
      }

      const row = Array.isArray(result) ? result[0] : result;
      if (!row || typeof row !== "object" || !("allowed" in row) ||
          typeof row.allowed !== "boolean") {
        activeRequests--;
        throw new Error("Supabase usage protection returned an invalid response");
      }
      const admission = row as {
        allowed: boolean;
        error?: unknown;
        retry_after?: unknown;
      };
      if (!admission.allowed) {
        activeRequests--;
        if (admission.error === "DAILY_LIMIT_REACHED") {
          const retryAfter = admission.retry_after;
          if (typeof retryAfter !== "number" || !Number.isSafeInteger(retryAfter) ||
              retryAfter < 1 || retryAfter > 86400) {
            throw new Error("Supabase usage protection returned an invalid response");
          }
          return { allowed: false, error: "DAILY_LIMIT_REACHED", retryAfter };
        }
        if (admission.error === "USAGE_LIMIT_REACHED") {
          return { allowed: false, error: "USAGE_LIMIT_REACHED" };
        }
        throw new Error("Supabase usage protection returned an invalid response");
      }

      let released = false;
      return {
        allowed: true,
        release: async () => {
          if (released) return;
          released = true;
          activeRequests--;
        },
      };
    },
  };
}
