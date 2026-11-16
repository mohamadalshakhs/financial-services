// Verifies the real quota RPC without consuming an OpenRouter request.
import assert from "node:assert/strict";
import { createUsageLimiter, usageConfig } from "../src/lib/guide-usage.ts";

async function readUsage(config) {
  const url = new URL("/rest/v1/financial_ai_usage", config.url);
  url.search = new URLSearchParams({
    select: "total,daily",
    id: "eq.decision-guide",
    limit: "1",
  }).toString();
  const response = await fetch(url, {
    headers: {
      apikey: config.apiKey,
      Authorization: `Bearer ${config.apiKey}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Usage verification failed");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Usage verification failed");
  return rows[0]
    ? { total: Number(rows[0].total), daily: Number(rows[0].daily) }
    : { total: 0, daily: 0 };
}

async function verify() {
  try {
    const config = usageConfig();
    const before = await readUsage(config);
    const guard = createUsageLimiter({
      ...process.env,
      GUIDE_DAILY_REQUEST_LIMIT: "0",
      GUIDE_TOTAL_REQUEST_LIMIT: "0",
    });
    const blocked = await guard.reserve("verification");
    assert.deepEqual(blocked, { allowed: false, error: "USAGE_LIMIT_REACHED" });
    const after = await readUsage(config);
    assert.deepEqual(after, before, "a blocked verification must not consume usage");
    console.log("Supabase quota RPC connected and blocked a zero-cap request without changing counters. No AI call.");
  } catch {
    console.error("Supabase quota verification failed. Check server secrets and the database migration. No credentials were printed.");
    process.exitCode = 1;
  }
}

void verify();
