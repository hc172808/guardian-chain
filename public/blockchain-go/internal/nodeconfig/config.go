// Package nodeconfig — shared configuration for every ChainCore node binary.
// One place to configure chain ID, block timing, storage limits and per-role
// flags. All localhost-oriented cmd/* binaries (devnode, localnode, boostnode,
// rpcnode, validatornode, genesis) build against this so they can run on the
// same machine without port collisions.
package nodeconfig

import (
	"encoding/json"
	"flag"
	"fmt"
	"math/big"
	"os"
)

// Role is a coarse-grained node role. Determines defaults + which subsystems
// (mining, validator, RPC) are wired up in the cmd/*/main.go entrypoints.
type Role string

const (
	RoleFull      Role = "full"      // block producer + relay
	RoleValidator Role = "validator" // full + PoS producer with staking
	RoleRPC       Role = "rpc"       // full + wide-open RPC, no mining
	RoleBoost     Role = "boost"     // full + mining pool coordinator
	RoleGenesis   Role = "genesis"   // one-shot genesis writer + bootstrap
	RoleDev       Role = "dev"       // single-process all-in-one, prefunded
	RoleLocal     Role = "local"     // dev bound strictly to 127.0.0.1
	RoleLite      Role = "lite"      // header-sync only
)

// Config bundles every knob a cmd/*/main.go needs. Populate via Load() or Bind().
type Config struct {
	Role       Role   `json:"role"`
	DataDir    string `json:"data_dir"`
	ListenAddr string `json:"listen_addr"`  // "127.0.0.1" for local-only, "0.0.0.0" for public
	P2PPort    int    `json:"p2p_port"`
	RPCPort    int    `json:"rpc_port"`
	MaxPeers   int    `json:"max_peers"`
	StorageGB  int64  `json:"storage_gb"`
	ChainID    uint64 `json:"chain_id"`
	BlockTime  int    `json:"block_time"`
	Bootnodes  string `json:"bootnodes"` // comma-separated enode URLs

	// Validator
	ValidatorKey        string `json:"validator_key"`
	ValidatorWallet     string `json:"validator_wallet"`
	ValidatorStake      string `json:"validator_stake"`      // wei
	ValidatorCommission int    `json:"validator_commission"` // percent

	// Mining
	MiningEnabled bool `json:"mining_enabled"`
	MiningThreads int  `json:"mining_threads"`

	// Devnode/localnode
	PrefundedAccounts []string `json:"prefunded_accounts"`
	Founder           bool     `json:"founder"`
}

// Defaults returns a Config populated for the given role using LocalPorts()
// so multiple node binaries can run side-by-side on one host.
func Defaults(role Role) Config {
	ports := LocalPorts(role)
	dataDir := fmt.Sprintf("/var/lib/gydschain/%s", role)
	listen := "0.0.0.0"
	if role == RoleLocal || role == RoleDev {
		listen = "127.0.0.1"
	}
	return Config{
		Role:        role,
		DataDir:     dataDir,
		ListenAddr:  listen,
		P2PPort:     ports.P2P,
		RPCPort:     ports.RPC,
		MaxPeers:    50,
		StorageGB:   100,
		ChainID:     13370,
		BlockTime:   120,
		MiningEnabled: role == RoleBoost || role == RoleDev || role == RoleLocal || role == RoleGenesis,
		MiningThreads: 1,
		ValidatorCommission: 10,
	}
}

// Bind attaches every field to the given FlagSet so all cmd/*/main.go binaries
// expose the same flag surface.
func (c *Config) Bind(fs *flag.FlagSet) {
	fs.StringVar(&c.DataDir, "datadir", c.DataDir, "Data directory for blockchain storage")
	fs.StringVar(&c.ListenAddr, "listen", c.ListenAddr, "Bind address (127.0.0.1 = local-only, 0.0.0.0 = public)")
	fs.IntVar(&c.P2PPort, "p2pport", c.P2PPort, "P2P network port")
	fs.IntVar(&c.RPCPort, "rpcport", c.RPCPort, "RPC / JSON-RPC port")
	fs.IntVar(&c.MaxPeers, "maxpeers", c.MaxPeers, "Maximum peer connections")
	fs.Int64Var(&c.StorageGB, "storage", c.StorageGB, "Maximum storage size in GB")
	fs.Uint64Var(&c.ChainID, "chainid", c.ChainID, "EVM chain ID")
	fs.IntVar(&c.BlockTime, "blocktime", c.BlockTime, "Target block time in seconds")
	fs.StringVar(&c.Bootnodes, "bootnodes", c.Bootnodes, "Comma-separated bootstrap enode URLs")

	fs.StringVar(&c.ValidatorKey, "validator-key", c.ValidatorKey, "Path to validator private key")
	fs.StringVar(&c.ValidatorWallet, "wallet", c.ValidatorWallet, "Validator wallet address (0x…)")
	fs.StringVar(&c.ValidatorStake, "stake", c.ValidatorStake, "Validator self-stake in wei")
	fs.IntVar(&c.ValidatorCommission, "commission", c.ValidatorCommission, "Validator commission percent")

	fs.BoolVar(&c.MiningEnabled, "mining", c.MiningEnabled, "Enable mining reward distribution")
	fs.IntVar(&c.MiningThreads, "mining-threads", c.MiningThreads, "Mining worker threads")

	fs.BoolVar(&c.Founder, "founder", c.Founder, "Enable founder-only privileges")
}

// LoadJSON reads a JSON config file and overlays it on top of `c` (non-zero
// values in the file win). Missing file = no-op, safe to call unconditionally.
func (c *Config) LoadJSON(path string) error {
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return json.Unmarshal(data, c)
}

// GenesisSupply returns the founder pre-mint used by every genesis path.
func GenesisSupply() *big.Int {
	n, _ := new(big.Int).SetString("100000000000000000000000000", 10) // 100M GYDS (18 dec)
	return n
}

// ValidatorMinStake — 32 GYDS equivalent.
func ValidatorMinStake() *big.Int {
	n, _ := new(big.Int).SetString("32000000000000000000", 10)
	return n
}
