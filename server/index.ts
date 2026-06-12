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
