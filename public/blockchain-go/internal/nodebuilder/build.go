// Package nodebuilder wires the standard chain / consensus / mining / rpc /
// network stack together for every cmd/*/main.go. Keeps the individual
// entrypoints tiny — they only supply the Config and choose which subsystems
// to enable.
package nodebuilder

import (
	"log"
	"math/big"
	"strings"

	"chaincore/internal/blockchain"
	"chaincore/internal/consensus"
	"chaincore/internal/mining"
	"chaincore/internal/network"
	"chaincore/internal/nodeconfig"
	"chaincore/internal/rpc"
	"chaincore/internal/storage"
)

// Stack bundles every started subsystem so a cmd main() can Stop() them cleanly.
type Stack struct {
	Chain    *blockchain.Blockchain
	PoS      *consensus.PoSEngine
	Miner    *mining.Distributor
	P2P      *network.P2PNetwork
	RPC      *rpc.Server
	DB       *storage.LevelDB
}

// Options gates optional subsystems per role.
type Options struct {
	EnableRPC       bool
	EnableMining    bool
	EnablePoS       bool
	MiningAPI       bool
	ValidatorAPI    bool
}

// Build initializes every enabled subsystem but does NOT start them.
func Build(cfg nodeconfig.Config, opts Options) (*Stack, error) {
	// Storage
	db, err := storage.NewLevelDB(storage.Config{
		DataDir:     cfg.DataDir,
		MaxSizeGB:   cfg.StorageGB,
		EnablePrune: true,
	})
	if err != nil {
		return nil, err
	}

	// Blockchain
	chain, err := blockchain.NewBlockchain(db, blockchain.Config{
		ChainID:           cfg.ChainID,
		BlockTime:         uint64(cfg.BlockTime),
		MaxBlockSize:      2 * 1024 * 1024,
		MinGasPrice:       1_000_000_000,
		ValidatorMinStake: nodeconfig.ValidatorMinStake(),
		GenesisGYDS:       nodeconfig.GenesisSupply(),
		GenesisGYD:        big.NewInt(0),
	})
	if err != nil {
		return nil, err
	}

	// PoS
	var pos *consensus.PoSEngine
	if opts.EnablePoS {
		pos, err = consensus.NewPoSEngine(chain, consensus.PoSConfig{
			ValidatorKeyPath: cfg.ValidatorKey,
			MinValidators:    4,
			BlockFinality:    2,
			SlashingEnabled:  true,
			RewardPerBlock:   mustBig("2000000000000000000"),
		})
		if err != nil {
			return nil, err
		}
	}

	// Mining
	var miner *mining.Distributor
	if opts.EnableMining {
		miner = mining.NewDistributor(chain, mining.Config{
			Enabled:              true,
			TargetShareTime:      uint64(cfg.BlockTime),
			MaxSharesPerMinute:   100,
			SessionRewardCap:     mustBig("1000000000000000000"),
			DailyAddressCap:      mustBig("10000000000000000000"),
			AntiBotEnabled:       true,
			DifficultyAdjustment: true,
		})
	}

	// P2P
	bootnodes := []string{}
	if cfg.Bootnodes != "" {
		for _, s := range strings.Split(cfg.Bootnodes, ",") {
			if s = strings.TrimSpace(s); s != "" {
				bootnodes = append(bootnodes, s)
			}
		}
	}
	p2p, err := network.NewP2PNetwork(network.Config{
		Port:           cfg.P2PPort,
		MaxPeers:       cfg.MaxPeers,
		NodeType:       network.FullNode,
		EnableRelay:    true,
		EnableRPCProxy: opts.EnableRPC,
		BootstrapNodes: bootnodes,
	})
	if err != nil {
		return nil, err
	}

	// RPC
	var rpcServer *rpc.Server
	if opts.EnableRPC {
		rpcServer, err = rpc.NewServer(chain, pos, miner, rpc.Config{
			Port:               cfg.RPCPort,
			MaxConnections:     1000,
			EnableWebSocket:    true,
			EnableMiningAPI:    opts.MiningAPI,
			EnableValidatorAPI: opts.ValidatorAPI,
			RateLimitPerSecond: 100,
		})
		if err != nil {
			return nil, err
		}
	}

	return &Stack{Chain: chain, PoS: pos, Miner: miner, P2P: p2p, RPC: rpcServer, DB: db}, nil
}

// Start brings every configured subsystem up. Fatals on error — main() should
// have already validated Config.
func (s *Stack) Start() {
	if err := s.P2P.Start(); err != nil {
		log.Fatalf("p2p start: %v", err)
	}
	if s.PoS != nil {
		if err := s.PoS.Start(); err != nil {
			log.Fatalf("pos start: %v", err)
		}
	}
	if s.Miner != nil {
		if err := s.Miner.Start(); err != nil {
			log.Fatalf("miner start: %v", err)
		}
	}
	if s.RPC != nil {
		if err := s.RPC.Start(); err != nil {
			log.Fatalf("rpc start: %v", err)
		}
	}
}

// Stop tears everything down in reverse order.
func (s *Stack) Stop() {
	if s.RPC != nil {
		s.RPC.Stop()
	}
	if s.Miner != nil {
		s.Miner.Stop()
	}
	if s.PoS != nil {
		s.PoS.Stop()
	}
	s.P2P.Stop()
	s.DB.Close()
}

func mustBig(s string) *big.Int { n, _ := new(big.Int).SetString(s, 10); return n }
