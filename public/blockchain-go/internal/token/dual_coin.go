// Package token - Dual coin management (GYDS + GYD)
// GYDS = gas, staking, network fees (users never touch)
// GYD = stablecoin for user money, bank deposits
package token

import (
	"errors"
	"math/big"
	"sync"
)

// CoinType represents the coin type
type CoinType int

const (
	GYDS CoinType = iota // Gas, staking, fees
	GYD                  // Stablecoin
)

// CoinConfig holds configuration for each coin
type CoinConfig struct {
	Name     string
	Symbol   string
	Decimals uint8

	// Supply
	MaxSupply     *big.Int
	InitialSupply *big.Int

	// For GYD stablecoin
	IsPegged     bool
	PeggedTo     string   // e.g., "USD"
	PegRatio     *big.Float // 1 GYD = 1 USD by default
	CustomPrice  *big.Float // If pegging is removed
}

// DualCoinManager manages both GYDS and GYD
type DualCoinManager struct {
	gydsConfig CoinConfig
	gydConfig  CoinConfig

	// GYD price management
	gydIsPegged   bool
	gydPegRatio   *big.Float
	gydCustomPrice *big.Float

	// Supply tracking
	gydsCirculating *big.Int
	gydCirculating  *big.Int
	gydsBurned      *big.Int
	gydBurned       *big.Int

	// Collateral for GYD (if backed)
	gydCollateral   *big.Int // Value in USD cents

	mu sync.RWMutex
}

// NewDualCoinManager creates a new dual coin manager
func NewDualCoinManager() *DualCoinManager {
	return &DualCoinManager{
		gydsConfig: CoinConfig{
			Name:          "GYDSchain",
			Symbol:        "GYDS",
			Decimals:      18,
			MaxSupply:     new(big.Int).Mul(big.NewInt(1000000000), big.NewInt(1e18)), // 1B
			InitialSupply: big.NewInt(0),
			IsPegged:      false,
		},
	gydConfig: CoinConfig{
			Name:          "GYDchain",
			Symbol:        "GYD",
			Decimals:      6,
			MaxSupply:     nil, // No max for stablecoin
			InitialSupply: big.NewInt(0),
			IsPegged:      true,
			PeggedTo:      "USD",
			PegRatio:      big.NewFloat(1.0), // 1 GYD = 1 USD
		},
		gydIsPegged:     true,
		gydPegRatio:     big.NewFloat(1.0),
		gydCustomPrice:  big.NewFloat(1.0),
		gydsCirculating: big.NewInt(0),
		gydCirculating:  big.NewInt(0),
		gydsBurned:      big.NewInt(0),
		gydBurned:       big.NewInt(0),
		gydCollateral:   big.NewInt(0),
	}
}

// ========== GYD Price Management ==========

// GetGYDPrice returns the current GYD price in USD
func (dcm *DualCoinManager) GetGYDPrice() *big.Float {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()

	if dcm.gydIsPegged {
		return new(big.Float).Set(dcm.gydPegRatio)
	}
	return new(big.Float).Set(dcm.gydCustomPrice)
}

// SetGYDPegged enables/disables USD pegging
func (dcm *DualCoinManager) SetGYDPegged(isPegged bool, pegRatio *big.Float) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	dcm.gydIsPegged = isPegged
	if isPegged && pegRatio != nil {
		dcm.gydPegRatio = new(big.Float).Set(pegRatio)
	}
	return nil
}

// SetGYDCustomPrice sets a custom price when pegging is disabled
func (dcm *DualCoinManager) SetGYDCustomPrice(price *big.Float) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	if dcm.gydIsPegged {
		return errors.New("cannot set custom price while pegged")
	}

	if price.Cmp(big.NewFloat(0)) <= 0 {
		return errors.New("price must be positive")
	}

	dcm.gydCustomPrice = new(big.Float).Set(price)
	return nil
}

// RemovePeg removes USD pegging and allows manual price setting
func (dcm *DualCoinManager) RemovePeg() error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	dcm.gydIsPegged = false
	// Keep current peg ratio as initial custom price
	dcm.gydCustomPrice = new(big.Float).Set(dcm.gydPegRatio)
	return nil
}

// RestorePeg restores USD pegging
func (dcm *DualCoinManager) RestorePeg(ratio *big.Float) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	dcm.gydIsPegged = true
	if ratio != nil {
		dcm.gydPegRatio = new(big.Float).Set(ratio)
	} else {
		dcm.gydPegRatio = big.NewFloat(1.0)
	}
	return nil
}

// ========== Coin Information ==========

// GetGYDSConfig returns GYDS configuration
func (dcm *DualCoinManager) GetGYDSConfig() CoinConfig {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()
	return dcm.gydsConfig
}

// GetGYDConfig returns GYD configuration
func (dcm *DualCoinManager) GetGYDConfig() CoinConfig {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()
	return dcm.gydConfig
}

// GetGYDSCirculating returns circulating GYDS supply
func (dcm *DualCoinManager) GetGYDSCirculating() *big.Int {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()
	return new(big.Int).Set(dcm.gydsCirculating)
}

// GetGYDCirculating returns circulating GYD supply
func (dcm *DualCoinManager) GetGYDCirculating() *big.Int {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()
	return new(big.Int).Set(dcm.gydCirculating)
}

// ========== Supply Management ==========

