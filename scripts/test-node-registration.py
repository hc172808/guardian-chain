#!/usr/bin/env python3
"""Exercise local node registration with stubbed systemd and psql commands."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
REGISTER_SCRIPT = ROOT / "public/scripts/register-local-nodes.sh"


class LocalNodeRegistrationTests(unittest.TestCase):
    def test_active_local_service_is_registered_without_exposing_database_url(self):
        with tempfile.TemporaryDirectory(prefix="gyds-node-registration-") as temp:
            root = Path(temp)
            app_dir = root / "app"
            app_dir.mkdir()
            (app_dir / ".env").write_text(
                "DATABASE_URL=postgresql://fixture:fake-secret@localhost/gyds\n"
            )
            (app_dir / "gyds-config.env").write_text("GYDS_CHAIN_ID=198281\n")

            unit_dir = root / "systemd"
            unit_dir.mkdir()
            (unit_dir / "gyds-fullnode.service").write_text("[Service]\n")
            node_home = root / "node-user"
            node_home.mkdir()

            bin_dir = root / "bin"
            bin_dir.mkdir()
            psql = bin_dir / "psql"
            psql.write_text(
                "#!/bin/sh\n"
                "case \"$*\" in\n"
                "  *\"SELECT 1\"*) echo 1; exit 0 ;;\n"
                "  *\"SELECT id FROM users\"*) echo fixture-admin; exit 0 ;;\n"
                "esac\n"
                "printf '%s\\n' \"$*\" >> \"$PSQL_ARGS_CAPTURE\"\n"
                "cat >> \"$PSQL_CAPTURE\"\n"
            )
            psql.chmod(0o755)

            systemctl = bin_dir / "systemctl"
            systemctl.write_text("#!/bin/sh\nexit 0\n")
            systemctl.chmod(0o755)

            capture = root / "registered.sql"
            env = {
                **os.environ,
                "APP_DIR": str(app_dir),
                "SYSTEMD_UNIT_DIR": str(unit_dir),
                "SYSTEMD_USER_UNIT_DIR": str(root / "empty-user-units"),
                "NODE_USER": "fixtureuser",
                "NODE_HOME_OVERRIDE": str(node_home),
                "NODE_MONITOR_IP": "127.0.0.1",
                "PSQL_CAPTURE": str(capture),
                "PSQL_ARGS_CAPTURE": str(root / "psql-args"),
                "PATH": f"{bin_dir}:{os.environ['PATH']}",
            }
            result = subprocess.run(
                ["/bin/bash", str(REGISTER_SCRIPT)],
                env=env,
                capture_output=True,
                text=True,
                timeout=15,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("fullnode: running and visible", result.stdout)
            self.assertIn("Registered 1 local node service", result.stdout)
            self.assertNotIn("fake-secret", result.stdout + result.stderr)
            sql = capture.read_text()
            psql_args = (root / "psql-args").read_text()
            self.assertIn("INSERT INTO node_installations", sql)
            self.assertIn("node_type = :'node_type'", sql)
            self.assertIn("network = :'network'", sql)
            self.assertIn("node_ip=127.0.0.1", psql_args)


if __name__ == "__main__":
    unittest.main()
