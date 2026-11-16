import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import express from "express";
import financialDataRouter from "../src/routes/financial-data.ts";
import financialProfilesRouter from "../src/routes/financial-profiles.ts";

const nativeFetch = globalThis.fetch;
const profileRows = [];
const budgetRows = new Map();

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "127.0.0.1") return nativeFetch(input, init);
  assert.equal(url.origin, "https://offline.supabase.co", "Tests must never call an external service");

  const table = url.pathname.split("/").at(-1);
  if (table === "financial_family_members" && init?.method === "POST") {
    const record = JSON.parse(String(init.body));
    const duplicate = profileRows.some((row) =>
      row.family_hash === record.family_hash && row.name.toLowerCase() === record.name.toLowerCase()
    );
    if (duplicate) return jsonResponse({ code: "23505" }, 409);
    const created = { ...record, id: randomUUID(), created_at: new Date().toISOString() };
    profileRows.push(created);
    return jsonResponse([created]);
  }

  if (table === "financial_family_members" && (!init?.method || init.method === "GET")) {
    const familyHash = url.searchParams.get("family_hash")?.slice(3);
    const profileId = url.searchParams.get("id")?.slice(3);
    const rows = profileRows.filter((row) =>
      row.family_hash === familyHash && (!profileId || row.id === profileId)
    );
    return jsonResponse(rows);
  }

  if (table === "financial_budgets" && (!init?.method || init.method === "GET")) {
    const ownerHash = url.searchParams.get("owner_hash")?.slice(3);
    const row = ownerHash ? budgetRows.get(ownerHash) : undefined;
    return jsonResponse(row ? [row] : []);
  }

  if (table === "financial_budgets" && init?.method === "POST") {
    const record = JSON.parse(String(init.body));
    budgetRows.set(record.owner_hash, record);
    return jsonResponse([record]);
  }

  assert.fail(`Unexpected database request: ${init?.method ?? "GET"} ${url.pathname}`);
};

process.env.SUPABASE_URL = "https://offline.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-key";
process.env.SESSION_SECRET = "offline-test-session-secret";

function makeClient(baseUrl) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    headers.connection = "close";
    if (body) headers["Content-Type"] = "application/json";
    const response = await nativeFetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    return response;
  };
}

async function withApi(run) {
  profileRows.length = 0;
  budgetRows.clear();
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.log = { error() {}, warn() {} };
    next();
  });
  app.use("/api", financialProfilesRouter);
  app.use("/api", financialDataRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  try {
    await run(makeClient(baseUrl), () => makeClient(baseUrl));
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

const oldBudget = {
  cfg: { salary: 1_200_000, outingLimit: 200_000, payday: 25, fixed: 100_000 },
  expenses: [{ id: 1, title: "Dinner", fils: 50_000, kind: "outing", day: "now" }],
};

test("new profiles start empty without importing legacy data and save separate budgets", async () => {
  await withApi(async (request) => {
    const legacySave = await request("/financial-data", { method: "PUT", body: oldBudget });
    assert.equal(legacySave.status, 200);

    const firstCreate = await request("/financial-profiles", {
      method: "POST",
      body: { name: "Mohammed" },
    });
    assert.equal(firstCreate.status, 201);
    const mohammed = await firstCreate.json();

    const firstLoad = await request(`/financial-profiles/${mohammed.id}/financial-data`);
    assert.equal(firstLoad.status, 200);
    assert.equal((await firstLoad.json()).data, null);
    const legacyStillExists = await request("/financial-data");
    assert.equal((await legacyStillExists.json()).data.cfg.salary, oldBudget.cfg.salary);

    const secondCreate = await request("/financial-profiles", {
      method: "POST",
      body: { name: "Abdullah" },
    });
    assert.equal(secondCreate.status, 201);
    const abdullah = await secondCreate.json();
    assert.notEqual(abdullah.id, mohammed.id);
    assert.equal((await (await request(`/financial-profiles/${abdullah.id}/financial-data`)).json()).data, null);

    const mohammedBudget = {
      cfg: { salary: 1_500_000, outingLimit: 200_000, payday: 25, fixed: 0 },
      expenses: [],
    };
    const savedMohammed = await request(`/financial-profiles/${mohammed.id}/financial-data`, {
      method: "PUT",
      body: mohammedBudget,
    });
    assert.equal(savedMohammed.status, 200);

    const abdullahBudget = {
      cfg: { salary: 2_000_000, outingLimit: 350_000, payday: 20, fixed: 250_000 },
      expenses: [{ id: 7, title: "Coffee", fils: 3_000, kind: "outing", day: "now" }],
    };
    const saved = await request(`/financial-profiles/${abdullah.id}/financial-data`, {
      method: "PUT",
      body: abdullahBudget,
    });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).cfg.salary, abdullahBudget.cfg.salary);

    const reloaded = await request(`/financial-profiles/${abdullah.id}/financial-data`);
    assert.equal((await reloaded.json()).data.cfg.salary, abdullahBudget.cfg.salary);
    const firstStillSeparate = await request(`/financial-profiles/${mohammed.id}/financial-data`);
    const mohammedSnapshot = (await firstStillSeparate.json()).data;
    assert.equal(mohammedSnapshot.cfg.salary, mohammedBudget.cfg.salary);
    assert.equal(mohammedSnapshot.expenses.length, 0);
  });
});

test("profile names are required and one browser cannot read another browser's profile", async () => {
  await withApi(async (request, newBrowser) => {
    const blankName = await request("/financial-profiles", {
      method: "POST",
      body: { name: "   " },
    });
    assert.equal(blankName.status, 400);
    await blankName.arrayBuffer();

    const created = await request("/financial-profiles", {
      method: "POST",
      body: { name: "Sara" },
    });
    const profile = await created.json();
    assert.equal(created.status, 201);
    const duplicateName = await request("/financial-profiles", {
      method: "POST",
      body: { name: "sArA" },
    });
    assert.equal(duplicateName.status, 409);
    await duplicateName.arrayBuffer();

    const otherBrowser = newBrowser();
    const otherProfiles = await (await otherBrowser("/financial-profiles")).json();
    assert.deepEqual(otherProfiles, { profiles: [] });
    const inaccessible = await otherBrowser(`/financial-profiles/${profile.id}/financial-data`);
    assert.equal(inaccessible.status, 404);
    await inaccessible.arrayBuffer();
  });
});
