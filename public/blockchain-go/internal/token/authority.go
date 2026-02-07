package token

import (
	"errors"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// AuthorityManager handles token authority operations
type AuthorityManager struct {
	mu           sync.RWMutex
	factory      *TokenFactory
	feeCollector FeeCollector
	freezeState  map[string]map[string]bool // tokenID -> address -> isFrozen
	pauseState   map[string]bool            // tokenID -> isPaused
}

// NewAuthorityManager creates a new authority manager
func NewAuthorityManager(factory *TokenFactory, feeCollector FeeCollector) *AuthorityManager {
	return &AuthorityManager{
		factory:      factory,
		feeCollector: feeCollector,
		freezeState:  make(map[string]map[string]bool),
		pauseState:   make(map[string]bool),
	}
}

// FreezeAddress freezes an address for a specific token
func (am *AuthorityManager) FreezeAddress(tokenID, caller, targetAddress string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	if !token.Authorities.Freeze.Enabled {
		return errors.New("freeze authority is not enabled for this token")
	}
	if token.Authorities.Freeze.Locked {
		return errors.New("freeze authority is locked")
	}
	if token.Authorities.Freeze.Holder != caller {
		return errors.New("caller is not the freeze authority holder")
	}

	// Initialize freeze state for token if needed
	if am.freezeState[tokenID] == nil {
		am.freezeState[tokenID] = make(map[string]bool)
	}

	// Freeze the address
	am.freezeState[tokenID][targetAddress] = true

	return nil
}

// UnfreezeAddress unfreezes an address for a specific token
func (am *AuthorityManager) UnfreezeAddress(tokenID, caller, targetAddress string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	if !token.Authorities.Freeze.Enabled {
		return errors.New("freeze authority is not enabled for this token")
	}
	if token.Authorities.Freeze.Locked {
		return errors.New("freeze authority is locked")
	}
	if token.Authorities.Freeze.Holder != caller {
		return errors.New("caller is not the freeze authority holder")
	}

	// Unfreeze the address
	if am.freezeState[tokenID] != nil {
		delete(am.freezeState[tokenID], targetAddress)
	}

	return nil
}

// IsAddressFrozen checks if an address is frozen for a token
func (am *AuthorityManager) IsAddressFrozen(tokenID, address string) bool {
	am.mu.RLock()
	defer am.mu.RUnlock()

	if am.freezeState[tokenID] == nil {
		return false
	}
	return am.freezeState[tokenID][address]
}

// PauseToken pauses all transfers for a token (emergency use)
func (am *AuthorityManager) PauseToken(tokenID, caller string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	// Only freeze authority holder can pause
	if !token.Authorities.Freeze.Enabled {
		return errors.New("freeze authority is not enabled for this token")
	}
	if token.Authorities.Freeze.Locked {
		return errors.New("freeze authority is locked")
	}
	if token.Authorities.Freeze.Holder != caller {
		return errors.New("caller is not the freeze authority holder")
	}

	am.pauseState[tokenID] = true
	return nil
}

// UnpauseToken unpauses a token
func (am *AuthorityManager) UnpauseToken(tokenID, caller string) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	if !token.Authorities.Freeze.Enabled {
		return errors.New("freeze authority is not enabled for this token")
	}
	if token.Authorities.Freeze.Locked {
		return errors.New("freeze authority is locked")
	}
	if token.Authorities.Freeze.Holder != caller {
		return errors.New("caller is not the freeze authority holder")
	}

	am.pauseState[tokenID] = false
	return nil
}

// IsTokenPaused checks if a token is paused
func (am *AuthorityManager) IsTokenPaused(tokenID string) bool {
	am.mu.RLock()
	defer am.mu.RUnlock()
	return am.pauseState[tokenID]
}

// UpdateMetadata updates token metadata
func (am *AuthorityManager) UpdateMetadata(tokenID, caller string, metadata TokenMetadata) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	if !token.Authorities.Update.Enabled {
		return errors.New("update authority is not enabled for this token")
	}
	if token.Authorities.Update.Locked {
		return errors.New("update authority is locked")
	}
	if token.Authorities.Update.Holder != caller {
		return errors.New("caller is not the update authority holder")
	}

	// Update metadata
	token.Metadata = metadata
	return nil
}

// MintTokens mints new tokens
func (am *AuthorityManager) MintTokens(tokenID, caller, recipient string, amount *big.Int) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token and verify authority
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	if !token.Authorities.Mint.Enabled {
		return errors.New("mint authority is not enabled for this token")
	}
	if token.Authorities.Mint.Locked {
		return errors.New("mint authority is locked")
	}
	if token.Authorities.Mint.Holder != caller {
		return errors.New("caller is not the mint authority holder")
	}

	if amount == nil || amount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("mint amount must be positive")
	}

	// Check if recipient is frozen
	if am.IsAddressFrozen(tokenID, recipient) {
		return errors.New("recipient address is frozen")
	}

	// Update supply
	token.TotalSupply.Add(token.TotalSupply, amount)
	token.CirculatingSupply.Add(token.CirculatingSupply, amount)

	return nil
}

