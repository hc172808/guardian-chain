import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tableRouter from "./table";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tableRouter);

export default router;
