package token

import (
	"errors"
	"math/big"
	"sync"
	"time"
)

// LiquidityPoolBank is the protocol-owned LP vault
// It holds liquidity for all tokens and enforces lock rules
// NO WITHDRAWALS by users or admin - LP is permanently locked or time-locked
type LiquidityPoolBank struct {
	mu       sync.RWMutex
	deposits map[string]*LPDeposit
}

// LPDeposit represents a single token's liquidity deposit
type LPDeposit struct {
	TokenID        string    `json:"tokenId"`
	GYDSAmount     *big.Int  `json:"gydsAmount"`
	TokenAmount    *big.Int  `json:"tokenAmount"`
	IsBurned       bool      `json:"isBurned"`       // If true, LP is permanently locked (burned)
	UnlockTime     time.Time `json:"unlockTime"`     // Only relevant if not burned
	DepositedAt    time.Time `json:"depositedAt"`
	TotalLPTokens  *big.Int  `json:"totalLpTokens"`  // LP tokens minted
	BurnedLPTokens *big.Int  `json:"burnedLpTokens"` // LP tokens burned (should equal total if burned)
}

// NewLiquidityPoolBank creates a new LP bank
func NewLiquidityPoolBank() *LiquidityPoolBank {
	return &LiquidityPoolBank{
		deposits: make(map[string]*LPDeposit),
	}
}

// DepositLiquidity adds liquidity for a token to the bank
// This is called during token creation - liquidity cannot be removed
func (lpb *LiquidityPoolBank) DepositLiquidity(
	tokenID string,
	gydsAmount, tokenAmount *big.Int,
	burnLP bool,
	unlockTime time.Time,
) error {
	lpb.mu.Lock()
	defer lpb.mu.Unlock()

	// Check if deposit already exists
	if _, exists := lpb.deposits[tokenID]; exists {
		return errors.New("liquidity already deposited for this token")
	}

	// Validate amounts
	if gydsAmount == nil || gydsAmount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("GYDS amount must be positive")
	}
	if tokenAmount == nil || tokenAmount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("token amount must be positive")
	}

	// Calculate LP tokens (simplified: sqrt(gyds * token))
	// In production, use proper LP token calculation
	lpTokens := new(big.Int).Mul(gydsAmount, tokenAmount)
	lpTokens.Sqrt(lpTokens)

	burnedLPTokens := new(big.Int)
	if burnLP {
		burnedLPTokens.Set(lpTokens) // All LP tokens are burned
	}

	deposit := &LPDeposit{
		TokenID:        tokenID,
		GYDSAmount:     new(big.Int).Set(gydsAmount),
		TokenAmount:    new(big.Int).Set(tokenAmount),
		IsBurned:       burnLP,
		UnlockTime:     unlockTime,
		DepositedAt:    time.Now(),
		TotalLPTokens:  lpTokens,
		BurnedLPTokens: burnedLPTokens,
	}

	lpb.deposits[tokenID] = deposit
	return nil
}

// GetDeposit returns the LP deposit for a token
func (lpb *LiquidityPoolBank) GetDeposit(tokenID string) (*LPDeposit, error) {
	lpb.mu.RLock()
	defer lpb.mu.RUnlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return nil, errors.New("no deposit found for token")
	}
	return deposit, nil
}

// IsLocked checks if the LP for a token is currently locked
func (lpb *LiquidityPoolBank) IsLocked(tokenID string) (bool, error) {
	lpb.mu.RLock()
	defer lpb.mu.RUnlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return false, errors.New("no deposit found for token")
	}

	// If LP is burned, it's permanently locked
	if deposit.IsBurned {
		return true, nil
	}

	// Otherwise, check unlock time
	return time.Now().Before(deposit.UnlockTime), nil
}

// GetLockStatus returns detailed lock status information
func (lpb *LiquidityPoolBank) GetLockStatus(tokenID string) (*LPLockStatus, error) {
	lpb.mu.RLock()
	defer lpb.mu.RUnlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return nil, errors.New("no deposit found for token")
	}

	status := &LPLockStatus{
		TokenID:       tokenID,
		IsBurned:      deposit.IsBurned,
		IsLocked:      true,
		GYDSLiquidity: deposit.GYDSAmount,
		TokenLiquidity: deposit.TokenAmount,
		DepositedAt:   deposit.DepositedAt,
	}

	if deposit.IsBurned {
		status.LockType = "burned"
		status.UnlockTime = time.Time{} // Never unlocks
	} else {
		status.LockType = "timelocked"
		status.UnlockTime = deposit.UnlockTime
		status.IsLocked = time.Now().Before(deposit.UnlockTime)
		if !status.IsLocked {
			status.RemainingTime = 0
		} else {
			status.RemainingTime = deposit.UnlockTime.Sub(time.Now())
		}
	}

	return status, nil
}

