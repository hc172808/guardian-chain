package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// LiteNodeConfig holds the header-only lite node configuration.
// The lite node does NOT produce blocks — it only syncs headers and verifies
// them against the known validator set.
type LiteNodeConfig struct {
	NodeMode      string        // always "lite"
	DataDir       string        // e.g. ~/.gyds-litenode
	RPCPort       int           // local HTTP API (default 3000)
	RPCEndpoints  []string      // full-node / validator RPC endpoints to pull headers from
	SyncInterval  time.Duration // how often to poll for new headers
	ValidatorSet  []string      // hex addresses of known validators
	EnableSPV     bool          // enable Simple Payment Verification
	EnableMining  bool          // ALWAYS false for lite nodes
	P2PPort       int           // peer-to-peer port (optional, 0 = disabled)
	LogLevel      string
}

// Default returns the default lite node configuration.
func Default() LiteNodeConfig {
	return LiteNodeConfig{
		NodeMode:     "lite",
		DataDir:      defaultEnv("LITE_DATADIR", "~/.gyds-litenode"),
		RPCPort:      defaultEnvInt("LITE_RPC_PORT", 3000),
		RPCEndpoints: defaultEnvSlice("LITE_RPC_ENDPOINTS", "http://localhost:8545"),
		SyncInterval: defaultEnvDuration("LITE_SYNC_INTERVAL", 5*time.Second),
		ValidatorSet: defaultEnvSlice("LITE_VALIDATORS", ""),
		EnableSPV:    defaultEnvBool("LITE_SPV", true),
		EnableMining: false, // enforced — lite nodes never mine
		P2PPort:      defaultEnvInt("LITE_P2P_PORT", 0),
		LogLevel:     defaultEnv("LITE_LOG_LEVEL", "info"),
	}
}

func defaultEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func defaultEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func defaultEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func defaultEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}

func defaultEnvSlice(key, fallback string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		return parts
	}
	if fallback == "" {
		return nil
	}
	return []string{fallback}
}
