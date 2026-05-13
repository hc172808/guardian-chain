// Package banking - Fee sponsorship for banking UX
// Allows banks to pay gas fees on behalf of users
// Users transact with GYD, never touch GYDS
package banking

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"errors"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/blockchain"
)

// SponsorConfig holds fee sponsorship configuration
type SponsorConfig struct {
	// Maximum gas per sponsored transaction
	MaxGasPerTx uint64
	
	// Maximum total gas per day per beneficiary
	MaxDailyGasPerUser uint64
	
	// Minimum GYDS balance sponsor must maintain
	MinSponsorBalance *big.Int
	
	// Rate limiting
	MaxTxPerMinute int
	MaxTxPerHour   int
}

// Sponsor represents a fee sponsor (bank)
type Sponsor struct {
	Address    [20]byte
	PrivateKey *ecdsa.PrivateKey
	Name       string
	
	// Limits
	MaxGasPerTx    uint64
	DailyGasLimit  uint64
	
	// Tracking
	DailyGasUsed   uint64
	LastResetDay   time.Time
	TxCount        int64
	
	// Status
	IsActive       bool
	BalanceGYDS    *big.Int
}

// SponsorManager manages fee sponsors
type SponsorManager struct {
	config    SponsorConfig
	sponsors  map[[20]byte]*Sponsor
	bc        *blockchain.Blockchain
	mu        sync.RWMutex
	
	// Rate limiting
	userTxCounts map[[20]byte]*rateLimitEntry
}

type rateLimitEntry struct {
	minute     int
	hour       int
	lastMinute time.Time
	lastHour   time.Time
}

// NewSponsorManager creates a new sponsor manager
func NewSponsorManager(config SponsorConfig, bc *blockchain.Blockchain) *SponsorManager {
	return &SponsorManager{
		config:       config,
		sponsors:     make(map[[20]byte]*Sponsor),
		bc:           bc,
		userTxCounts: make(map[[20]byte]*rateLimitEntry),
	}
}

// RegisterSponsor registers a new fee sponsor (bank)
func (sm *SponsorManager) RegisterSponsor(addr [20]byte, name string, privateKey *ecdsa.PrivateKey) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Check if already registered
	if _, exists := sm.sponsors[addr]; exists {
		return errors.New("sponsor already registered")
	}

	// Verify sponsor has sufficient GYDS
	balance := sm.bc.GetBalanceGYDS(addr)
	if balance.Cmp(sm.config.MinSponsorBalance) < 0 {
		return errors.New("insufficient GYDS balance to be a sponsor")
	}

	sm.sponsors[addr] = &Sponsor{
		Address:       addr,
		PrivateKey:    privateKey,
		Name:          name,
		MaxGasPerTx:   sm.config.MaxGasPerTx,
		DailyGasLimit: sm.config.MaxDailyGasPerUser,
		IsActive:      true,
		BalanceGYDS:   balance,
		LastResetDay:  time.Now().Truncate(24 * time.Hour),
	}

	return nil
}

// CreateSponsoredTransaction creates a transaction where the sponsor pays gas
func (sm *SponsorManager) CreateSponsoredTransaction(
	sponsorAddr [20]byte,
	userAddr [20]byte,
	toAddr [20]byte,
	amount *big.Int,
	nonce uint64,
) (*blockchain.Transaction, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	// Get sponsor
	sponsor, exists := sm.sponsors[sponsorAddr]
	if !exists {
		return nil, errors.New("sponsor not registered")
	}

	if !sponsor.IsActive {
		return nil, errors.New("sponsor is not active")
	}

	// Check rate limits
	if err := sm.checkRateLimit(userAddr); err != nil {
		return nil, err
	}

	// Reset daily gas if needed
	today := time.Now().Truncate(24 * time.Hour)
	if sponsor.LastResetDay.Before(today) {
		sponsor.DailyGasUsed = 0
		sponsor.LastResetDay = today
	}

	// Check daily gas limit
	gasLimit := uint64(21000) // Standard transfer gas
	if sponsor.DailyGasUsed+gasLimit > sponsor.DailyGasLimit {
		return nil, errors.New("sponsor daily gas limit exceeded")
	}

	// Verify sponsor still has balance
	gasPrice := uint64(1000000000) // 1 Gwei
	gasCost := new(big.Int).Mul(
		big.NewInt(int64(gasLimit)),
		big.NewInt(int64(gasPrice)),
	)
	
	currentBalance := sm.bc.GetBalanceGYDS(sponsorAddr)
	if currentBalance.Cmp(gasCost) < 0 {
		return nil, errors.New("sponsor has insufficient GYDS for gas")
	}

	// Create the sponsored transaction
	tx := &blockchain.Transaction{
		From:     userAddr,
		To:       toAddr,
		Value:    amount,
		CoinType: blockchain.CoinGYD, // Users always transact in GYD
		GasLimit: gasLimit,
		GasPrice: gasPrice,
		Nonce:    nonce,
		FeePayer: sponsorAddr,
		TxType:   blockchain.TxTypeTransfer,
	}

	// Sign fee payer authorization
	tx.FeePayerSig = sm.signFeeAuthorization(sponsor, tx)
	
	// Calculate transaction hash
	tx.Hash = tx.CalculateHash()

	// Update tracking
	sponsor.DailyGasUsed += gasLimit
	sponsor.TxCount++
	sm.updateRateLimit(userAddr)

	return tx, nil
}

