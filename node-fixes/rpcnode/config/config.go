package config

import (
	"fmt"
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
}

func DefaultConfig() *Config {
	return &Config{
		ChainID:      198282,
		NetworkName:  "GYDS Chain",
		NodeMode:     "rpc",
		P2PPort:      30303,
		P2PBootstrap: []string{},
		MaxPeers:     50,
		RPCPort:      8545,
		RPCHost:      "0.0.0.0",
		RPCEnabled:   true,
		WSPort:       8546,
		WSEnabled:    true,
		DataDir:      "./data",
		LogLevel:     "info",
		LogFormat:    "pretty",
		BlockTime:    120 * time.Second,
	}
}

func FromEnv() *Config {
	cfg := DefaultConfig()

	if v := os.Getenv("GYDS_CHAIN_ID"); v != "" {
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "mainnet":
			cfg.ChainID = 198282
			cfg.NetworkName = "GYDS Mainnet"
		case "testnet":
			cfg.ChainID = 198281
			cfg.NetworkName = "GYDS Testnet"
		default:
			id, err := strconv.ParseInt(strings.TrimSpace(v), 10, 64)
			if err != nil {
				cfg.ChainID = 0
				return cfg
			}
			cfg.ChainID = id
		}
	}
	if cfg.ChainID == 198282 {
		cfg.NetworkName = "GYDS Mainnet"
	} else if cfg.ChainID == 198281 {
		cfg.NetworkName = "GYDS Testnet"
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
	if v := os.Getenv("GYDS_WS_PORT"); v != "" {
		if p, err := strconv.Atoi(v); err == nil {
			cfg.WSPort = p
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
	return cfg
}

func (cfg *Config) Validate() error {
	if cfg.ChainID != 198282 && cfg.ChainID != 198281 {
		return fmt.Errorf("unrecognized GYDS chain ID %d; supported IDs are mainnet 198282 and testnet 198281", cfg.ChainID)
	}
	return nil
}
