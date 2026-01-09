// Package token handles token operations including burn and mint
package token

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"sync"
	"time"

	"chaincore/internal/genesis"
)

// OperationType defines the type of token operation
type OperationType int

const (
	Burn OperationType = iota
	Mint
)

// Operation represents a burn or mint operation
type Operation struct {
	ID            [32]byte
	Type          OperationType
	Amount        *big.Int
	USDTAmount    *big.Int // For burn-to-mint
	WalletAddress [20]byte
	TxHash        [32]byte
	CreatedBy     [20]byte
	CreatedAt     time.Time
	Status        string // pending, confirmed, failed
}

// TokenManager handles all token operations
type TokenManager struct {
	config         *genesis.GenesisConfig
	currentPrice   *big.Float
	totalSupply    *big.Int
	circulatingSupply *big.Int
	burnedTotal    *big.Int
	operations     []Operation
	mu             sync.RWMutex
}

// NewTokenManager creates a new token manager
func NewTokenManager(config *genesis.GenesisConfig) *TokenManager {
	return &TokenManager{
		config:            config,
		currentPrice:      big.NewFloat(config.InitialPrice),
		totalSupply:       new(big.Int).Set(config.InitialSupply),
		circulatingSupply: big.NewInt(0),
		burnedTotal:       big.NewInt(0),
		operations:        make([]Operation, 0),
	}
}

// BurnUSDTForMint burns USDT and mints equivalent GYDS
func (tm *TokenManager) BurnUSDTForMint(usdtAmount *big.Int, recipientAddress [20]byte, createdBy [20]byte) (*Operation, *big.Int, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if usdtAmount.Cmp(big.NewInt(0)) <= 0 {
		return nil, nil, errors.New("amount must be positive")
	}

	// Calculate GYDS to mint: amount / price
	usdtFloat := new(big.Float).SetInt(usdtAmount)
	gydsFloat := new(big.Float).Quo(usdtFloat, tm.currentPrice)
	
	gydsToMint := new(big.Int)
	gydsFloat.Int(gydsToMint)

	// Create burn operation
	burnOp := Operation{
		ID:            tm.generateOperationID(),
		Type:          Burn,
		Amount:        new(big.Int).Set(usdtAmount),
		USDTAmount:    new(big.Int).Set(usdtAmount),
		WalletAddress: genesis.BurnAddress(),
		TxHash:        tm.generateTxHash(),
		CreatedBy:     createdBy,
		CreatedAt:     time.Now(),
		Status:        "confirmed",
	}
	tm.operations = append(tm.operations, burnOp)
	tm.burnedTotal.Add(tm.burnedTotal, usdtAmount)

	// Create mint operation
	mintOp := Operation{
		ID:            tm.generateOperationID(),
		Type:          Mint,
		Amount:        gydsToMint,
		USDTAmount:    new(big.Int).Set(usdtAmount),
		WalletAddress: recipientAddress,
		TxHash:        tm.generateTxHash(),
		CreatedBy:     createdBy,
		CreatedAt:     time.Now(),
		Status:        "confirmed",
	}
	tm.operations = append(tm.operations, mintOp)
	tm.circulatingSupply.Add(tm.circulatingSupply, gydsToMint)

	return &mintOp, gydsToMint, nil
}

// DirectMint mints tokens to an address (admin only)
func (tm *TokenManager) DirectMint(amount *big.Int, recipientAddress [20]byte, createdBy [20]byte) (*Operation, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if amount.Cmp(big.NewInt(0)) <= 0 {
		return nil, errors.New("amount must be positive")
	}

	// Check against max supply
	newCirculating := new(big.Int).Add(tm.circulatingSupply, amount)
	if newCirculating.Cmp(tm.totalSupply) > 0 {
		return nil, errors.New("would exceed max supply")
	}

	op := Operation{
		ID:            tm.generateOperationID(),
		Type:          Mint,
		Amount:        new(big.Int).Set(amount),
		USDTAmount:    big.NewInt(0),
		WalletAddress: recipientAddress,
		TxHash:        tm.generateTxHash(),
		CreatedBy:     createdBy,
		CreatedAt:     time.Now(),
		Status:        "confirmed",
	}

	tm.operations = append(tm.operations, op)
	tm.circulatingSupply.Add(tm.circulatingSupply, amount)

	return &op, nil
}

// BurnTokens burns tokens from an address
func (tm *TokenManager) BurnTokens(amount *big.Int, fromAddress [20]byte, createdBy [20]byte) (*Operation, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if amount.Cmp(big.NewInt(0)) <= 0 {
		return nil, errors.New("amount must be positive")
	}

	op := Operation{
		ID:            tm.generateOperationID(),
		Type:          Burn,
		Amount:        new(big.Int).Set(amount),
		WalletAddress: fromAddress,
		TxHash:        tm.generateTxHash(),
		CreatedBy:     createdBy,
		CreatedAt:     time.Now(),
		Status:        "confirmed",
	}

	tm.operations = append(tm.operations, op)
	tm.circulatingSupply.Sub(tm.circulatingSupply, amount)

	return &op, nil
}

// GetCurrentPrice returns the current token price
func (tm *TokenManager) GetCurrentPrice() *big.Float {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	return new(big.Float).Set(tm.currentPrice)
}

// SetPrice updates the token price (admin only)
func (tm *TokenManager) SetPrice(newPrice *big.Float) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if newPrice.Cmp(big.NewFloat(0)) <= 0 {
		return errors.New("price must be positive")
	}

	tm.currentPrice = new(big.Float).Set(newPrice)
	return nil
}

// GetStats returns current token statistics
func (tm *TokenManager) GetStats() (totalSupply, circulatingSupply, burnedTotal *big.Int, price *big.Float) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	return new(big.Int).Set(tm.totalSupply),
		new(big.Int).Set(tm.circulatingSupply),
		new(big.Int).Set(tm.burnedTotal),
		new(big.Float).Set(tm.currentPrice)
}

// GetOperations returns recent operations
func (tm *TokenManager) GetOperations(limit int) []Operation {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	if limit <= 0 || limit > len(tm.operations) {
		limit = len(tm.operations)
	}

	// Return most recent operations
	start := len(tm.operations) - limit
	if start < 0 {
		start = 0
	}

	result := make([]Operation, limit)
	copy(result, tm.operations[start:])
	return result
}

func (tm *TokenManager) generateOperationID() [32]byte {
	data := make([]byte, 40)
	copy(data[:8], big.NewInt(time.Now().UnixNano()).Bytes())
	copy(data[8:], []byte(hex.EncodeToString(tm.burnedTotal.Bytes())))
	return sha256.Sum256(data)
}

func (tm *TokenManager) generateTxHash() [32]byte {
	data := make([]byte, 64)
	copy(data[:8], big.NewInt(time.Now().UnixNano()).Bytes())
	copy(data[8:40], tm.burnedTotal.Bytes())
	copy(data[40:], tm.circulatingSupply.Bytes())
	return sha256.Sum256(data)
}
