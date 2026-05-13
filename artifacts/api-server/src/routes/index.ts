import { Router, type IRouter } from "express";
import healthRouter from "./health";
import tableRouter from "./table";
import storageRouter from "./storage";
import blockchainRouter from "./blockchain";

const router: IRouter = Router();

router.use(healthRouter);
router.use(tableRouter);
router.use(storageRouter);
router.use(blockchainRouter);

export default router;
