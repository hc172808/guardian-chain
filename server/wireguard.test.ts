import { describe, expect, it } from "vitest";
import { parseLocalWireGuardConfig, parseWireGuardDump } from "./wireguard";

describe("parseLocalWireGuardConfig", () => {
  it("reads interface settings and peers without exposing secret keys", () => {
    const privateKey = "server-private-key-must-not-leak";
    const presharedKey = "peer-preshared-key-must-not-leak";
    const parsed = parseLocalWireGuardConfig(`
[Interface]
PrivateKey = ${privateKey}
Address = 10.0.0.1/24
ListenPort = 51820

# validator-node
[Peer]
PublicKey = peer-public-key
PresharedKey = ${presharedKey}
AllowedIPs = 10.0.0.2/32
Endpoint = 203.0.113.4:51820
`);

    expect(parsed.path).toBe("/etc/wireguard/wg0.conf");
    expect(parsed.interfaceName).toBe("wg0");
    expect(parsed.interfaceAddresses).toEqual(["10.0.0.1/24"]);
    expect(parsed.listenPort).toBe(51820);
    expect(parsed.serverPrivateKeyConfigured).toBe(true);
    expect(parsed.peers).toEqual([{
      id: "wg-file-0-peer-public-",
      publicKey: "peer-public-key",
      allowedIPs: "10.0.0.2/32",
      endpoint: "203.0.113.4:51820",
      name: "validator-node",
      source: "file",
    }]);
    expect(JSON.stringify(parsed)).not.toContain(privateKey);
    expect(JSON.stringify(parsed)).not.toContain(presharedKey);
  });
});

describe("parseWireGuardDump", () => {
  it("marks only recently handshaken peers as connected without exposing keys", () => {
    const parsed = parseWireGuardDump([
      "server-public-key\t(server-private-key)\t51820\toff",
      "connected-peer-public-key\t(peer-preshared-key)\t203.0.113.5:51820\t10.0.0.7/32\t1999999700\t1024\t2048\t25",
      "offline-peer-public-key\t(peer-preshared-key)\t(none)\t10.0.0.8/32\t0\t0\t0\toff",
    ].join("\n"), 2_000_000_000);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      publicKey: "connected-peer-public-key",
      allowedIPs: "10.0.0.7/32",
      endpoint: "203.0.113.5:51820",
      connected: true,
      latestHandshake: 1_999_999_700,
    });
    expect(parsed[1]).toMatchObject({
      publicKey: "offline-peer-public-key",
      connected: false,
      latestHandshake: 0,
    });
    expect(JSON.stringify(parsed)).not.toContain("server-private-key");
    expect(JSON.stringify(parsed)).not.toContain("peer-preshared-key");
  });
});
