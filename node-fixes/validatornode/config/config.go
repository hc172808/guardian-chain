package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	ChainID     int64
	NetworkName string
	NodeMode    string

	P2PPort      int
	P2PBootstrap []string
	MaxPeers     int

	RPCPort    int
	RPCHost    string
	RPCEnabled bool

	WSPort    int
	WSEnabled bool

	DataDir   string
	LogLevel  string
	LogFormat string

	BlockTime time.Duration

	// Validator-specific
	ValidatorAddress string
	ValidatorKey     string
	StakeRequired    int64
	CommissionRate   float64
	SlashingEnabled  bool
	MinStake         int64
}

func DefaultConfig() *Config {
	return &Config{
		ChainID:         198282,
		NetworkName:     "GYDS Chain",
		NodeMode:        "validator",
		P2PPort:         30302,
		P2PBootstrap:    []string{},
		MaxPeers:        50,
		RPCPort:         8543,
		RPCHost:         "0.0.0.0",
		RPCEnabled:      true,
		WSPort:          8544,
		WSEnabled:       true,
		DataDir:         "./data",
		LogLevel:        "info",
		LogFormat:       "pretty",
		BlockTime:       120 * time.Second,
		StakeRequired:   1000,
		CommissionRate:  0.05,
		SlashingEnabled: true,
		MinStake:        100,
	}
}

func FromEnv() *Config {
	cfg := DefaultConfig()

	if v := os.Getenv("GYDS_CHAIN_ID"); v != "" {
		if id, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.ChainID = id
		}
	}
	if v := os.Getenv("GYDS_NODE_MODE"); v != "" {
		cfg.NodeMode = v
	}
	if v := os.Getenv("GYDS_P2P_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.P2PPort = p
		}
	}
	if v := os.Getenv("GYDS_RPC_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.RPCPort = p
		}
	}
	if v := os.Getenv("GYDS_RPC_HOST"); v != "" {
		cfg.RPCHost = v
	}
	if v := os.Getenv("GYDS_DATA_DIR"); v != "" {
		cfg.DataDir = v
	}
	if v := os.Getenv("GYDS_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
	if v := os.Getenv("GYDS_BOOTSTRAP_NODES"); v != "" {
		cfg.P2PBootstrap = strings.Split(v, ",")
	}
	if v := os.Getenv("GYDS_BLOCK_TIME"); v != "" {
		if secs, err := strconv.Atoi(v); err == nil && secs > 0 {
			cfg.BlockTime = time.Duration(secs) * time.Second
		}
	}
	if v := os.Getenv("GYDS_VALIDATOR_ADDRESS"); v != "" {
		cfg.ValidatorAddress = v
	}
	if v := os.Getenv("GYDS_VALIDATOR_KEY"); v != "" {
		cfg.ValidatorKey = v
	}
	if v := os.Getenv("GYDS_STAKE_REQUIRED"); v != "" {
		if s, err := strconv.ParseInt(v, 10, 64); err == nil {
			cfg.StakeRequired = s
		}
	}
	if v := os.Getenv("GYDS_COMMISSION_RATE"); v != "" {
		if r, err := strconv.ParseFloat(v, 64); err == nil {
			cfg.CommissionRate = r
		}
	}
	return cfg
}