// MintGYDS mints new GYDS (mining rewards, staking rewards)
func (dcm *DualCoinManager) MintGYDS(amount *big.Int) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	newCirculating := new(big.Int).Add(dcm.gydsCirculating, amount)
	if dcm.gydsConfig.MaxSupply != nil && newCirculating.Cmp(dcm.gydsConfig.MaxSupply) > 0 {
		return errors.New("would exceed GYDS max supply")
	}

	dcm.gydsCirculating = newCirculating
	return nil
}

// BurnGYDS burns GYDS (fee burning, etc.)
func (dcm *DualCoinManager) BurnGYDS(amount *big.Int) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	if dcm.gydsCirculating.Cmp(amount) < 0 {
		return errors.New("insufficient GYDS circulating supply")
	}

	dcm.gydsCirculating = new(big.Int).Sub(dcm.gydsCirculating, amount)
	dcm.gydsBurned = new(big.Int).Add(dcm.gydsBurned, amount)
	return nil
}

// MintGYD mints new GYD (admin only, requires collateral)
func (dcm *DualCoinManager) MintGYD(amount *big.Int) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	dcm.gydCirculating = new(big.Int).Add(dcm.gydCirculating, amount)
	return nil
}

// BurnGYD burns GYD
func (dcm *DualCoinManager) BurnGYD(amount *big.Int) error {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()

	if dcm.gydCirculating.Cmp(amount) < 0 {
		return errors.New("insufficient GYD circulating supply")
	}

	dcm.gydCirculating = new(big.Int).Sub(dcm.gydCirculating, amount)
	dcm.gydBurned = new(big.Int).Add(dcm.gydBurned, amount)
	return nil
}

// ========== Collateral Management (for GYD backing) ==========

// AddCollateral adds collateral backing for GYD
func (dcm *DualCoinManager) AddCollateral(usdCents *big.Int) {
	dcm.mu.Lock()
	defer dcm.mu.Unlock()
	dcm.gydCollateral = new(big.Int).Add(dcm.gydCollateral, usdCents)
}

// GetCollateralRatio returns the GYD collateralization ratio
func (dcm *DualCoinManager) GetCollateralRatio() *big.Float {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()

	if dcm.gydCirculating.Cmp(big.NewInt(0)) == 0 {
		return big.NewFloat(1.0)
	}

	collateralFloat := new(big.Float).SetInt(dcm.gydCollateral)
	circulatingFloat := new(big.Float).SetInt(dcm.gydCirculating)

	// Convert cents to dollars
	collateralFloat = new(big.Float).Quo(collateralFloat, big.NewFloat(100))

	return new(big.Float).Quo(collateralFloat, circulatingFloat)
}

// ========== Statistics ==========

// GetStats returns all coin statistics
func (dcm *DualCoinManager) GetStats() map[string]interface{} {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()

	return map[string]interface{}{
		"gyds": map[string]interface{}{
			"name":        dcm.gydsConfig.Name,
			"symbol":      dcm.gydsConfig.Symbol,
			"decimals":    dcm.gydsConfig.Decimals,
			"max_supply":  dcm.gydsConfig.MaxSupply.String(),
			"circulating": dcm.gydsCirculating.String(),
			"burned":      dcm.gydsBurned.String(),
		},
		"gyd": map[string]interface{}{
			"name":              dcm.gydConfig.Name,
			"symbol":            dcm.gydConfig.Symbol,
			"decimals":          dcm.gydConfig.Decimals,
			"circulating":       dcm.gydCirculating.String(),
			"burned":            dcm.gydBurned.String(),
			"is_pegged":         dcm.gydIsPegged,
			"peg_ratio":         dcm.gydPegRatio.String(),
			"custom_price":      dcm.gydCustomPrice.String(),
			"collateral_usd":    new(big.Float).Quo(new(big.Float).SetInt(dcm.gydCollateral), big.NewFloat(100)).String(),
			"collateral_ratio":  dcm.GetCollateralRatio().String(),
		},
	}
}

// ========== Validation Helpers ==========

// ValidateGYDTransfer validates a GYD transfer is allowed
func (dcm *DualCoinManager) ValidateGYDTransfer(amount *big.Int) error {
	if amount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("amount must be positive")
	}
	return nil
}

// ValidateGYDSTransfer validates a GYDS transfer is allowed
// GYDS transfers are typically restricted to system operations
func (dcm *DualCoinManager) ValidateGYDSTransfer(amount *big.Int, isSystemOp bool) error {
	if amount.Cmp(big.NewInt(0)) <= 0 {
		return errors.New("amount must be positive")
	}

	// Normal users cannot transfer GYDS directly
	// Only system operations (staking, rewards, gas) are allowed
	if !isSystemOp {
		return errors.New("direct GYDS transfers not allowed - use staking or gas operations")
	}

	return nil
}

// ConvertGYDToUSD converts GYD amount to USD value
func (dcm *DualCoinManager) ConvertGYDToUSD(gydAmount *big.Int) *big.Float {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()

	price := dcm.GetGYDPrice()
	gydFloat := new(big.Float).SetInt(gydAmount)
	return new(big.Float).Mul(gydFloat, price)
}

// ConvertUSDToGYD converts USD value to GYD amount
func (dcm *DualCoinManager) ConvertUSDToGYD(usdAmount *big.Float) *big.Int {
	dcm.mu.RLock()
	defer dcm.mu.RUnlock()

	price := dcm.GetGYDPrice()
	gydFloat := new(big.Float).Quo(usdAmount, price)
	gydInt, _ := gydFloat.Int(nil)
	return gydInt
}
