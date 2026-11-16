import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { createDecisionGuideRouter } from "../src/routes/decision-guide.ts";
import { createUsageLimiter } from "../src/lib/guide-usage.ts";

const input = {
  message: "Can I afford an outing?", language: "en", history: [],
  context: { salary: 1000, fixedCommitments: 100, totalSpent: 200, outingsSpent: 50, outingsLimit: 100, payday: 25 },
};
const nativeFetch = globalThis.fetch;
// No test may accidentally use an external service or the real AI provider.
globalThis.fetch = (url, options) => {
  assert.equal(new URL(url).hostname, "127.0.0.1", "External requests are forbidden in offline tests");
  return nativeFetch(url, options);
};

async function withRoute(create, fn, timeoutMs = 45_000) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.log = { warn() {} }; next(); });
  const limiter = createUsageLimiter({
    SUPABASE_URL: "https://offline.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "offline-test-key",
  }, async () => [{ allowed: true, error: null, retry_after: null }]);
  app.use("/api", createDecisionGuideRouter({
    provider: { chat: { completions: { create } } },
    usageGuard: (caller) => limiter.reserve(caller),
    timeoutMs,
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const post = (body = input) => fetch(`http://127.0.0.1:${server.address().port}/api/openrouter/decision-guide`, {
    method: "POST", headers: { "Content-Type": "application/json", Connection: "close" }, body: JSON.stringify(body),
  });
  try { await fn(post); } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

const completion = () => ({ choices: [{ message: { content: "Plan a lower-cost outing." }, finish_reason: "stop" }] });

test("normal requests return replies without any Redis configuration or paid AI calls", async () => {
  let calls = 0;
  await withRoute(async (_body, options) => {
    calls++;
    assert.equal(options.maxRetries, 0);
    return completion();
  }, async (post) => {
    const reply = await post();
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get("cache-control"), "no-store");
    assert.deepEqual(await reply.json(), { reply: "Plan a lower-cost outing." });
    assert.equal(calls, 1);
  });
});

test("invalid input is blocked before contacting the provider", async () => {
  await withRoute(() => assert.fail("Invalid requests must not contact AI"), async (post) => {
    for (const body of [{}, { ...input, message: " " }, {
      ...input, context: { ...input.context, outingsSpent: 300 },
    }]) {
      const response = await post(body);
      assert.equal(response.status, 400);
      await response.arrayBuffer();
    }
  });
});

test("the original caller rate limit blocks the ninth request", async () => {
  let calls = 0;
  await withRoute(async () => { calls++; return completion(); }, async (post) => {
    for (let i = 0; i < 8; i++) {
      const response = await post();
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    const blocked = await post();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.deepEqual(await blocked.json(), { error: "RATE_LIMITED" });
    assert.equal(calls, 8);
  });
});

test("only three concurrent AI requests are allowed", async () => {
  const waiting = [];
  let ready;
  const allStarted = new Promise((resolve) => { ready = resolve; });
  await withRoute(async () => {
    if (waiting.length >= 3) return completion();
    await new Promise((resolve) => {
      waiting.push(resolve);
      if (waiting.length === 3) ready();
    });
    return completion();
  }, async (post) => {
    const pending = [post(), post(), post()];
    try {
      await allStarted;
      const overLimit = await post();
      assert.equal(overLimit.status, 429);
      await overLimit.arrayBuffer();
    } finally {
      waiting.forEach((resolve) => resolve());
      const replies = await Promise.all(pending);
      assert.ok(replies.every((reply) => reply.status === 200));
    }
    assert.equal((await post()).status, 200);
  });
});

test("provider errors, timeouts, and incomplete replies return friendly error codes", async () => {
  for (const [kind, status, error] of [
    ["rate", 429, "RATE_LIMITED"],
    ["failure", 502, "AI_UNAVAILABLE"],
    ["incomplete", 502, "AI_UNAVAILABLE"],
    ["timeout", 504, "AI_TIMEOUT"],
  ]) {
    await withRoute(async (_body, { signal }) => {
      if (kind === "rate") throw { status: 429 };
      if (kind === "failure") throw { status: 500 };
      if (kind === "incomplete") return { choices: [{ message: { content: "truncated" }, finish_reason: "length" }] };
      await once(signal, "abort");
      throw new Error("aborted");
    }, async (post) => {
      const response = await post();
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error });
    }, 10);
  }
});
