import { Router, type IRouter } from "express";
import {
  CreateFinancialProfileBody,
  CreateFinancialProfileResponse,
  GetFinancialProfilesResponse,
  GetProfileFinancialDataParams,
  GetProfileFinancialDataResponse,
  SaveProfileFinancialDataBody,
  SaveProfileFinancialDataResponse,
} from "@workspace/api-zod";
import {
  findFamilyProfile,
  getFamilyHash,
  getProfileOwnerHash,
  insertFamilyProfile,
  listFamilyProfiles,
  loadSnapshot,
  saveSnapshot,
  StorageError,
} from "./financial-storage";

const router: IRouter = Router();

function unavailable(res: import("express").Response, error: unknown, req: import("express").Request, message: string) {
  const status = error instanceof StorageError ? error.status : undefined;
  req.log.error({ storageStatus: status }, message);
  res.status(503).json({ error: "DATA_STORE_UNAVAILABLE" });
}

async function loadProfileSnapshot(familyHash: string, profileId: string) {
  const profileHash = getProfileOwnerHash(familyHash, profileId);
  return loadSnapshot(profileHash);
}

router.get("/financial-profiles", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const familyHash = getFamilyHash(req, res);
    const profiles = await listFamilyProfiles(familyHash);
    res.json(GetFinancialProfilesResponse.parse({ profiles }));
  } catch (error) {
    unavailable(res, error, req, "Financial profile list failed");
  }
});

router.post("/financial-profiles", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const input = CreateFinancialProfileBody.safeParse(req.body);
  const name = input.success ? input.data.name.trim() : "";
  if (!input.success || name.length === 0 || name.length > 40) {
    res.status(400).json({ error: "INVALID_PROFILE_NAME" });
    return;
  }

  try {
    const familyHash = getFamilyHash(req, res);
    const profile = await insertFamilyProfile(familyHash, name);
    res.status(201).json(CreateFinancialProfileResponse.parse(profile));
  } catch (error) {
    if (error instanceof StorageError && (error.status === 409 || error.code === "23505")) {
      res.status(409).json({ error: "PROFILE_NAME_EXISTS" });
      return;
    }
    unavailable(res, error, req, "Financial profile creation failed");
  }
});

router.get("/financial-profiles/:profileId/financial-data", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const params = GetProfileFinancialDataParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "INVALID_PROFILE_ID" });
    return;
  }
  try {
    const familyHash = getFamilyHash(req, res);
    const profile = await findFamilyProfile(familyHash, params.data.profileId);
    if (!profile) {
      res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    const data = await loadProfileSnapshot(familyHash, profile.id);
    res.json(GetProfileFinancialDataResponse.parse({ data }));
  } catch (error) {
    unavailable(res, error, req, "Profile financial data load failed");
  }
});

router.put("/financial-profiles/:profileId/financial-data", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const params = GetProfileFinancialDataParams.safeParse(req.params);
  const input = SaveProfileFinancialDataBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "INVALID_FINANCIAL_DATA" });
    return;
  }
  if (new Set(input.data.expenses.map((item) => item.id)).size !== input.data.expenses.length) {
    res.status(400).json({ error: "INVALID_FINANCIAL_DATA" });
    return;
  }

  try {
    const familyHash = getFamilyHash(req, res);
    const profile = await findFamilyProfile(familyHash, params.data.profileId);
    if (!profile) {
      res.status(404).json({ error: "PROFILE_NOT_FOUND" });
      return;
    }
    const profileHash = getProfileOwnerHash(familyHash, profile.id);
    const snapshot = await saveSnapshot(profileHash, input.data);
    res.json(SaveProfileFinancialDataResponse.parse(snapshot));
  } catch (error) {
    unavailable(res, error, req, "Profile financial data save failed");
  }
});

export default router;
