# Local validator node bundle

The installer builds from `node-fixes/validatornode` in this project:

```sh
sudo bash node-fixes/validatornode/setup.sh --address 0xYOUR_ADDRESS --stake 10000
```

No separate validator repository is fetched. Verify the local genesis,
validator-set rules, and staking requirement before connecting this bundle to a
public network. See [`nodes-requirements.md`](../../nodes-requirements.md).
