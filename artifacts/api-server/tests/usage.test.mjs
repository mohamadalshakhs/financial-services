import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createUsageLimiter, usageConfig } from "../src/lib/guide-usage.ts";
import { createDecisionGuideRouter } from "../src/routes/decision-guide.ts";
import { classifyGuideError } from "../../financial-services/src/lib/guide-error.ts";
import { guideCopy } from "../../financial-services/src/lib/guide-copy.ts";

const baseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "offline-test-key",
  GUIDE_DAILY_REQUEST_LIMIT: "100",
  GUIDE_TOTAL_REQUEST_LIMIT: "1000",
};

function fakeStore() {
  const counters = { total: 0, daily: 0 };
  const rpc = async ({ p_daily_limit, p_total_limit }) => {
    if (counters.total >= p_total_limit) {
      return [{ allowed: false, error: "USAGE_LIMIT_REACHED", retry_after: null }];
    }
    if (counters.daily >= p_daily_limit) {
      return [{ allowed: false, error: "DAILY_LIMIT_REACHED", retry_after: 90 }];
    }
    counters.total++;
    counters.daily++;
    return [{ allowed: true, error: null, retry_after: null }];
  };
  return { counters, rpc };
}

async function admit(limiter, caller = "caller") {
  const result = await limiter.reserve(caller);
  if (result.allowed) await result.release();
  return result;
}

test("configuration defaults, supports zero caps and rejects invalid values", () => {
  assert.equal(usageConfig(baseEnv).daily, 100);
  assert.equal(usageConfig(baseEnv).total, 1000);
  assert.equal(usageConfig({ ...baseEnv, GUIDE_DAILY_REQUEST_LIMIT: "0" }).daily, 0);
  for (const bad of ["-1", "NaN", "1.2", "", "1e6", "9007199254740992"]) {
    assert.throws(() => usageConfig({ ...baseEnv, GUIDE_TOTAL_REQUEST_LIMIT: bad }));
  }
  for (const url of ["", "http://example.com", "https://user:pass@example.com",
    "https://example.com/path", "https://example.com/?token=x"]) {
    assert.throws(() => usageConfig({ ...baseEnv, SUPABASE_URL: url }));
  }
  assert.throws(() => usageConfig({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: "" }));
  assert.throws(() => usageConfig({ GUIDE_DAILY_REQUEST_LIMIT: "10" }));
});

test("daily and lifetime caps persist across limiter instances", async () => {
  const store = fakeStore();
  const env = { ...baseEnv, GUIDE_DAILY_REQUEST_LIMIT: "2", GUIDE_TOTAL_REQUEST_LIMIT: "3" };
  assert.equal((await admit(createUsageLimiter(env, store.rpc), "one")).allowed, true);
  assert.equal((await admit(createUsageLimiter(env, store.rpc), "two")).allowed, true);
  assert.deepEqual(await admit(createUsageLimiter(env, store.rpc), "three"), {
    allowed: false, error: "DAILY_LIMIT_REACHED", retryAfter: 90,
  });
  assert.equal(store.counters.total, 2);
  store.counters.daily = 0; // Simulate the database's next UTC day.
  assert.equal((await admit(createUsageLimiter(env, store.rpc), "four")).allowed, true);
  assert.equal((await admit(createUsageLimiter(env, store.rpc), "five")).error, "USAGE_LIMIT_REACHED");
  assert.equal(store.counters.total, 3);
});

test("racing limiter instances cannot exceed a shared daily cap", async () => {
  const store = fakeStore();
  const env = { ...baseEnv, GUIDE_DAILY_REQUEST_LIMIT: "2" };
  const results = await Promise.all(Array.from({ length: 40 }, (_, index) =>
    createUsageLimiter(env, store.rpc).reserve(`caller-${index}`)));
  const admitted = results.filter(result => result.allowed);
  assert.equal(admitted.length, 2);
  assert.equal(store.counters.total, 2);
  assert.ok(results.filter(result => !result.allowed)
    .every(result => result.error === "DAILY_LIMIT_REACHED"));
  await Promise.all(admitted.map(result => result.release()));
});

