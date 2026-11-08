import { promises as fs } from "node:fs";
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
  interfaceAddresses: string[];
  serverPrivateKeyConfigured: boolean;
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

export const WIREGUARD_CONFIG_PATH = "/etc/wireguard/wg0.conf";
const DEFAULT_ALLOWED_IPS = "10.0.0.0/24";
const DEFAULT_SUBNET = "10.0.0.0/24";

export interface LocalWireGuardPeer {
  id: string;
  publicKey: string;
  allowedIPs: string | null;
  endpoint: string | null;
  name: string | null;
  source: "file";
}

export interface LocalWireGuardConfig {
  path: string;
  interfaceName: string;
  interfaceAddresses: string[];
  listenPort: number | null;
  serverPrivateKeyConfigured: boolean;
  peers: LocalWireGuardPeer[];
}

export function parseLocalWireGuardConfig(
  contents: string,
  configPath = WIREGUARD_CONFIG_PATH,
): LocalWireGuardConfig {
  const interfaceName = configPath.split("/").pop()?.replace(/\.conf$/i, "") || "wg0";
  const interfaceAddresses: string[] = [];
  const peers: LocalWireGuardPeer[] = [];
  let listenPort: number | null = null;
  let serverPrivateKeyConfigured = false;
  let section: "interface" | "peer" | null = null;
  let current: LocalWireGuardPeer | null = null;
  let pendingComment: string | null = null;

  const finishPeer = () => {
    if (current?.publicKey) peers.push(current);
    current = null;
  };

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const comment = line.slice(1).trim();
      pendingComment = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(comment) ? comment : null;
      continue;
    }
    if (/^\[Interface\]$/i.test(line)) {
      finishPeer();
      section = "interface";
      pendingComment = null;
      continue;
    }
    if (/^\[Peer\]$/i.test(line)) {
      finishPeer();
      section = "peer";
      current = {
        id: "",
        publicKey: "",
        allowedIPs: null,
        endpoint: null,
        name: pendingComment,
        source: "file",
      };
      pendingComment = null;
      continue;
    }

    const match = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (section === "interface") {
      if (key === "privatekey") serverPrivateKeyConfigured = value.length > 0;
      else if (key === "listenport") {
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) listenPort = parsed;
      } else if (key === "address") {
        interfaceAddresses.push(...value.split(",").map(address => address.trim()).filter(Boolean));
      }
    } else if (section === "peer" && current) {
      if (key === "publickey") current.publicKey = value;
      else if (key === "allowedips") current.allowedIPs = value;
      else if (key === "endpoint") current.endpoint = value;
    }
  }
  finishPeer();

  peers.forEach((peer, index) => {
    peer.id = `wg-file-${index}-${peer.publicKey.slice(0, 12)}`;
  });

  return {
    path: configPath,
    interfaceName,
    interfaceAddresses,
    listenPort,
    serverPrivateKeyConfigured,
    peers,
  };
}

export async function readLocalWireGuardConfig(): Promise<LocalWireGuardConfig> {
  const contents = await fs.readFile(WIREGUARD_CONFIG_PATH, "utf8");
  return parseLocalWireGuardConfig(contents);
}

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
  let localFile: LocalWireGuardConfig | null = null;
  try {
    localFile = await readLocalWireGuardConfig();
  } catch {
    // Keep development and remote-only deployments usable when the local file is absent.
  }

  const endpoint = envFirst("WG_SERVER_ENDPOINT", "GYDS_WG_SERVER_ENDPOINT")
    || stringValue(stored.endpoint);
  const endpointHost = endpoint.replace(/^\[?([^]:]+)\]?.*$/, "$1");

  return {
    endpoint,
    publicKey: envFirst("WG_SERVER_PUBLIC_KEY", "GYDS_WG_SERVER_PUBLIC_KEY")
      || stringValue(stored.public_key),
    port: localFile?.listenPort ?? numberValue(
      envFirst("WG_SERVER_PORT", "GYDS_WG_SERVER_PORT") || stored.port,
      51820,
    ),
    allowedIPs: envFirst("WG_SERVER_ALLOWED_IPS", "GYDS_WG_ALLOWED_IPS")
      || stringValue(stored.allowed_ips, DEFAULT_ALLOWED_IPS),
    subnet: stringValue(stored.subnet, DEFAULT_SUBNET),
    interfaceName: localFile?.interfaceName
      || envFirst("WG_INTERFACE", "GYDS_WG_INTERFACE")
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
    interfaceAddresses: localFile?.interfaceAddresses ?? [],
    serverPrivateKeyConfigured: localFile?.serverPrivateKeyConfigured
      ?? Boolean(envFirst("WG_SERVER_PRIVATE_KEY", "GYDS_WG_PRIVATE_KEY")),
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
  interfaceAddresses: config.interfaceAddresses,
  serverPrivateKeyConfigured: config.serverPrivateKeyConfigured,
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

  let SshClient: new () => any;
  try {
    // WireGuard SSH support is optional. Keep a missing optional dependency from
    // preventing the main Express API (including node registration) from booting.
    const ssh2ModuleName = "ssh2";
    const ssh2 = await import(ssh2ModuleName);
    SshClient = ssh2.Client as new () => any;
  } catch {
    throw new Error("Remote WireGuard management is unavailable because the ssh2 package is not installed in this runtime.");
  }

  return new Promise((resolve, reject) => {
    const client = new SshClient();
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

export function parseWireGuardDump(
  dump: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const lines = dump.split(/\r?\n/).filter(Boolean);
  return lines.slice(1).map((line, index) => {
    const fields = line.split("\t");
    const parsedHandshake = Number(fields[4] ?? 0);
    const latestHandshake = Number.isFinite(parsedHandshake) && parsedHandshake > 0
      ? Math.floor(parsedHandshake)
      : 0;
    return {
      id: `wg-remote-${index}-${fields[0]?.slice(0, 12) ?? index}`,
      publicKey: fields[0] ?? "",
      allowedIPs: fields[3] && fields[3] !== "(none)" ? fields[3] : null,
      endpoint: fields[2] && fields[2] !== "(none)" ? fields[2] : null,
      name: null,
      source: "remote" as const,
      latestHandshake,
      lastHandshakeAt: latestHandshake ? new Date(latestHandshake * 1000).toISOString() : null,
      connected: latestHandshake > 0
        && nowSeconds >= latestHandshake
        && nowSeconds - latestHandshake <= 300,
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