import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./auth";
import { registerRoutes } from "./routes";
import { seedFounder } from "./seed";
import { storage } from "./storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

await setupAuth(app);
registerRoutes(app);
await seedFounder();
await storage.seedAchievements().catch(e => console.warn("seedAchievements:", e.message));
await storage.initReferralTables().catch(e => console.warn("initReferralTables:", e.message));
await storage.initGovernanceTreasury().catch(e => console.warn("initGovernanceTreasury:", e.message));
await storage.initApiKeysTables().catch(e => console.warn("initApiKeysTables:", e.message));
await storage.initNftTables().catch(e => console.warn("initNftTables:", e.message));
await storage.initPriceHistory().catch(e => console.warn("initPriceHistory:", e.message));
await storage.initWebhookTables().catch(e => console.warn("initWebhookTables:", e.message));
await storage.initMultisigTables().catch(e => console.warn("initMultisigTables:", e.message));
await storage.initIdentityTables().catch(e => console.warn("initIdentityTables:", e.message));
await storage.initRwaTables().catch(e => console.warn("initRwaTables:", e.message));
await storage.initNetworkSnapshotTable().catch(e => console.warn("initNetworkSnapshotTable:", e.message));
await (storage as any).initTradesTable().catch((e: any) => console.warn("initTradesTable:", e.message));

// Hourly network snapshot cron
setInterval(() => {
  storage.captureNetworkSnapshot().catch(e => console.warn("snapshot cron:", e.message));
}, 60 * 60 * 1000);
storage.captureNetworkSnapshot().catch(() => {});

// Serve static frontend in production only
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

const PORT = parseInt(process.env.PORT ?? "5001", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`ChainCore server running on port ${PORT}`);
});