test("local per-caller, global-minute and concurrency limits remain in place", async () => {
  const store = fakeStore();
  const limiter = createUsageLimiter(baseEnv, store.rpc);
  for (let i = 0; i < 8; i++) assert.equal((await admit(limiter, "same-caller")).allowed, true);
  assert.equal((await admit(limiter, "same-caller")).error, "RATE_LIMITED");
  for (let i = 0; i < 12; i++) assert.equal((await admit(limiter, `other-${i}`)).allowed, true);
  assert.equal((await admit(limiter, "last")).error, "RATE_LIMITED");

  let releaseRpc;
  let rpcCalls = 0;
  const rpcGate = new Promise(resolve => { releaseRpc = resolve; });
  const blockedRpc = () => {
    rpcCalls++;
    return rpcGate;
  };
  const concurrent = createUsageLimiter(baseEnv, blockedRpc);
  const requests = Array.from({ length: 10 }, (_, i) => concurrent.reserve(`c-${i}`));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(rpcCalls, 3);
  releaseRpc([{ allowed: true, error: null, retry_after: null }]);
  const results = await Promise.all(requests);
  assert.equal(results.filter(result => result.allowed).length, 3);
  await Promise.all(results.filter(result => result.allowed).map(result => result.release()));
});

const input = {
  message: "Can I afford an outing?", language: "en", history: [],
  context: {
    salary: 1000, fixedCommitments: 100, totalSpent: 200,
    outingsSpent: 50, outingsLimit: 100, payday: 25,
  },
};

async function withRoute(deps, fn) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
  app.use("/api", createDecisionGuideRouter(deps));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const post = (body = input) => fetch(
    `http://127.0.0.1:${server.address().port}/api/openrouter/decision-guide`,
    { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body) },
  );
  try {
    await fn(post);
  } finally {
    await new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

function provider(response = "A calm answer.") {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: response }, finish_reason: "stop" }],
        }),
      },
    },
  };
}

test("a normal admitted request returns a reply and releases local capacity", async () => {
  let released = 0;
  await withRoute({
    usageGuard: async () => ({ allowed: true, release: async () => { released++; } }),
    provider: provider(),
  }, async post => {
    const response = await post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, "A calm answer.");
  });
  assert.equal(released, 1);
});

test("daily, lifetime and storage errors block OpenRouter before a paid call", async () => {
  let providerCalls = 0;
  const paidProvider = {
    chat: { completions: { create: async () => { providerCalls++; return {}; } } },
  };
  await withRoute({
    usageGuard: async () => ({
      allowed: false, error: "DAILY_LIMIT_REACHED", retryAfter: 60,
    }),
    provider: paidProvider,
  }, async post => {
    const response = await post();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal((await response.json()).error, "DAILY_LIMIT_REACHED");
  });
  await withRoute({
    usageGuard: async () => { throw new Error("private store error"); },
    provider: paidProvider,
  }, async post => {
    const response = await post();
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "USAGE_PROTECTION_UNAVAILABLE");
  });
  assert.equal(providerCalls, 0);
});

test("limit errors have friendly Arabic and English copy", () => {
  assert.equal(classifyGuideError({ status: 429, data: { error: "DAILY_LIMIT_REACHED" } }), "daily");
  assert.equal(classifyGuideError({ status: 429, data: { error: "USAGE_LIMIT_REACHED" } }), "usage");
  assert.ok(guideCopy.ar.errDaily.length > 10);
  assert.ok(guideCopy.en.errDaily.length > 10);
  assert.ok(guideCopy.ar.errUsage.length > 10);
  assert.ok(guideCopy.en.errUsage.length > 10);
});