// BurnTokens burns tokens from circulation
func (am *AuthorityManager) BurnTokens(tokenID, caller string, amount *big.Int) error {
	am.mu.Lock()
	defer am.mu.Unlock()

	// Get token
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	// Check if token is paused
	if am.pauseState[tokenID] {
		return errors.New("token is paused")
	}

	// Check if caller is frozen
	if am.IsAddressFrozen(tokenID, caller) {
		return errors.New("caller address is frozen")
	}

	if amount == nil || amount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("burn amount must be positive")
	}

	// Check if caller has sufficient balance (in real implementation)
	// For now, just update supply
	if token.CirculatingSupply.Cmp(amount) < 0 {
		return errors.New("insufficient circulating supply")
	}

	// Update supply
	token.CirculatingSupply.Sub(token.CirculatingSupply, amount)
	token.BurnedSupply.Add(token.BurnedSupply, amount)

	return nil
}

// CanTransfer checks if a transfer is allowed
func (am *AuthorityManager) CanTransfer(tokenID, from, to string) error {
	am.mu.RLock()
	defer am.mu.RUnlock()

	// Check if token is paused
	if am.pauseState[tokenID] {
		return errors.New("token transfers are paused")
	}

	// Check if sender is frozen
	if am.IsAddressFrozen(tokenID, from) {
		return errors.New("sender address is frozen")
	}

	// Check if recipient is frozen (optional - some tokens may allow receiving when frozen)
	if am.IsAddressFrozen(tokenID, to) {
		return errors.New("recipient address is frozen")
	}

	return nil
}

// GetAuthorityStatus returns the status of all authorities for a token
func (am *AuthorityManager) GetAuthorityStatus(tokenID string) (*AuthorityStatus, error) {
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return nil, err
	}

	frozenCount := 0
	if am.freezeState[tokenID] != nil {
		frozenCount = len(am.freezeState[tokenID])
	}

	return &AuthorityStatus{
		TokenID:  tokenID,
		IsLocked: token.IsLocked,
		IsPaused: am.pauseState[tokenID],
		Freeze: AuthorityDetail{
			Enabled:     token.Authorities.Freeze.Enabled,
			Holder:      token.Authorities.Freeze.Holder,
			Locked:      token.Authorities.Freeze.Locked,
			GrantedAt:   token.Authorities.Freeze.GrantedAt,
			FrozenCount: frozenCount,
		},
		Update: AuthorityDetail{
			Enabled:   token.Authorities.Update.Enabled,
			Holder:    token.Authorities.Update.Holder,
			Locked:    token.Authorities.Update.Locked,
			GrantedAt: token.Authorities.Update.GrantedAt,
		},
		Mint: AuthorityDetail{
			Enabled:   token.Authorities.Mint.Enabled,
			Holder:    token.Authorities.Mint.Holder,
			Locked:    token.Authorities.Mint.Locked,
			GrantedAt: token.Authorities.Mint.GrantedAt,
		},
	}, nil
}

// AuthorityStatus contains detailed authority information
type AuthorityStatus struct {
	TokenID  string          `json:"tokenId"`
	IsLocked bool            `json:"isLocked"`
	IsPaused bool            `json:"isPaused"`
	Freeze   AuthorityDetail `json:"freeze"`
	Update   AuthorityDetail `json:"update"`
	Mint     AuthorityDetail `json:"mint"`
}

// AuthorityDetail contains details about a specific authority
type AuthorityDetail struct {
	Enabled     bool      `json:"enabled"`
	Holder      string    `json:"holder"`
	Locked      bool      `json:"locked"`
	GrantedAt   time.Time `json:"grantedAt"`
	FrozenCount int       `json:"frozenCount,omitempty"` // Only for freeze authority
}

// GetFrozenAddresses returns all frozen addresses for a token
func (am *AuthorityManager) GetFrozenAddresses(tokenID string) []string {
	am.mu.RLock()
	defer am.mu.RUnlock()

	if am.freezeState[tokenID] == nil {
		return []string{}
	}

	addresses := make([]string, 0, len(am.freezeState[tokenID]))
	for addr, frozen := range am.freezeState[tokenID] {
		if frozen {
			addresses = append(addresses, addr)
		}
	}
	return addresses
}

// ValidateTransfer performs full transfer validation
func (am *AuthorityManager) ValidateTransfer(tokenID, from, to string, amount *big.Int) error {
	// Check basic transfer rules
	if err := am.CanTransfer(tokenID, from, to); err != nil {
		return err
	}

	if amount == nil || amount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("transfer amount must be positive")
	}

	// Get token to check supply rules
	token, err := am.factory.GetToken(tokenID)
	if err != nil {
		return err
	}

	// Validate against circulating supply (in real implementation, check balance)
	if token.CirculatingSupply.Cmp(amount) < 0 {
		return fmt.Errorf("amount exceeds circulating supply")
	}

	return nil
}
