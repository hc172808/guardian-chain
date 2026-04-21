# GYDSchain Bootnode — Requirements

## Purpose
A bootnode helps new GYDSchain nodes (fullnodes, litenodes) discover each
other when they first start up. It runs **only** the P2P discovery layer —
no mining, no consensus voting, no RPC, no full block storage.

## Hardware (minimum)
| Resource | Minimum | Recommended |
| -------- | ------- | ----------- |
| vCPU     | 1       | 2           |
| RAM      | 512 MB  | 1 GB        |
| Disk     | 5 GB    | 10 GB SSD   |
| Network  | 10 Mbps unmetered | 100 Mbps |
| IPv4     | 1 static public IP | 1 static public IP |

A small VPS (e.g. Hetzner CX11, DigitalOcean $4/mo, Vultr $3.50/mo) is enough.

## Operating System
- Ubuntu 22.04 LTS (recommended)
- Debian 12 (compatible)
- Any systemd-based Linux with `apt` will work

## Software dependencies (installed automatically by `install-bootnode.sh`)
- `curl`, `wget`, `git`, `build-essential`, `openssl`, `ca-certificates`
- `ufw` — firewall
- `fail2ban` — brute-force protection
- Go **1.22.0+** (auto-installed to `/usr/local/go`)

## Network / Firewall
| Port  | Proto    | Purpose                  | Open to |
| ----- | -------- | ------------------------ | ------- |
| 22    | TCP      | SSH admin                | your IP only (recommended) |
| 30303 | TCP+UDP  | GYDSchain P2P discovery  | 0.0.0.0/0 |

⚠️ **Do NOT open port 8546 (RPC).** Bootnodes do not run RPC.

## DNS (optional but recommended)
Assign a public hostname so the bootnode address stays stable even if you
rebuild the server, e.g.:

```
bootnode1.netlifegy.com   A   <server-ip>
bootnode2.netlifegy.com   A   <server-ip>
```

Then start the service with `PUBLIC_ADDR=bootnode1.netlifegy.com:30303`.

## Recommended deployment topology
- **2–3 bootnodes** on different providers / regions / ASNs.
- Pin all of them in every fullnode/litenode `BootstrapNodes` config.
- Optionally chain them: pass each bootnode the others as `--bootstrap`.

## Files installed
| Path | Purpose |
| ---- | ------- |
| `/usr/local/bin/gyds-bootnode`           | Compiled binary |
| `/etc/systemd/system/gyds-bootnode.service` | systemd unit |
| `/etc/gydschain/bootnode.toml`           | Config (informational) |
| `/var/lib/gydschain/bootnode/node.key`   | Node private key (chmod 600) |
| `/var/log/gydschain/bootnode.log`        | stdout log |
| `/var/log/gydschain/bootnode-error.log`  | stderr log |
| `/etc/fail2ban/jail.d/gyds-bootnode.conf`| fail2ban jail |

## Installation

```bash
# From the repo:
sudo SRC_DIR=$PWD/public/blockchain-go \
  PUBLIC_ADDR=bootnode1.netlifegy.com:30303 \
  bash public/scripts/install-bootnode.sh
```

## Operations

```bash
systemctl status gyds-bootnode          # health
systemctl restart gyds-bootnode         # restart
journalctl -u gyds-bootnode -f          # live logs
tail -f /var/log/gydschain/bootnode.log # alt log view
```

## Sharing your bootnode
After install, the script prints:

```
Share this bootstrap address with other operators:
    <node-id>@bootnode1.netlifegy.com:30303
```

Add that line to `BootstrapNodes` in every fullnode / litenode config.
