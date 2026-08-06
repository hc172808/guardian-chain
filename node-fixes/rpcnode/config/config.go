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
