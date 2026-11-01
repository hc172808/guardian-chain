import { describe, expect, it } from "vitest";
import { parseLocalWireGuardConfig } from "./wireguard";

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
