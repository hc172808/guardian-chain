/**
 * WhatsApp Business Cloud API helper for GYDSchain notifications.
 *
 * Credentials are stored in the admin_config table (not env vars) so
 * admins/founders can configure everything from the admin panel.
 *
 *  Config keys in admin_config:
 *    whatsapp_enabled          "true" | "false"
 *    whatsapp_phone_number_id  Meta phone number ID
 *    whatsapp_access_token     Meta permanent / system-user access token
 *    whatsapp_business_id      Meta Business Account ID (optional, for display)
 *
 * Usage:
 *   sendWhatsAppMessage(to, "Hello!")
 *   sendWhatsAppAlert(to, "faucet", { amount: 100, token: "GYD" })
 */

import { Pool } from "pg";

const GRAPH_API = "https://graph.facebook.com/v20.0";
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Config helpers ───────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  enabled: boolean;
  phoneNumberId: string;
  accessToken: string;
  businessId: string;
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  try {
    const { rows } = await pgPool.query(
      `SELECT config_key, config_value FROM admin_config
       WHERE config_key IN (
         'whatsapp_enabled','whatsapp_phone_number_id',
         'whatsapp_access_token','whatsapp_business_id'
       )`
    );
    const map: Record<string, string> = {};
    for (const r of rows) map[r.config_key] = r.config_value;
    return {
      enabled:       map.whatsapp_enabled === "true",
      phoneNumberId: map.whatsapp_phone_number_id ?? "",
      accessToken:   map.whatsapp_access_token    ?? "",
      businessId:    map.whatsapp_business_id     ?? "",
    };
  } catch {
    return { enabled: false, phoneNumberId: "", accessToken: "", businessId: "" };
  }
}

export async function saveWhatsAppConfig(cfg: Partial<WhatsAppConfig>): Promise<void> {
  const entries: [string, string][] = [];
  if (cfg.enabled       !== undefined) entries.push(["whatsapp_enabled",          String(cfg.enabled)]);
  if (cfg.phoneNumberId !== undefined) entries.push(["whatsapp_phone_number_id",  cfg.phoneNumberId]);
  if (cfg.accessToken   !== undefined) entries.push(["whatsapp_access_token",     cfg.accessToken]);
  if (cfg.businessId    !== undefined) entries.push(["whatsapp_business_id",      cfg.businessId]);

  for (const [key, value] of entries) {
    await pgPool.query(
      `INSERT INTO admin_config (config_key, config_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`,
      [key, value]
    );
  }
}

// ── Core send ────────────────────────────────────────────────────────────────

