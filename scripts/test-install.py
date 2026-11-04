#!/usr/bin/env python3
"""Exercise the master installer with fake child scripts, never system services."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gyds-install-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.events = self.root / "events"
        shutil.copy(ROOT / "install.sh", self.root / "install.sh")
        (self.root / "scripts").mkdir()
        (self.root / "public/scripts").mkdir(parents=True)
        self.env = {**os.environ, "NONINTERACTIVE": "1", "EVENTS": str(self.events)}
        # Prevent an installed command from bypassing our redeploy fixture.
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ("bash", "dirname", "date", "sed", "uname"):
            source = shutil.which(name)
            if source:
                (self.bin / name).symlink_to(source)
        self.env["PATH"] = str(self.bin)

    def stub(self, name, status=0):
        folder = "scripts" if name == "requirements.sh" else "public/scripts"
        (self.root / folder / name).write_text(
            '#!/usr/bin/env bash\nprintf "%s|%s|%s\\n" "${0##*/}" '
            '"${NONINTERACTIVE:-unset}" "$*" >> "$EVENTS"\n'
            f'exit {status}\n'
        )

    def run_install(self, *args, env=None):
        return subprocess.run(
            [shutil.which("bash"), str(self.root / "install.sh"), *args],
            env={**self.env, **(env or {})}, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=10,
        )

    def assert_no_children(self):
        self.assertFalse(self.events.exists())

    def test_unknown_flag_rejected(self):
        result = self.run_install("--dashbord")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown flag", result.stderr)
        self.assert_no_children()

    def test_conflicting_modes_rejected(self):
        result = self.run_install("--dashboard", "--all")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("only one", result.stderr)
        self.assert_no_children()

    def test_mode_required_without_terminal(self):
        result = self.run_install()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No mode", result.stderr)
        self.assert_no_children()

    def test_interactive_mode_rejects_closed_stdin(self):
        result = self.run_install("--dashboard", env={"NONINTERACTIVE": "0"})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("No interactive terminal", result.stderr)
        self.assert_no_children()

    def test_invalid_noninteractive_value_rejected(self):
        result = self.run_install("--dashboard", env={"NONINTERACTIVE": "yes"})
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_children()

    def test_options_forwarded_individually(self):
        self.stub("requirements.sh")
        result = self.run_install("--requirements", "--no-go", "--no-docker")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text(), "requirements.sh|1|--no-go --no-docker\n")

    def test_mode_flags_not_forwarded(self):
        self.stub("requirements.sh")
        result = self.run_install("--requirements", "--noninteractive")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text(), "requirements.sh|1|\n")

    def test_options_rejected_for_wrong_mode(self):
        result = self.run_install("--dashboard", "--pg-client-only")
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_children()

    def test_dashboard_dependency_preflight(self):
        self.stub("requirements.sh")
        result = self.run_install("--dashboard")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy-dashboard.sh", result.stderr)
        self.assert_no_children()

    def test_dashboard_runs_both_children(self):
        self.stub("requirements.sh")
        self.stub("deploy-dashboard.sh")
        result = self.run_install("--dashboard")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text().splitlines(), [
            "requirements.sh|1|--minimal", "deploy-dashboard.sh|1|"
        ])

    def test_node_receives_unattended_setting(self):
        self.stub("requirements.sh")
        self.stub("install-fullnode.sh")
        result = self.run_install("--fullnode", "--noninteractive", env={"NONINTERACTIVE": "0"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text().splitlines(), [
            "requirements.sh|1|--no-docker", "install-fullnode.sh|1|"
        ])

    def test_all_preflight_before_any_child(self):
        self.stub("requirements.sh")
        self.stub("deploy-dashboard.sh")
        result = self.run_install("--all")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("install-all-nodes.sh", result.stderr)
        self.assert_no_children()

    def test_child_failure_stops_success_notice(self):
        self.stub("requirements.sh", status=17)
        self.stub("deploy-dashboard.sh")
        result = self.run_install("--dashboard")
        self.assertEqual(result.returncode, 17)
        self.assertIn("Installation failed during dashboard", result.stderr)
        self.assertNotIn("Installation complete", result.stdout)
        self.assertEqual(self.events.read_text(), "requirements.sh|1|--minimal\n")

    def test_redeploy_flag_is_supported(self):
        self.stub("redeploy.sh")
        result = self.run_install("--redeploy")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text(), "redeploy.sh|1|\n")

    def test_postgres_client_only_helpers_and_hidden_credentials(self):
        # Use existing fake psql so the branch never installs any packages.
        (self.bin / "apt-get").write_text('#!/usr/bin/env bash\nexit 0\n')
        (self.bin / "psql").write_text('#!/usr/bin/env bash\nexit 0\n')
        (self.bin / "apt-get").chmod(0o700)
        (self.bin / "psql").chmod(0o700)
        result = subprocess.run(
            [shutil.which("bash"), str(ROOT / "scripts/requirements.sh"), "--pg-client-only"],
            env={**self.env, "DATABASE_URL": "postgresql://fixture:fake-secret@localhost/test"},
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Connection OK", result.stdout)
        self.assertNotIn("fake-secret", result.stdout + result.stderr)
        self.assertNotIn("command not found", result.stderr)


if __name__ == "__main__":
    unittest.main()