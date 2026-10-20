import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import submissionsRouter from "./submissions";
import transitRouter from "./transit";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reportsRouter);
router.use(submissionsRouter);
router.use(transitRouter);

export default router;
