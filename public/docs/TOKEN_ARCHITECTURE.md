# COINS & TOKENS — RULES, FEATURES, AND ARCHITECTURE SPEC

## 1. DEFINITIONS

### Native Coins (GYD / GYDS)
Native coins are **protocol-level assets** enforced by blockchain consensus. They are **NOT tokens**, do **NOT** use smart contracts, and have **no authorities**.

### Tokens
Tokens are **user-created assets** governed by on-chain token rules (contract or protocol extension) and **can have authorities**.

---

## 2. CORE PRINCIPLES

1. **Blockchain is the source of truth**
2. **Indexer only reads and reconstructs state**
3. **Wallets and explorers only display state**
4. **Deleting an indexer must never affect balances**

---

## 3. NATIVE COIN (GYD / GYDS) — RULES & FEATURES

### 3.1 Core Rules

| Rule | Description |
|------|-------------|
| **Enforced by** | Consensus only |
| **Issuer** | None after genesis |
| **Authorities** | None (immutable) |
| **Transfers** | Permissionless |
| **Protocol rules** | Immutable |

### 3.2 Native Coin Features

#### Transfer
- Peer-to-peer
- Signature-based
- No restrictions

#### Burn
- On-chain transaction
- Coins sent to burn opcode or unspendable address (`0x...dEaD`)
- Permanently reduces total supply

#### Mining / Validation
- Block rewards (if enabled)
- Transaction fee collection
- Consensus validated

#### Fees
- All transactions require native coin fees

#### Supply Rules
- Initial supply allocated at genesis (admin-only per design)
- Optional emission schedule
- Optional hard cap

#### Dust Rules
- Minimum output threshold
- Dust outputs may be:
  - Rejected
  - Aggregated
  - Burned (protocol-defined)

#### Addresses
- Unlimited balance per address
- No blacklist or freeze possible

### 3.3 Native Coin — Explicitly NOT Supported

| Feature | Status |
|---------|--------|
| Mint authority | ❌ NOT SUPPORTED |
| Freeze authority | ❌ NOT SUPPORTED |
| Update authority | ❌ NOT SUPPORTED |
| Lock flag | ❌ NOT SUPPORTED |
| Pausing | ❌ NOT SUPPORTED |
| Blacklisting | ❌ NOT SUPPORTED |
| Metadata updates | ❌ NOT SUPPORTED |

---

## 4. TOKENS — RULES & FEATURES

Tokens are **rule-based assets** that support authorities and metadata.

### 4.1 Token Core Properties

| Property | Description |
|----------|-------------|
| Token ID | Unique identifier |
| Name | Display name |
| Symbol | Trading symbol |
| Decimals | Fixed at creation |
| Total supply | Current total |
| Circulating supply | In circulation |
| Burned supply | Permanently removed |

### 4.2 Token Authorities

#### Mint Authority
- Controls minting new tokens
- Can be:
  - Transferred to another address
  - Revoked (set to null)
- **Once revoked, minting is permanently disabled**

#### Freeze Authority
- Can freeze:
  - Individual addresses
  - Entire token
- Frozen balances:
  - Cannot transfer
  - Cannot burn
  - Cannot receive (optional)

#### Update Authority
- Can update:
  - Name
  - Symbol
  - Logo
  - Metadata URI
  - Description

### 4.3 Token Features

#### Mint
- Creates new supply
- Requires mint authority
- Subject to max supply rules

#### Burn
- Destroys tokens
- Reduces total supply
- Can be user-initiated or authority-initiated

#### Transfer
- Subject to freeze / pause rules

#### Freeze
- Enforced on-chain
- Indexer flags frozen balances

#### Pause (Optional)
- Temporarily disables all transfers
- Emergency use only

#### Blacklist / Whitelist (Optional)
- Address-based restrictions

#### Lock (Immutability)
- Permanently revokes:
  - Mint authority
  - Freeze authority
  - Update authority
- **Once locked, token is immutable forever**

### 4.4 Token Fees (Protocol-Level)

Users must pay **native coin fees** to:
- Create token
- Mint tokens
- Freeze / unfreeze
- Update metadata
- Lock token

---

## 5. FEATURE LOCATION & ENFORCEMENT

