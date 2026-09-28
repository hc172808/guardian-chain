import { Client } from "ssh2";
import { storage } from "./storage";

export interface WireGuardServerConfig {
  endpoint: string;
  publicKey: string;
  port: number;
  allowedIPs: string;
  subnet: string;
  interfaceName: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshHostFingerprint: string;
}

export interface WireGuardPeerInput {
  publicKey: string;
  tunnelIp: string;
  name?: string | null;
}

export interface RemoteCommandResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

const DEFAULT_ALLOWED_IPS = "10.0.0.0/24";
const DEFAULT_SUBNET = "10.0.0.0/24";

const envFirst = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" ? value as Record<string, unknown> : {}
);

const stringValue = (value: unknown, fallback = "") => (
  typeof value === "string" && value.trim() ? value.trim() : fallback
);

const numberValue = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
};

export async function getWireGuardConfig(): Promise<WireGuardServerConfig> {
  let stored: Record<string, unknown> = {};
  try {
    const row = await storage.getConfig("wireguard_server");
    stored = asObject((row as any)?.configValue ?? (row as any)?.config_value ?? row);
  } catch {
    // Environment-only configuration should still work if the config table is unavailable.
  }

  const endpoint = envFirst("WG_SERVER_ENDPOINT", "GYDS_WG_SERVER_ENDPOINT")
    || stringValue(stored.endpoint);
  const endpointHost = endpoint.replace(/^\[?([^]:]+)\]?.*$/, "$1");

  return {
    endpoint,
    publicKey: envFirst("WG_SERVER_PUBLIC_KEY", "GYDS_WG_SERVER_PUBLIC_KEY")
      || stringValue(stored.public_key),
    port: numberValue(
      envFirst("WG_SERVER_PORT", "GYDS_WG_SERVER_PORT") || stored.port,
      51820,
    ),
    allowedIPs: envFirst("WG_SERVER_ALLOWED_IPS", "GYDS_WG_ALLOWED_IPS")
      || stringValue(stored.allowed_ips, DEFAULT_ALLOWED_IPS),
    subnet: stringValue(stored.subnet, DEFAULT_SUBNET),
    interfaceName: envFirst("WG_INTERFACE", "GYDS_WG_INTERFACE")
      || stringValue(stored.interface_name, "wg0"),
    sshHost: envFirst("WG_SSH_HOST")
      || stringValue(stored.ssh_host, endpointHost),
    sshPort: numberValue(
      envFirst("WG_SSH_PORT") || stored.ssh_port,
      22,
    ),
    sshUser: envFirst("WG_SSH_USER")
      || stringValue(stored.ssh_user),
    sshHostFingerprint: envFirst("WG_SSH_HOST_FINGERPRINT")
      || stringValue(stored.ssh_host_fingerprint),
  };
}

export const getWireGuardPrivateKey = () => (
  process.env.WG_SSH_PRIVATE_KEY?.trim()
  || process.env.GYDS_WG_SSH_PRIVATE_KEY?.trim()
  || ""
);

export const getWireGuardPublicConfig = (
  config: WireGuardServerConfig,
  privateKeyConfigured = Boolean(getWireGuardPrivateKey()),
) => ({
  endpoint: config.endpoint,
  publicKey: config.publicKey,
  port: config.port,
  allowedIPs: config.allowedIPs,
  subnet: config.subnet,
  interfaceName: config.interfaceName,
  sshHost: config.sshHost,
  sshPort: config.sshPort,
  sshUser: config.sshUser,
  sshHostFingerprint: config.sshHostFingerprint,
  sshKeyConfigured: privateKeyConfigured,
});

export const getMissingRemoteSettings = (
  config: WireGuardServerConfig,
  privateKey = getWireGuardPrivateKey(),
) => {
  const missing: string[] = [];
  if (!config.sshHost) missing.push("SSH host");
  if (!config.sshUser) missing.push("SSH user");
  if (!privateKey) missing.push("WG_SSH_PRIVATE_KEY secret");
  if (!config.sshHostFingerprint) missing.push("SSH host fingerprint");
  return missing;
};

