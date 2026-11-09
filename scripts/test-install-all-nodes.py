#!/usr/bin/env python3
"""Regression tests for independent node install attempts."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "public" / "scripts" / "install-all-nodes.sh"
ROOT_GUARD = '[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }'


def make_fixture(root: Path) -> tuple[Path, Path, dict[str, str]]:
    scripts = root / "scripts"
    scripts.mkdir(parents=True)
    installer_text = INSTALLER.read_text()
    if ROOT_GUARD not in installer_text:
        raise RuntimeError("Installer root guard changed; update the isolated fixture")
    (scripts / "install-all-nodes.sh").write_text(
        installer_text.replace(ROOT_GUARD, ": # bypass root-only guard in isolated mock test")
    )
    (scripts / "node-profile.sh").write_text("# test dependency\n")
    (scripts / "install-fullnode.sh").write_text(
        "#!/usr/bin/env bash\n"
        "printf 'MOCK_ROLE=%s\\n' \"${NODE_ROLE:-missing}\"\n"
        "if [[ \"${NODE_ROLE:-}\" == full && \"${FAIL_FULL:-0}\" == 1 ]]; then exit 7; fi\n"
        "exit 0\n"
    )
    (scripts / "install-bootnode.sh").write_text("echo MOCK_ROLE=bootnode\n")
    (scripts / "install-litenode.sh").write_text("echo MOCK_ROLE=litenode\n")
    (scripts / "register-local-nodes.sh").write_text("exit 0\n")

    source = root / "source"
    source.mkdir()
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(root),
        "USER": os.environ.get("USER", "tester"),
        "SRC_DIR": str(source),
        "REPO_URL": "https://invalid.example/test-source.git",
    }
    return scripts / "install-all-nodes.sh", source, env


def run_case(script: Path, env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(script), *args],
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="node-installer-regression-") as temp:
        base = Path(temp)

        script, _, env = make_fixture(base / "failed-role")
        env["FAIL_FULL"] = "1"
        result = run_case(script, env, "--fullnode", "--rpc")
        if result.returncode != 1 or "MOCK_ROLE=full" not in result.stdout or "MOCK_ROLE=rpc" not in result.stdout:
            print("FAIL: a failed fullnode did not allow the RPC install to run")
            print(result.stdout)
            return 1
        if "Failed node roles:" not in result.stdout or "gyds-rpcnode (RPC mode, port 8547)" not in result.stdout:
            print("FAIL: partial installation summary did not report failed and successful roles")
            print(result.stdout)
            return 1

        all_script, source, all_env = make_fixture(base / "skipped-roles")
        all_env.pop("GYDS_BOOTSTRAP_NODES", None)
        all_env.pop("GYDS_ALLOWED_NODES", None)
        result = run_case(all_script, all_env, "--all")
        if result.returncode != 1 or "MOCK_ROLE=full" not in result.stdout:
            print("FAIL: all-mode did not continue with the fullnode after role skips")
            print(result.stdout)
            return 1
        if "bootnode: source does not include cmd/bootnode" not in result.stdout:
            print("FAIL: unsupported bootnode was not recorded as skipped")
            print(result.stdout)
            return 1
        if "litenode: trusted bootstrap peers or approved node IDs missing" not in result.stdout:
            print("FAIL: lite node missing trusted peers was not recorded as skipped")
            print(result.stdout)
            return 1
        if "gyds-fullnode" not in result.stdout:
            print("FAIL: successful fullnode was not included in the summary")
            print(result.stdout)
            return 1

    print("PASS: node installation failures and skips do not stop other selected roles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