| Feature | Lives Where | Enforced By |
|---------|-------------|-------------|
| Burn | On-chain transaction | Consensus / contract |
| Freeze | Token contract state | Contract |
| Mint authority | Token metadata | Contract |
| Update authority | Token metadata | Contract |
| Lock status | On-chain + indexed | Contract |

---

## 6. INDEXER RESPONSIBILITIES

The indexer:
- ✅ Reads blocks and transactions
- ✅ Reconstructs balances
- ✅ Stores fast-query data
- ✅ Can be fully rebuilt from genesis
- ❌ Never owns assets
- ❌ Never modifies blockchain state

---

## 7. EXPLORER & WALLET DISPLAY RULES

### 7.1 For Native Coins

Display:
- ✅ Balance
- ✅ Transaction history
- ✅ Burn transactions
- ❌ No authority fields shown

### 7.2 For Tokens (When User Clicks Token)

**Must clearly show:**
- Mint authority (active / revoked)
- Freeze authority (active / revoked)
- Update authority (active / revoked)
- Lock status (locked / unlocked)
- Pause status
- Total supply
- Burned supply

**Users must clearly see if a token is:**
- ✅ Mintable
- ✅ Freezable
- ✅ Updatable
- ✅ Locked

---

## 8. GOLDEN RULE (MANDATORY)

> **Native coins are governed by consensus and math**
> 
> **Tokens are governed by rules and authorities**
> 
> **The indexer never owns assets — it only explains them**

---

## 9. TOKEN FACTORY SYSTEM

### 9.1 Creation Requirements

| Requirement | Description |
|-------------|-------------|
| GYDS Deployment Fee | Mandatory fee paid in GYDS |
| GYDS Liquidity | Mandatory liquidity provision |
| LP Lock | Must be burned or time-locked |

### 9.2 Liquidity Pool Bank (LPB)

The protocol-owned LP vault:
- Accepts burned token supply + GYDS liquidity
- Enforces LP tokens burned or time-locked
- **No withdrawals by users or admin**
- Publicly exposes LP balances and lock status

### 9.3 Authority Purchases

| Authority | Cost | Features |
|-----------|------|----------|
| Freeze | X GYDS | Can freeze addresses |
| Update | Y GYDS | Can update metadata |
| Mint | Z GYDS + Extra Liquidity | Can mint new tokens (requires time-lock) |

### 9.4 Burn-to-Lock Logic

- Burning removes tokens from circulation
- Burned tokens are locked in LPB
- **Burned supply is unrecoverable and immutable**

---

## 10. FEE ROUTING

All fees are paid in GYDS and routed to:

| Destination | Purpose |
|-------------|---------|
| Burn | Deflationary mechanism |
| Treasury | Protocol development |
| Miner Rewards | Network security |

---

## 11. SAFETY & IMMUTABILITY

### Immutable (Non-Upgradable)
- ✅ Supply rules
- ✅ LP rules
- ✅ Burn-to-lock logic

### Mutable (If Authority Enabled)
- Metadata updates (name, symbol, logo)

---

## 12. DUAL NATIVE COIN ARCHITECTURE

### GYDS (GYDSchain)
- **Purpose**: Gas fees, staking, network rewards
- **User Access**: Users never hold GYDS directly
- **Gas Sponsor**: Banks/sponsors hold GYDS and pay gas on behalf of users

### GYD (GYDchain)
- **Purpose**: User transactions, bank deposits/withdrawals
- **Peg**: USD (admin-controlled)
- **Gas Usage**: Never used for gas

---

## 13. IMPLEMENTATION CHECKLIST

### Backend (Go)
- [ ] Token creation logic with protocol enforcement
- [ ] GYDS deployment fee validation
- [ ] Mandatory GYDS liquidity validation
- [ ] Mint supply → burn from creator → deposit to LPB
- [ ] Reject creation if liquidity/fees missing
- [ ] LP Bank implementation
- [ ] Authority system (Freeze, Update, Mint)
- [ ] Authority revocation/burning
- [ ] Fee routing to burn/treasury/miners

### Frontend (React)
- [ ] Token Factory creation form
- [ ] Token Feature Panel display
- [ ] Authority status indicators
- [ ] LP lock type display
- [ ] Burned supply tracking
- [ ] GYDS liquidity display

### Indexer
- [ ] Token creation event processing
- [ ] Authority change tracking
- [ ] Balance reconstruction
- [ ] LP status monitoring
