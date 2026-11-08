# Installer debugging

- [ ] Compare hc172808/fullnode setup-node.sh with the multi-node installer, fix integration failures, and provide developer instructions.
- [ ] Fix master-installer argument handling, dependency preflight and unattended child-script execution.
- [ ] Fix requirements client-only startup and preserve existing firewall rules.
- [ ] Run isolated installer regression tests and existing script checks.
- [ ] Record results in todo.md; server installation remains unverified without running on the target host.
- [ ] Make the admin Git update button run a detached, auditable pull/build/restart with health verification and rollback; test with stub commands.