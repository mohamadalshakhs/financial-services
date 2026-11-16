import { Router, type IRouter } from "express";
import healthRouter from "./health";
import decisionGuideRouter from "./decision-guide";
import financialDataRouter from "./financial-data";
import financialProfilesRouter from "./financial-profiles";

const router: IRouter = Router();

router.use(healthRouter);
router.use(decisionGuideRouter);
router.use(financialDataRouter);
router.use(financialProfilesRouter);

export default router;
