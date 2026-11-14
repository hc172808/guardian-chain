#!/usr/bin/env python3
"""Reject SQL migrations that rewrite existing usernames or password fields."""

import re
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: check-migration-identity-safety.py <migration.sql>", file=sys.stderr)
        return 2

    try:
        sql = Path(sys.argv[1]).read_text(encoding="utf-8")
    except OSError as error:
        print(f"Cannot read migration: {error}", file=sys.stderr)
        return 2

    # Ignore string values, comments, and quoted identifier syntax.
    sql = re.sub(r"(?i)\bE?'(?:''|\\.|[^'\\])*'", "''", sql, flags=re.S)
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    sql = re.sub(r'"([A-Za-z_][A-Za-z0-9_$]*)"', r"\1", sql)

    account_write = re.compile(
        r"\b(?:UPDATE\s+(?:ONLY\s+)?(?:public\s*\.\s*)?(?:users|profiles)\b"
        r"|INSERT\s+INTO\s+(?:public\s*\.\s*)?(?:users|profiles)\b.*?\bON\s+CONFLICT\b.*?\bDO\s+UPDATE\b"
        r"|MERGE\s+INTO\s+(?:public\s*\.\s*)?(?:users|profiles)\b.*?\bWHEN\s+MATCHED\b.*?\bUPDATE\b)",
        re.I | re.S,
    )
    identity_assignment = re.compile(r"\b(?:username|password_hash|password)\s*=", re.I)

    for statement in sql.split(";"):
        if account_write.search(statement) and identity_assignment.search(statement):
            print(
                f"Rejected {Path(sys.argv[1]).name}: it updates an existing username or password field.",
                file=sys.stderr,
            )
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
