#!/usr/bin/env bash
# Load reviewed setup-node.sh profiles as data, never execute profile contents.
load_node_profile() {
  [[ -n "${GYDS_NODE_ENV:-}" ]] || return 0
  [[ -f "$GYDS_NODE_ENV" ]] || { echo "Node profile not found: $GYDS_NODE_ENV" >&2; return 1; }
  command -v python3 >/dev/null || { echo "python3 is required to read node profiles" >&2; return 1; }
  local parsed key value
  parsed=$(python3 - "$GYDS_NODE_ENV" <<'PY'
import re, shlex, sys
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith('#'): continue
    key, sep, raw = line.partition('=')
    if not sep or not re.fullmatch(r'GYDS_[A-Z0-9_]+', key):
        raise SystemExit('Unsupported node profile setting')
    values = shlex.split(raw)
    if len(values) > 1: raise SystemExit('Invalid node profile value')
    value = values[0] if values else ''
    if any(c in value for c in '\n\r\t'): raise SystemExit('Multiline node settings are unsupported')
    print(key + '\t' + value)
PY
  ) || return 1
  while IFS=$'\t' read -r key value; do
    [[ -n "$key" ]] && export "$key=$value"
  done <<< "$parsed"
}

write_node_profile() {
  local file="$1" key value escaped
  (umask 077; : > "$file")
  while IFS= read -r key; do
    [[ "$key" =~ ^GYDS_[A-Z0-9_]+$ ]] || continue
    value="${!key}"
    [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
    escaped="${value//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    printf '%s="%s"\n' "$key" "$escaped" >> "$file"
  done < <(compgen -e | sort)
  chmod 600 "$file"
}