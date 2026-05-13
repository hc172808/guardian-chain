import { Router, type Request, type Response } from "express";

const router = Router();

// These routes proxy to a Go RPC node that does not exist in this environment.
// They return structured stub responses so the frontend does not crash.

const stubBlocks = Array.from({ length: 50 }, (_, i) => ({
  number: 1234567 - i,
  hash: `0x${(1234567 - i).toString(16).padStart(64, "0")}`,
  timestamp: Math.floor(Date.now() / 1000) - i * 12,
  transactions: Math.floor(Math.random() * 20),
  validator: "0x0000000000000000000000000000000000000000",
  size: 4096,
}));

const stubTxs = Array.from({ length: 50 }, (_, i) => ({
  hash: `0x${i.toString(16).padStart(64, "a")}`,
  from: "0x0000000000000000000000000000000000000001",
  to: "0x0000000000000000000000000000000000000002",
  value: "0",
  blockNumber: 1234567 - i,
  timestamp: Math.floor(Date.now() / 1000) - i * 12,
  status: "success",
}));

router.get("/blockchain/blocks", (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 20, 50);
  res.json({ blocks: stubBlocks.slice(0, limit), count: limit, source: "stub" });
});

router.get("/blockchain/block/:id", (req: Request, res: Response) => {
  const id = req.params.id;
  const num = parseInt(id, 10);
  res.json({
    block: {
      number: isNaN(num) ? 1234567 : num,
      hash: `0x${id.padStart(64, "0")}`,
      timestamp: Math.floor(Date.now() / 1000),
      transactions: [],
      validator: "0x0000000000000000000000000000000000000000",
    },
  });
});

router.get("/blockchain/transactions", (_req: Request, res: Response) => {
  const limit = Math.min(Number(_req.query.limit) || 20, 50);
  res.json({ transactions: stubTxs.slice(0, limit), count: limit, source: "stub" });
});

router.get("/blockchain/tx/:hash", (req: Request, res: Response) => {
  res.json({ transaction: { hash: req.params.hash }, receipt: null });
});

router.get("/blockchain/network/stats", (_req: Request, res: Response) => {
  res.json({ blockHeight: 1234567, gasPrice: "1000000000", peerCount: 12, chainId: 1337 });
});

router.get("/blockchain/health", (_req: Request, res: Response) => {
  res.json({ rpc: "stub", indexerDb: "stub" });
});

router.get("/blockchain/wallet/:address", (req: Request, res: Response) => {
  res.json({ address: req.params.address, balance: "0", transactionCount: "0" });
});

router.post("/blockchain/wallet/create", (_req: Request, res: Response) => {
  const rand = Math.random().toString(16).slice(2, 42).padStart(40, "0");
  res.json({ address: `0x${rand}` });
});

router.post("/blockchain/tx/send", (_req: Request, res: Response) => {
  const hash = `0x${Math.random().toString(16).slice(2).padStart(64, "0")}`;
  res.json({ txHash: hash });
});

export default router;
