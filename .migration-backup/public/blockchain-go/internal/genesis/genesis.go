// Package genesis handles the genesis block configuration and creation
package genesis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"os"
	"time"
)

// GenesisConfig holds the complete genesis configuration
type GenesisConfig struct {
	ChainID         uint64           `json:"chain_id"`
	Timestamp       uint64           `json:"timestamp"`
	InitialSupply   *big.Int         `json:"initial_supply"`
	InitialPrice    float64          `json:"initial_price"`
	ReservedWallets []ReservedWallet `json:"reserved_wallets"`
	Tokenomics      Tokenomics       `json:"tokenomics"`
}

// ReservedWallet represents a pre-allocated wallet
type ReservedWallet struct {
	Name          string   `json:"name"`
	Address       [20]byte `json:"address"`
	Allocation    *big.Int `json:"allocation"`
	VestingMonths uint32   `json:"vesting_months,omitempty"`
	Description   string   `json:"description"`
}

// Tokenomics defines the token economic parameters
type Tokenomics struct {
	Name               string   `json:"name"`
	Symbol             string   `json:"symbol"`
	Decimals           uint8    `json:"decimals"`
	MaxSupply          *big.Int `json:"max_supply"`
	BlockReward        *big.Int `json:"block_reward"`
	HalvingInterval    uint64   `json:"halving_interval"`
	TargetBlockTime    uint64   `json:"target_block_time"`
	BurnRateOnTransfer float64  `json:"burn_rate_on_transfer"`
}

// DefaultGenesisConfig returns the default genesis configuration
func DefaultGenesisConfig() *GenesisConfig {
	// Convert to wei (10^18)
	weiMultiplier := new(big.Int).Exp(big.NewInt(10), big.NewInt(18), nil)

	// 100 billion total supply
	totalSupply := new(big.Int).Mul(big.NewInt(100_000_000_000), weiMultiplier)

	return &GenesisConfig{
		ChainID:       13370, // GYDS Mainnet Chain ID
		Timestamp:     uint64(time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).Unix()),
		InitialSupply: totalSupply,
		InitialPrice:  0.0000001,
		ReservedWallets: []ReservedWallet{
			{
				Name:          "Founder Wallet",
				Address:       addressFromHex("0x0000000000000000000000000000000000000001"),
				Allocation:    new(big.Int).Mul(big.NewInt(10_000_000_000), weiMultiplier), // 10%
				VestingMonths: 48,
				Description:   "Founder allocation with 48-month vesting",
			},
			{
				Name:        "Mining Pool",
				Address:     addressFromHex("0x0000000000000000000000000000000000000002"),
				Allocation:  new(big.Int).Mul(big.NewInt(40_000_000_000), weiMultiplier), // 40%
				Description: "Mining rewards distribution pool",
			},
			{
				Name:        "Liquidity Pool",
				Address:     addressFromHex("0x0000000000000000000000000000000000000003"),
				Allocation:  new(big.Int).Mul(big.NewInt(20_000_000_000), weiMultiplier), // 20%
				Description: "DEX liquidity provision",
			},
			{
				Name:        "Staking Rewards",
				Address:     addressFromHex("0x0000000000000000000000000000000000000004"),
				Allocation:  new(big.Int).Mul(big.NewInt(15_000_000_000), weiMultiplier), // 15%
				Description: "PoS validator staking rewards",
			},
			{
				Name:          "Development Fund",
				Address:       addressFromHex("0x0000000000000000000000000000000000000005"),
				Allocation:    new(big.Int).Mul(big.NewInt(10_000_000_000), weiMultiplier), // 10%
				VestingMonths: 24,
				Description:   "Development and ecosystem growth",
			},
			{
				Name:          "Team Wallet",
				Address:       addressFromHex("0x0000000000000000000000000000000000000006"),
				Allocation:    new(big.Int).Mul(big.NewInt(5_000_000_000), weiMultiplier), // 5%
				VestingMonths: 36,
				Description:   "Team allocation with 36-month vesting",
			},
		},
		Tokenomics: Tokenomics{
			Name:               "GYDS",
			Symbol:             "GYDS",
			Decimals:           18,
			MaxSupply:          totalSupply,
			BlockReward:        new(big.Int).Mul(big.NewInt(100), weiMultiplier), // 100 GYDS per block
			HalvingInterval:    2_100_000,
			TargetBlockTime:    12, // 12 seconds
			BurnRateOnTransfer: 0.001,
		},
	}
}

// GetFounderWallet returns the founder wallet configuration
func (g *GenesisConfig) GetFounderWallet() *ReservedWallet {
	for i := range g.ReservedWallets {
		if g.ReservedWallets[i].Name == "Founder Wallet" {
			return &g.ReservedWallets[i]
		}
	}
	return nil
}

// GetMiningPoolWallet returns the mining pool wallet
func (g *GenesisConfig) GetMiningPoolWallet() *ReservedWallet {
	for i := range g.ReservedWallets {
		if g.ReservedWallets[i].Name == "Mining Pool" {
			return &g.ReservedWallets[i]
		}
	}
	return nil
}

// GenesisHash calculates the unique hash of the genesis configuration
func (g *GenesisConfig) GenesisHash() [32]byte {
	data, _ := json.Marshal(g)
	return sha256.Sum256(data)
}

// LoadFromFile loads genesis config from a JSON file
func LoadFromFile(path string) (*GenesisConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config GenesisConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// SaveToFile saves genesis config to a JSON file
func (g *GenesisConfig) SaveToFile(path string) error {
	data, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// BurnAddress returns the burn address
func BurnAddress() [20]byte {
	return addressFromHex("0x000000000000000000000000000000000000dEaD")
}

// Helper to convert hex string to address bytes
func addressFromHex(hexAddr string) [20]byte {
	var addr [20]byte
	// Remove 0x prefix if present
	if len(hexAddr) >= 2 && hexAddr[:2] == "0x" {
		hexAddr = hexAddr[2:]
	}
	decoded, _ := hex.DecodeString(hexAddr)
	if len(decoded) >= 20 {
		copy(addr[:], decoded[:20])
	} else {
		copy(addr[20-len(decoded):], decoded)
	}
	return addr
}
