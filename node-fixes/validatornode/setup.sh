#!/usr/bin/env bash
# Install the bundled validator node through the project's local installer.
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SOURCE_DIR/../.." && pwd)"
ADDRESS="${GYDS_REWARD_ADDRESS:-${GYDS_VALIDATOR_ADDRESS:-}}"
STAKE="${GYDS_STAKE_AMOUNT:-10000}"
args=()

while (($#)); do
  case "$1" in
    --address)
      (($# >= 2)) || { echo "--address requires a value" >&2; exit 1; }
      ADDRESS="$2"
      shift 2
      ;;
    --stake)
      (($# >= 2)) || { echo "--stake requires a value" >&2; exit 1; }
      STAKE="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: bash $0 [--address 0x... ] [--stake 10000]"
      echo "Build source: local node-fixes/validatornode bundle"
      exit 0
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

[[ -f "$SOURCE_DIR/go.mod" ]] || {
  echo "Local validator source is missing go.mod: $SOURCE_DIR" >&2
  exit 1
}

if [[ $EUID -ne 0 ]]; then
  exec sudo env \
    PROJECT_ROOT="$PROJECT_ROOT" \
    NODE_SOURCE_DIR="$SOURCE_DIR" \
    GYDS_REWARD_ADDRESS="$ADDRESS" \
    GYDS_STAKE_AMOUNT="$STAKE" \
    bash "$PROJECT_ROOT/public/scripts/install-validatornode.sh" "${args[@]}"
fi

exec env \
  PROJECT_ROOT="$PROJECT_ROOT" \
  NODE_SOURCE_DIR="$SOURCE_DIR" \
  GYDS_REWARD_ADDRESS="$ADDRESS" \
  GYDS_STAKE_AMOUNT="$STAKE" \
  bash "$PROJECT_ROOT/public/scripts/install-validatornode.sh" "${args[@]}"
