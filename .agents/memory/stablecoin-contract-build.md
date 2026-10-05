---
name: Stablecoin contract build isolation
description: Why user-created stablecoin contract validation stays separate from the legacy AMM sources
---

Keep the user stablecoin contract compile and test target isolated until unrelated legacy AMM Solidity compile blockers are resolved.

**Why:** Compiling every Solidity source reaches unrelated Unicode, duplicate-interface, and stack-depth errors, while the isolated stablecoin contract compiles and tests successfully. Those failures should not obscure stablecoin validation.

**How to apply:** Preserve the focused Hardhat compile/test target for stablecoin work. Do not broaden compilation to the full contracts directory or modify unrelated AMM contracts as part of stablecoin changes.
