---
name: Embedded installer code tests
description: Validate code embedded in shell-script heredocs with its own language toolchain.
---

When a shell installer embeds Python or another language, Bash syntax checks and ShellCheck do not validate that embedded code. Add a focused test that extracts the heredoc and runs the language's syntax checker; use synthetic input to test parsing logic when practical.

**Why:** The fullnode installer’s Go-download metadata parser had a Python indentation error that `bash -n` and ShellCheck could not detect.

**How to apply:** For embedded Python in install or deploy scripts, compile the exact heredoc in the project’s safe script test suite. Do not run the full installer just to validate an embedded parser.
