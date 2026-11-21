---
name: Oracle token price sources
description: Verification rules for GYD and GYDS oracle prices.
---

GYD/USD and GYDS/USD refer to project tokens, not proof of their fiat or market value. CoinGecko/CoinPaprika did not return a verified token listing during the oracle work, and the configured mainnet contract addresses were zero. A Guyana-dollar foreign-exchange rate is not a verified quote for the GYD token; unrelated assets with matching symbols are not acceptable sources.

**Why:** Treating a fiat exchange rate or symbol collision as a token market price can publish misleading financial data.

**How to apply:** Only enable token price updates after verifying a source tracks the exact token, such as a confirmed market listing or deployed on-chain feed/pool. Preserve provider timestamps and mark missing or old values unavailable/stale; do not turn manual values into live prices.
