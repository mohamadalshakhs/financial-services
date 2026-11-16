import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response as ExpressResponse } from "express";
import {
  SaveFinancialDataResponse,
  type FinancialDataInput,
  type FinancialDataSnapshot,
  type FinancialProfile,
} from "@workspace/api-zod";

const cookieName = "fs_browser";
const cookieMaxAgeSeconds = 60 * 60 * 24 * 365;

type ProfileRow = {
  id: string;
  name: string;
  created_at: string;
};

export class StorageError extends Error {
  constructor(readonly status?: number, readonly code?: string) {
    super("Supabase storage request failed");
  }
}

function requiredConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const apiKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.supa_sec;
  if (!rawUrl || !apiKey || !process.env.SESSION_SECRET) {
    throw new StorageError();
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(rawUrl);
  } catch {
    throw new StorageError();
  }
  if (baseUrl.protocol !== "https:") throw new StorageError();
  return {
    baseUrl: baseUrl.origin,
    apiKey,
    sessionSecret: process.env.SESSION_SECRET,
  };
}

function signature(id: string, secret: string) {
  return createHmac("sha256", secret).update(`financial-browser:${id}`).digest();
}

export function getFamilyHash(req: Request, res: ExpressResponse) {
  const { sessionSecret } = requiredConfig();
  const cookieHeader = req.headers.cookie ?? "";
  const cookieValue = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);

  if (cookieValue) {
    const [id, signatureText, extra] = cookieValue.split(".");
    if (/^[a-f0-9]{64}$/.test(id ?? "") && signatureText && !extra) {
      try {
        const supplied = Buffer.from(signatureText, "base64url");
        const expected = signature(id, sessionSecret);
        if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
          return createHmac("sha256", sessionSecret)
            .update(`financial-data-owner:${id}`)
            .digest("hex");
        }
      } catch {
        // Invalid browser cookies are replaced with a new anonymous identity.
      }
    }
  }

  const id = randomBytes(32).toString("hex");
  const token = `${id}.${signature(id, sessionSecret).toString("base64url")}`;
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: cookieMaxAgeSeconds * 1000,
  });
  return createHmac("sha256", sessionSecret)
    .update(`financial-data-owner:${id}`)
    .digest("hex");
}

export function getProfileOwnerHash(familyHash: string, profileId: string) {
  const { sessionSecret } = requiredConfig();
  return createHmac("sha256", sessionSecret)
    .update(`financial-profile-owner:${familyHash}:${profileId}`)
    .digest("hex");
}

export async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { baseUrl, apiKey } = requiredConfig();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(10_000),
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new StorageError();
  }
  if (!response.ok) {
    let code: string | undefined;
    try {
      const body = await response.json() as { code?: unknown };
      if (typeof body.code === "string") code = body.code;
    } catch {
      // Keep provider error bodies out of logs and user-facing responses.
    }
    throw new StorageError(response.status, code);
  }
  return response;
}

export async function loadSnapshot(ownerHash: string): Promise<FinancialDataSnapshot | null> {
  const query = new URLSearchParams({
    select: "cfg,expenses,version",
    owner_hash: `eq.${ownerHash}`,
    limit: "1",
  });
  const response = await supabaseRequest(`financial_budgets?${query}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new StorageError();
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  const parsed = SaveFinancialDataResponse.safeParse({
    cfg: row.cfg,
    expenses: row.expenses,
    version: Number(row.version),
  });
  if (!parsed.success) throw new StorageError();
  return parsed.data;
}

export async function saveSnapshot(
  ownerHash: string,
  input: FinancialDataInput | FinancialDataSnapshot,
): Promise<FinancialDataSnapshot> {
  const current = await loadSnapshot(ownerHash);
  const payload = {
    owner_hash: ownerHash,
    cfg: input.cfg,
    expenses: input.expenses,
    version: (current?.version ?? 0) + 1,
    updated_at: new Date().toISOString(),
  };
  const query = new URLSearchParams({ on_conflict: "owner_hash" });
  const response = await supabaseRequest(`financial_budgets?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new StorageError();
  const row = rows[0] as Record<string, unknown>;
  const parsed = SaveFinancialDataResponse.safeParse({
    cfg: row.cfg,
    expenses: row.expenses,
    version: Number(row.version),
  });
  if (!parsed.success) throw new StorageError();
  return parsed.data;
}

function toProfile(row: ProfileRow): FinancialProfile {
  return { id: row.id, name: row.name, createdAt: new Date(row.created_at) };
}

export async function listFamilyProfiles(familyHash: string): Promise<FinancialProfile[]> {
  const query = new URLSearchParams({
    select: "id,name,created_at",
    family_hash: `eq.${familyHash}`,
    order: "created_at.asc,id.asc",
  });
  const response = await supabaseRequest(`financial_family_members?${query}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new StorageError();
  return rows.map((row) => toProfile(row as ProfileRow));
}

export async function findFamilyProfile(
  familyHash: string,
  profileId: string,
): Promise<FinancialProfile | null> {
  const query = new URLSearchParams({
    select: "id,name,created_at",
    family_hash: `eq.${familyHash}`,
    id: `eq.${profileId}`,
    limit: "1",
  });
  const response = await supabaseRequest(`financial_family_members?${query}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new StorageError();
  if (rows.length === 0) return null;
  return toProfile(rows[0] as ProfileRow);
}

export async function insertFamilyProfile(
  familyHash: string,
  name: string,
): Promise<FinancialProfile> {
  const response = await supabaseRequest("financial_family_members", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ family_hash: familyHash, name }),
  });
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new StorageError();
  return toProfile(rows[0] as ProfileRow);
}