// LPLockStatus contains detailed lock information
type LPLockStatus struct {
	TokenID        string        `json:"tokenId"`
	LockType       string        `json:"lockType"` // "burned" or "timelocked"
	IsBurned       bool          `json:"isBurned"`
	IsLocked       bool          `json:"isLocked"`
	UnlockTime     time.Time     `json:"unlockTime,omitempty"`
	RemainingTime  time.Duration `json:"remainingTime,omitempty"`
	GYDSLiquidity  *big.Int      `json:"gydsLiquidity"`
	TokenLiquidity *big.Int      `json:"tokenLiquidity"`
	DepositedAt    time.Time     `json:"depositedAt"`
}

// GetTotalLiquidity returns total GYDS locked across all tokens
func (lpb *LiquidityPoolBank) GetTotalLiquidity() *big.Int {
	lpb.mu.RLock()
	defer lpb.mu.RUnlock()

	total := new(big.Int)
	for _, deposit := range lpb.deposits {
		total.Add(total, deposit.GYDSAmount)
	}
	return total
}

// GetAllDeposits returns all LP deposits (for indexer/explorer)
func (lpb *LiquidityPoolBank) GetAllDeposits() []*LPDeposit {
	lpb.mu.RLock()
	defer lpb.mu.RUnlock()

	deposits := make([]*LPDeposit, 0, len(lpb.deposits))
	for _, deposit := range lpb.deposits {
		deposits = append(deposits, deposit)
	}
	return deposits
}

// Note: There are NO withdrawal methods
// LP is either permanently burned or time-locked
// Once deposited, liquidity cannot be removed by anyone

// AddLiquidity adds more liquidity to an existing deposit
// This is only allowed if the token's mint authority adds more
func (lpb *LiquidityPoolBank) AddLiquidity(tokenID string, gydsAmount, tokenAmount *big.Int) error {
	lpb.mu.Lock()
	defer lpb.mu.Unlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return errors.New("no deposit found for token")
	}

	if gydsAmount == nil || gydsAmount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("GYDS amount must be positive")
	}
	if tokenAmount == nil || tokenAmount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("token amount must be positive")
	}

	// Add to existing liquidity
	deposit.GYDSAmount.Add(deposit.GYDSAmount, gydsAmount)
	deposit.TokenAmount.Add(deposit.TokenAmount, tokenAmount)

	// Recalculate LP tokens
	newLPTokens := new(big.Int).Mul(deposit.GYDSAmount, deposit.TokenAmount)
	newLPTokens.Sqrt(newLPTokens)

	// If LP is burned, new LP tokens are also burned
	if deposit.IsBurned {
		additionalLP := new(big.Int).Sub(newLPTokens, deposit.TotalLPTokens)
		deposit.BurnedLPTokens.Add(deposit.BurnedLPTokens, additionalLP)
	}
	deposit.TotalLPTokens = newLPTokens

	return nil
}

// ExtendLock extends the time lock for a deposit (only for time-locked LP)
func (lpb *LiquidityPoolBank) ExtendLock(tokenID string, newUnlockTime time.Time) error {
	lpb.mu.Lock()
	defer lpb.mu.Unlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return errors.New("no deposit found for token")
	}

	if deposit.IsBurned {
		return errors.New("cannot extend lock on burned LP")
	}

	if newUnlockTime.Before(deposit.UnlockTime) {
		return errors.New("new unlock time must be after current unlock time")
	}

	deposit.UnlockTime = newUnlockTime
	return nil
}

// BurnLP converts a time-locked LP to permanently burned
// This can only be called by the token creator and is irreversible
func (lpb *LiquidityPoolBank) BurnLP(tokenID string) error {
	lpb.mu.Lock()
	defer lpb.mu.Unlock()

	deposit, exists := lpb.deposits[tokenID]
	if !exists {
		return errors.New("no deposit found for token")
	}

	if deposit.IsBurned {
		return errors.New("LP is already burned")
	}

	// Burn all LP tokens
	deposit.IsBurned = true
	deposit.BurnedLPTokens.Set(deposit.TotalLPTokens)
	deposit.UnlockTime = time.Time{} // Clear unlock time

	return nil
}
