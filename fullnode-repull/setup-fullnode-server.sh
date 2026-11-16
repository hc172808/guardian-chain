#!/usr/bin/env bash
# Compatibility wrapper for the project-local fullnode installer.
# Separate node repositories are no longer fetched by this project.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$PROJECT_ROOT/node-fixes/fullnode"
INSTALLER="$PROJECT_ROOT/public/scripts/install-fullnode-service.sh"

[[ -f "$SOURCE_DIR/go.mod" ]] || {
  echo "Local fullnode source is missing: $SOURCE_DIR" >&2
  exit 1
}
[[ -f "$INSTALLER" ]] || {
  echo "Local fullnode service installer is missing: $INSTALLER" >&2
  exit 1
}

echo "Using the bundled fullnode source at $SOURCE_DIR."
echo "This compatibility wrapper does not fetch node repositories or remove chain data."
exec env PROJECT_ROOT="$PROJECT_ROOT" GYDS_NODE_SOURCE_DIR="$SOURCE_DIR" \
  bash "$INSTALLER" "$@"