// signFeeAuthorization creates the sponsor's signature for gas payment
func (sm *SponsorManager) signFeeAuthorization(sponsor *Sponsor, tx *blockchain.Transaction) [65]byte {
	// Create message to sign: hash(from, to, value, gasLimit, nonce)
	data := make([]byte, 0, 128)
	data = append(data, tx.From[:]...)
	data = append(data, tx.To[:]...)
	data = append(data, tx.Value.Bytes()...)
	data = append(data, uint64ToBytes(tx.GasLimit)...)
	data = append(data, uint64ToBytes(tx.Nonce)...)
	
	msgHash := sha256.Sum256(data)
	
	// Sign with sponsor's private key
	// In production, use proper ECDSA signing
	var sig [65]byte
	copy(sig[:32], msgHash[:])
	sig[64] = 1 // Recovery ID placeholder
	
	return sig
}

// checkRateLimit verifies the user hasn't exceeded rate limits
func (sm *SponsorManager) checkRateLimit(userAddr [20]byte) error {
	entry, exists := sm.userTxCounts[userAddr]
	if !exists {
		return nil
	}

	now := time.Now()

	// Check minute limit
	if now.Sub(entry.lastMinute) < time.Minute {
		if entry.minute >= sm.config.MaxTxPerMinute {
			return errors.New("rate limit exceeded: too many transactions per minute")
		}
	}

	// Check hour limit
	if now.Sub(entry.lastHour) < time.Hour {
		if entry.hour >= sm.config.MaxTxPerHour {
			return errors.New("rate limit exceeded: too many transactions per hour")
		}
	}

	return nil
}

// updateRateLimit updates the rate limit counters
func (sm *SponsorManager) updateRateLimit(userAddr [20]byte) {
	now := time.Now()
	entry, exists := sm.userTxCounts[userAddr]
	
	if !exists {
		sm.userTxCounts[userAddr] = &rateLimitEntry{
			minute:     1,
			hour:       1,
			lastMinute: now,
			lastHour:   now,
		}
		return
	}

	// Reset minute counter if needed
	if now.Sub(entry.lastMinute) >= time.Minute {
		entry.minute = 0
		entry.lastMinute = now
	}
	entry.minute++

	// Reset hour counter if needed
	if now.Sub(entry.lastHour) >= time.Hour {
		entry.hour = 0
		entry.lastHour = now
	}
	entry.hour++
}

// GetSponsor returns sponsor information
func (sm *SponsorManager) GetSponsor(addr [20]byte) *Sponsor {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	return sm.sponsors[addr]
}

// GetAllSponsors returns all registered sponsors
func (sm *SponsorManager) GetAllSponsors() []*Sponsor {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sponsors := make([]*Sponsor, 0, len(sm.sponsors))
	for _, s := range sm.sponsors {
		sponsors = append(sponsors, s)
	}
	return sponsors
}

// DeactivateSponsor deactivates a sponsor
func (sm *SponsorManager) DeactivateSponsor(addr [20]byte) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sponsor, exists := sm.sponsors[addr]
	if !exists {
		return errors.New("sponsor not found")
	}

	sponsor.IsActive = false
	return nil
}

// GetSponsorStats returns sponsor statistics
func (sm *SponsorManager) GetSponsorStats(addr [20]byte) map[string]interface{} {
	sm.mu.RLock()
	defer sm.mu.RUnlock()

	sponsor, exists := sm.sponsors[addr]
	if !exists {
		return nil
	}

	return map[string]interface{}{
		"address":         addr,
		"name":            sponsor.Name,
		"is_active":       sponsor.IsActive,
		"daily_gas_used":  sponsor.DailyGasUsed,
		"daily_gas_limit": sponsor.DailyGasLimit,
		"total_tx_count":  sponsor.TxCount,
		"balance_gyds":    sponsor.BalanceGYDS.String(),
	}
}

func uint64ToBytes(n uint64) []byte {
	return []byte{
		byte(n >> 56), byte(n >> 48), byte(n >> 40), byte(n >> 32),
		byte(n >> 24), byte(n >> 16), byte(n >> 8), byte(n),
	}
}
