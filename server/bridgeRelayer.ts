import crypto from "crypto";

export interface BridgeRelayerPayload {
  event: "bridge.initiated";
  transferId: string;
  userId: string | number;
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  fee: string;
  sourceAddress?: string;
  destinationAddress: string;
  createdAt: string;
}

function getRelayerUrl(): string | null {
  const value = process.env.BRIDGE_RELAYER_WEBHOOK_URL?.trim();
  return value || null;
}

export function isBridgeRelayerConfigured(): boolean {
  return Boolean(getRelayerUrl());
}

/**
 * Notify the external bridge worker without delaying the user's request.
 * The optional HMAC header lets a relayer reject forged callbacks/requests.
 */
export async function notifyBridgeRelayer(payload: BridgeRelayerPayload): Promise<boolean> {
  const url = getRelayerUrl();
  if (!url) {
    console.info(`[bridge] relayer webhook not configured; transfer ${payload.transferId} remains pending`);
    return false;
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = process.env.BRIDGE_RELAYER_WEBHOOK_SECRET?.trim();
  if (secret) {
    headers["X-GYDS-Signature"] = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`[bridge] relayer returned HTTP ${response.status} for transfer ${payload.transferId}`);
      return false;
    }
    return true;
  } catch (error: any) {
    console.warn(`[bridge] relayer delivery failed for transfer ${payload.transferId}: ${error?.message ?? "unknown error"}`);
    return false;
  }
}