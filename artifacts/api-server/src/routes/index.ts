import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tableRouter from "./table";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tableRouter);
router.use(storageRouter);

export default router;
