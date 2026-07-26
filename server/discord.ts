/**
 * Discord webhook alerts for GYDSchain events.
 * Set DISCORD_WEBHOOK_URL env var to enable. Silently no-ops if missing.
 */

function getWebhookUrl(): string | null {
  return process.env.DISCORD_WEBHOOK_URL ?? null;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}

async function sendDiscordEmbed(embed: DiscordEmbed): Promise<boolean> {
  const url = getWebhookUrl();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Alert types ──────────────────────────────────────────────────────────────

export async function discordNodeDown(type: string, network: string): Promise<void> {
  await sendDiscordEmbed({
    title: "🔴 Node Offline",
    description: `**${type}** node on **${network}** went offline.`,
    color: 0xe53e3e,
    fields: [
      { name: "Node Type", value: type, inline: true },
      { name: "Network",   value: network, inline: true },
    ],
    footer: { text: "GYDSchain Node Monitor" },
    timestamp: new Date().toISOString(),
  });
}

export async function discordNodeUp(type: string, network: string): Promise<void> {
  await sendDiscordEmbed({
    title: "🟢 Node Online",
    description: `**${type}** node on **${network}** is back online.`,
    color: 0x38a169,
    fields: [
      { name: "Node Type", value: type, inline: true },
      { name: "Network",   value: network, inline: true },
    ],
    footer: { text: "GYDSchain Node Monitor" },
    timestamp: new Date().toISOString(),
  });
}

export async function discordGovernanceAlert(title: string, proposalId: string | number, result?: string): Promise<void> {
  await sendDiscordEmbed({
    title: `🗳️ Governance: ${title}`,
    description: result ?? "A governance event occurred on GYDSchain.",
    color: 0x805ad5,
    fields: [
      { name: "Proposal ID", value: String(proposalId), inline: true },
    ],
    footer: { text: "GYDSchain Governance" },
    timestamp: new Date().toISOString(),
  });
}

export async function discordLargeBridgeTransfer(
  amount: string,
  fromChain: string,
  toChain: string,
  token: string
): Promise<void> {
  await sendDiscordEmbed({
    title: "🌉 Large Bridge Transfer",
    description: `A large cross-chain transfer was initiated.`,
    color: 0xed8936,
    fields: [
      { name: "Amount",    value: `${amount} ${token}`, inline: true },
      { name: "From",      value: fromChain,            inline: true },
      { name: "To",        value: toChain,              inline: true },
    ],
    footer: { text: "GYDSchain Bridge Monitor" },
    timestamp: new Date().toISOString(),
  });
}

export async function discordNewGovernanceProposal(title: string, proposer: string, proposalId: string | number): Promise<void> {
  await sendDiscordEmbed({
    title: "📋 New Governance Proposal",
    description: `**${title}**\nProposed by: \`${proposer}\``,
    color: 0x4299e1,
    fields: [
      { name: "Proposal ID", value: String(proposalId), inline: true },
    ],
    footer: { text: "GYDSchain Governance" },
    timestamp: new Date().toISOString(),
  });
}

export async function discordAlert(title: string, message: string, color = 0x4a5568): Promise<void> {
  await sendDiscordEmbed({
    title,
    description: message,
    color,
    footer: { text: "GYDSchain" },
    timestamp: new Date().toISOString(),
  });
}
