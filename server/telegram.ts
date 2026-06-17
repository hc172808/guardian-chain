/**
 * Telegram Bot API helper for GYDS Chain alert notifications.
 * Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.
 *
 * Usage:
 *   sendTelegramMessage(chatId, "Your faucet drip arrived!");
 *   sendTelegramAlert(chatId, "faucet", { amount: 100, token: "GYD" });
 */

const TELEGRAM_API = "https://api.telegram.org";

export function getTelegramBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

/**
 * Send a plain text or HTML message to a Telegram chat.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "HTML" | "Markdown" | "MarkdownV2" = "HTML"
): Promise<{ ok: boolean; error?: string }> {
  const token = getTelegramBotToken();
  if (!token) {
    console.debug("[Telegram] TELEGRAM_BOT_TOKEN not set — skipping notification");
    return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  }
  if (!chatId) {
    return { ok: false, error: "chatId is empty" };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.warn("[Telegram] sendMessage failed:", data.description);
      return { ok: false, error: data.description };
    }
    return { ok: true };
  } catch (err: any) {
    console.warn("[Telegram] sendMessage error:", err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Send a structured alert message for a known event type.
 */
export async function sendTelegramAlert(
  chatId: string,
  event: "faucet" | "governance" | "xp_milestone" | "tx_confirmed" | "node_alert" | "stake" | "custom",
  data: Record<string, any>
): Promise<{ ok: boolean; error?: string }> {
  const appUrl = "https://app.netlifegy.com";

  let text = "";

  switch (event) {
    case "faucet":
      text = [
        `💧 <b>Faucet Drip Sent</b>`,
        ``,
        `Amount: <code>${data.amount} ${String(data.token ?? "GYDS").toUpperCase()}</code>`,
        `To: <code>${data.wallet ?? "—"}</code>`,
        `Tx: <code>${data.txHash ?? "—"}</code>`,
        ``,
        `<a href="${appUrl}/wallet">View Wallet →</a>`,
      ].join("\n");
      break;

    case "governance":
      text = [
        `📜 <b>Governance: ${data.title ?? "New Proposal"}</b>`,
        ``,
        data.body ?? "",
        ``,
        `<a href="${appUrl}/governance">Vote Now →</a>`,
      ].join("\n");
      break;

    case "xp_milestone":
      text = [
        `🏆 <b>XP Milestone Reached!</b>`,
        ``,
        `You earned <b>${data.xp ?? 0} XP</b> — ${data.reason ?? "activity reward"}`,
        `Total XP: <b>${data.total ?? "—"}</b>`,
        ``,
        `<a href="${appUrl}/leaderboard">Leaderboard →</a>`,
      ].join("\n");
      break;

    case "tx_confirmed":
      text = [
        `✅ <b>Transaction Confirmed</b>`,
        ``,
        `Hash: <code>${data.txHash ?? "—"}</code>`,
        `From: <code>${data.from ?? "—"}</code>`,
        `To: <code>${data.to ?? "—"}</code>`,
        `Amount: <code>${data.amount ?? "—"} GYDS</code>`,
        `Block: <code>#${data.blockNumber ?? "—"}</code>`,
      ].join("\n");
      break;

    case "node_alert":
      text = [
        `⚠️ <b>Node Alert</b>`,
        ``,
        `Node: <b>${data.node ?? "—"}</b>`,
        `Status: <code>${data.status ?? "—"}</code>`,
        data.message ? `Message: ${data.message}` : "",
        ``,
        `<a href="${appUrl}/admin">Admin Panel →</a>`,
      ].filter(Boolean).join("\n");
      break;

    case "stake":
      text = [
        `🥩 <b>Stake ${data.action === "unstake" ? "Removed" : "Added"}</b>`,
        ``,
        `Amount: <code>${data.amount ?? "—"} GYDS</code>`,
        `Pool: <b>${data.pool ?? "—"}</b>`,
        `APR: <b>${data.apr ?? "—"}%</b>`,
      ].join("\n");
      break;

    default:
      text = data.message ?? "GYDS Chain notification";
  }

  return sendTelegramMessage(chatId, text);
}

/**
 * Test that a bot token is valid and can reach a chat.
 */
export async function testTelegramConnection(
  chatId: string,
  botToken?: string
): Promise<{ ok: boolean; error?: string; botName?: string }> {
  const token = botToken ?? getTelegramBotToken();
  if (!token) return { ok: false, error: "No bot token configured" };

  try {
    // Get bot info
    const meRes = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const meData = await meRes.json();
    if (!meData.ok) return { ok: false, error: meData.description };

    const botName = meData.result?.username ?? "unknown";

    // Send test message
    const msgRes = await sendTelegramMessage(
      chatId,
      `✅ <b>GYDS Chain alert connected!</b>\n\nBot: @${botName}\nYou'll receive notifications for faucet drips, governance votes, XP milestones, and more.`,
    );
    return { ok: msgRes.ok, error: msgRes.error, botName };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
