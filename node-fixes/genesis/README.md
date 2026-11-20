# Local genesis node bundle

Build or install from the project checkout:

```sh
bash node-fixes/genesis/setup.sh
sudo bash public/scripts/install-genesis.sh
```

Both commands use the bundled source; neither clones a node repository. Do not
start this source on the public network until the genesis allocation and block
hash are reconciled with the approved GYDS network configuration. See
[`nodes-requirements.md`](../../nodes-requirements.md).