/**
 * Send a plain text message to a WhatsApp number.
 * @param to  Phone number in international format, digits only (e.g. "14155552671")
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  cfg?: WhatsAppConfig
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const config = cfg ?? (await getWhatsAppConfig());

  if (!config.enabled) {
    console.debug("[WhatsApp] disabled in admin config — skipping");
    return { ok: false, error: "WhatsApp notifications are not enabled" };
  }
  if (!config.phoneNumberId || !config.accessToken) {
    console.debug("[WhatsApp] phone_number_id or access_token not configured");
    return { ok: false, error: "WhatsApp credentials not configured" };
  }

  // Sanitise number: strip + and spaces
  const cleanTo = to.replace(/[^\d]/g, "");
  if (!cleanTo || cleanTo.length < 7) {
    return { ok: false, error: "Invalid phone number" };
  }

  try {
    const res = await fetch(
      `${GRAPH_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                cleanTo,
          type:              "text",
          text:              { preview_url: false, body: text },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      console.warn("[WhatsApp] sendMessage failed:", msg);
      return { ok: false, error: msg };
    }

    const messageId = data.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (err: any) {
    console.warn("[WhatsApp] sendMessage error:", err.message);
    return { ok: false, error: err.message };
  }
}

// ── Structured alerts ────────────────────────────────────────────────────────

export type WhatsAppEvent =
  | "faucet"
  | "governance"
  | "xp_milestone"
  | "tx_confirmed"
  | "node_alert"
  | "stake"
  | "custom";

export async function sendWhatsAppAlert(
  to: string,
  event: WhatsAppEvent,
  data: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const appUrl = "https://app.netlifegy.com";
  let text = "";

  switch (event) {
    case "faucet":
      text = [
        `💧 *Faucet Drip Sent* — GYDSchain`,
        ``,
        `Amount: ${data.amount} ${String(data.token ?? "GYDS").toUpperCase()}`,
        `To: ${data.wallet ?? "—"}`,
        `Tx: ${data.txHash ?? "—"}`,
        ``,
        `${appUrl}/wallet`,
      ].join("\n");
      break;

    case "governance":
      text = [
        `📜 *Governance: ${data.title ?? "Activity"}*`,
        ``,
        data.body ?? "",
        ``,
        `${appUrl}/governance`,
      ].join("\n");
      break;

    case "xp_milestone":
      text = [
        `🏆 *XP Milestone Reached!*`,
        ``,
        `Earned: ${data.xp ?? 0} XP — ${data.reason ?? "activity reward"}`,
        `Total XP: ${data.total ?? "—"}`,
        ``,
        `${appUrl}/leaderboard`,
      ].join("\n");
      break;

    case "tx_confirmed":
      text = [
        `✅ *Transaction Confirmed*`,
        ``,
        `Hash: ${data.txHash ?? "—"}`,
        `From: ${data.from ?? "—"}`,
        `To:   ${data.to   ?? "—"}`,
        `Amount: ${data.amount ?? "—"} GYDS`,
        `Block: #${data.blockNumber ?? "—"}`,
      ].join("\n");
      break;

    case "node_alert":
      text = [
        `⚠️ *Node Alert* — GYDSchain`,
        ``,
        `Node: ${data.node ?? "—"}`,
        `Status: ${data.status ?? "—"}`,
        data.message ? `Message: ${data.message}` : "",
        ``,
        `${appUrl}/admin`,
      ].filter(Boolean).join("\n");
      break;

    case "stake":
      text = [
        `🥩 *Stake ${data.action === "unstake" ? "Removed" : "Added"}*`,
        ``,
        `Amount: ${data.amount ?? "—"} GYDS`,
        `Pool: ${data.pool ?? "—"}`,
        `APR: ${data.apr ?? "—"}%`,
      ].join("\n");
      break;

    default:
      text = data.message ?? "GYDSchain notification";
  }

  return sendWhatsAppMessage(to, text);
}

// ── Connection test ──────────────────────────────────────────────────────────

/**
 * Verify credentials and send a test message.
 * Returns { ok, error, phoneNumberId } so the admin UI can display info.
 */
export async function testWhatsAppConnection(
  to: string,
  cfg?: Partial<WhatsAppConfig>
): Promise<{ ok: boolean; error?: string; phoneNumberId?: string }> {
  const base = await getWhatsAppConfig();
  const merged: WhatsAppConfig = {
    enabled:       true,
    phoneNumberId: cfg?.phoneNumberId ?? base.phoneNumberId,
    accessToken:   cfg?.accessToken   ?? base.accessToken,
    businessId:    cfg?.businessId    ?? base.businessId,
  };

  if (!merged.phoneNumberId || !merged.accessToken) {
    return { ok: false, error: "Phone Number ID and Access Token are required" };
  }

  const result = await sendWhatsAppMessage(
    to,
    [
      `✅ *GYDSchain WhatsApp alerts connected!*`,
      ``,
      `You will receive notifications for faucet drips, governance votes, XP milestones, and more.`,
      ``,
      `Manage your alerts at ${process.env.APP_URL ?? "https://app.netlifegy.com"}/profile`,
    ].join("\n"),
    merged
  );

  return { ...result, phoneNumberId: merged.phoneNumberId };
}
