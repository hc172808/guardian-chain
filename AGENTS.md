# Project rules

- Validate all master-installer dependencies before running child setup scripts; this prevents partially modifying hosts when deployment files are missing.
- Test installer execution using temporary repositories and stub commands, never by installing services in the development sandbox.