# Local lite node bundle

Linux installs use the local Go module:

```sh
bash public/scripts/install-litenode.sh
```

Termux installs use the same bundled module:

```sh
bash public/scripts/install-termux.sh
```

Configure `LITE_RPC_ENDPOINTS` with comma-separated trusted RPC URLs. The current
lite-node implementation syncs headers from those endpoints; it does not yet
provide a verified production SPV implementation. See
[`nodes-requirements.md`](../../nodes-requirements.md).
