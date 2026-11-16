#!/usr/bin/env bash
# Build the bundled local genesis node. This script never clones a node repo.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SOURCE_DIR/../.." && pwd)"

[[ -f "$SOURCE_DIR/go.mod" ]] || {
  echo "Local genesis source is missing go.mod: $SOURCE_DIR" >&2
  exit 1
}
grep -Fqx 'module github.com/gydschain/genesis' "$SOURCE_DIR/go.mod" || {
  echo "Unexpected local genesis module in $SOURCE_DIR/go.mod" >&2
  exit 1
}
command -v go >/dev/null 2>&1 || {
  echo "Go is required. Install the Go version listed in nodes-requirements.md." >&2
  exit 1
}

cd "$SOURCE_DIR"
go mod download
go test ./...
mkdir -p bin
go build -ldflags="-s -w" -o bin/gyds-genesis .

echo "Built local genesis binary: $SOURCE_DIR/bin/gyds-genesis"
echo "Project root: $PROJECT_ROOT"