const normalizeFingerprint = (value: string) => value.trim().replace(/^SHA256:/i, "");

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export async function runRemoteWireGuardCommand(command: string): Promise<RemoteCommandResult> {
  const config = await getWireGuardConfig();
  const privateKey = getWireGuardPrivateKey();
  const missing = getMissingRemoteSettings(config, privateKey);
  if (missing.length) {
    throw new Error(`Remote WireGuard connection is not configured: ${missing.join(", ")}.`);
  }

  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      client.end();
      callback();
    };

    client.on("ready", () => {
      client.exec(command, (error, stream) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        let stdout = "";
        let stderr = "";
        stream.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
        stream.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
        stream.on("close", (code: number | null) => {
          finish(() => resolve({ stdout, stderr, code }));
        });
      });
    });

    client.on("error", (error) => finish(() => reject(error)));
    client.connect({
      host: config.sshHost,
      port: config.sshPort,
      username: config.sshUser,
      privateKey: Buffer.from(privateKey),
      readyTimeout: 15_000,
      hostHash: "sha256",
      hostVerifier: (fingerprint: string) => (
        normalizeFingerprint(fingerprint) === normalizeFingerprint(config.sshHostFingerprint)
      ),
    });
  });
}

export async function testRemoteWireGuard(): Promise<{ output: string }> {
  const config = await getWireGuardConfig();
  const command = `sudo -n wg show ${shellQuote(config.interfaceName)}`;
  const result = await runRemoteWireGuardCommand(command);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Remote command failed with exit code ${result.code ?? "unknown"}.`);
  }
  return { output: result.stdout.trim().slice(0, 4000) };
}

export async function syncRemoteWireGuardPeers(peers: WireGuardPeerInput[]) {
  const config = await getWireGuardConfig();
  if (!peers.length) throw new Error("No approved nodes with WireGuard public keys are available.");
  if (peers.length > 252) throw new Error("The 10.0.0.0/24 WireGuard subnet supports at most 252 peers.");

  const commands = peers.map((peer) => {
    if (!/^[A-Za-z0-9+/=]{30,100}$/.test(peer.publicKey)) {
      throw new Error(`Invalid WireGuard public key for ${peer.name || peer.tunnelIp}.`);
    }
    if (!/^10\.0\.0\.(?:[2-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-3])$/.test(peer.tunnelIp)) {
      throw new Error(`Invalid WireGuard tunnel IP for ${peer.name || peer.publicKey.slice(0, 8)}.`);
    }
    return [
      "sudo -n wg set",
      shellQuote(config.interfaceName),
      "peer",
      shellQuote(peer.publicKey),
      "allowed-ips",
      shellQuote(`${peer.tunnelIp}/32`),
      "persistent-keepalive",
      "25",
    ].join(" ");
  });
  commands.push(`sudo -n wg-quick save ${shellQuote(config.interfaceName)}`);

  const result = await runRemoteWireGuardCommand(`set -eu\n${commands.join("\n")}`);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Remote sync failed with exit code ${result.code ?? "unknown"}.`);
  }
  return { applied: peers.length, output: result.stdout.trim().slice(0, 4000) };
}

export function parseWireGuardDump(dump: string) {
  const lines = dump.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line, index) => {
    const fields = line.split("\t");
    return {
      id: `wg-remote-${index}-${fields[0]?.slice(0, 12) ?? index}`,
      publicKey: fields[0] ?? "",
      allowedIPs: fields[3] && fields[3] !== "(none)" ? fields[3] : null,
      endpoint: fields[2] && fields[2] !== "(none)" ? fields[2] : null,
      name: null,
      source: "remote" as const,
    };
  }).filter((peer) => peer.publicKey);
}

export async function getRemoteWireGuardPeers() {
  const config = await getWireGuardConfig();
  const missing = getMissingRemoteSettings(config);
  if (missing.length) {
    throw new Error(`Remote WireGuard connection is not configured: ${missing.join(", ")}.`);
  }
  const result = await runRemoteWireGuardCommand(
    `sudo -n wg show ${shellQuote(config.interfaceName)} dump`,
  );
  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || `Unable to read remote ${config.interfaceName}.`);
  }
  return parseWireGuardDump(result.stdout);
}