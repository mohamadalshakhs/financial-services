import { Router, type IRouter } from "express";
import {
  GetFinancialDataResponse,
  SaveFinancialDataBody,
  SaveFinancialDataResponse,
} from "@workspace/api-zod";
import {
  getFamilyHash as getOwnerHash,
  loadSnapshot,
  saveSnapshot,
  StorageError,
} from "./financial-storage";

const router: IRouter = Router();

router.get("/financial-data", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const ownerHash = getOwnerHash(req, res);
    const data = await loadSnapshot(ownerHash);
    const output = GetFinancialDataResponse.parse({ data });
    res.json(output);
  } catch (error) {
    const status = error instanceof StorageError ? error.status : undefined;
    req.log.error({ storageStatus: status }, "Financial data load failed");
    res.status(503).json({ error: "DATA_STORE_UNAVAILABLE" });
  }
});

router.put("/financial-data", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const input = SaveFinancialDataBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "INVALID_FINANCIAL_DATA" });
    return;
  }
  if (new Set(input.data.expenses.map((item) => item.id)).size !== input.data.expenses.length) {
    res.status(400).json({ error: "INVALID_FINANCIAL_DATA" });
    return;
  }

  try {
    const ownerHash = getOwnerHash(req, res);
    const output = await saveSnapshot(ownerHash, input.data);
    res.json(SaveFinancialDataResponse.parse(output));
  } catch (error) {
    const status = error instanceof StorageError ? error.status : undefined;
    req.log.error({ storageStatus: status }, "Financial data save failed");
    res.status(503).json({ error: "DATA_STORE_UNAVAILABLE" });
  }
});

export default router;
