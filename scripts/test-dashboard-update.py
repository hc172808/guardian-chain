#!/usr/bin/env python3
"""Deployment regression tests: only temporary files and fake OS commands."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent

class UpdateTests(unittest.TestCase):
    def run_update(self, failure=''):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        app = root / 'app'
        app.mkdir()
        (app / '.git').mkdir()
        (app / 'package-lock.json').write_text('{}')
        (app / 'server').mkdir()
        (app / 'server/version').write_text('old')
        (app / 'node_modules').mkdir()
        (app / 'node_modules/version').write_text('old-deps')
        state = root / 'state'
        state.mkdir()
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        events = root / 'events'
        stubs = {
            'git': '''case "$*" in
            *rev-parse*) echo old-commit;;
            *symbolic-ref*) echo main;;
            *pull*) echo new > "$APP_DIR/server/version";;
            *reset*) echo old > "$APP_DIR/server/version";;
            esac''',
            'npm': '''if [[ "$*" == *ci* ]]; then echo new-deps > "$APP_DIR/node_modules/version"; fi
            if [[ "$*" == *build* && "$FAILURE" == build ]]; then exit 1; fi''',
            'pm2': '''if [[ "$*" == *restart* && "$FAILURE" == restart && ! -f "$UPDATE_STATE_DIR/retried" ]]; then touch "$UPDATE_STATE_DIR/retried"; exit 1; fi''',
            'curl': '''if [[ "$FAILURE" == health && ! -f "$UPDATE_STATE_DIR/retried" ]]; then
            count=$(cat "$UPDATE_STATE_DIR/count" 2>/dev/null || echo 0); count=$((count+1)); echo "$count" > "$UPDATE_STATE_DIR/count"
            if ((count>=30)); then touch "$UPDATE_STATE_DIR/retried"; fi
            exit 1
            fi
            echo '{"ok":true}' ''',
            'sleep': 'exit 0',
        }
        for name, body in stubs.items():
            file = bin_dir / name
            file.write_text('#!/bin/bash\necho "' + name + ':$*" >> "$EVENTS"\n' + body + '\n')
            file.chmod(0o700)
        result = subprocess.run(['bash', str(ROOT / 'public/scripts/dashboard-update.sh')],
            env={**os.environ, 'PATH': str(bin_dir)+':'+os.environ['PATH'], 'APP_DIR': str(app),
                 'UPDATE_STATE_DIR': str(state), 'FAILURE': failure, 'EVENTS': str(events)},
            capture_output=True, text=True, timeout=20)
        import json
        return result, app, json.loads((state / 'status.json').read_text())['phase'], events.read_text()

    def test_pull_build_restart_health_in_order(self):
        result, app, phase, events = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(phase, 'succeeded')
        self.assertLess(events.index('pull --ff-only'), events.index('npm:ci'))
        self.assertLess(events.index('npm:run build'), events.index('pm2:restart'))
        self.assertLess(events.index('pm2:restart'), events.index('curl:'))
        self.assertEqual((app / 'server/version').read_text().strip(), 'new')

    def test_build_failure_restores_source_and_dependencies(self):
        result, app, phase, events = self.run_update('build')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(phase, 'rolled_back')
        self.assertEqual((app / 'server/version').read_text(), 'old')
        self.assertEqual((app / 'node_modules/version').read_text(), 'old-deps')
        self.assertIn('reset --hard old-commit', events)

    def test_restart_failure_restores_previous_version(self):
        result, app, phase, events = self.run_update('restart')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(phase, 'rolled_back')
        self.assertEqual(events.count('pm2:restart'), 2)
        self.assertEqual((app / 'server/version').read_text(), 'old')

    def test_failed_health_check_rolls_back(self):
        result, app, phase, events = self.run_update('health')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(phase, 'rolled_back')
        self.assertEqual((app / 'server/version').read_text(), 'old')

if __name__ == '__main__':
    unittest.main()