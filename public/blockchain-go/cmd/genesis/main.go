// GYDSchain Genesis Node — one-shot genesis writer + bootstrap validator.
// Emits genesis.json into --datadir if missing, then runs a full node with PoS.
// Ports: P2P 30300 / RPC 8550 by default.
package main

import (
	"encoding/json"; "flag"; "fmt"; "log"; "os"; "os/signal"; "path/filepath"; "syscall"
	"chaincore/internal/nodebuilder"; "chaincore/internal/nodeconfig"
)

type genesisFile struct {
	ChainID           uint64 `json:"chain_id"`
	BlockTime         int    `json:"block_time"`
	FounderWallet     string `json:"founder_wallet"`
	FounderSupplyWei  string `json:"founder_supply_wei"`
	ValidatorMinStake string `json:"validator_min_stake_wei"`
}

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleGenesis)
	fs := flag.NewFlagSet("genesis", flag.ExitOnError); cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file")
	founder := fs.String("founder-wallet", "0x6422d12bfaddee5142bfad21b3006a74d09017b1", "Founder wallet receiving genesis pre-mint")
	writeOnly := fs.Bool("write-only", false, "Write genesis.json and exit without running the node")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil { log.Fatalf("config: %v", err) }

	_ = os.MkdirAll(cfg.DataDir, 0o755)
	genPath := filepath.Join(cfg.DataDir, "genesis.json")
	if _, err := os.Stat(genPath); os.IsNotExist(err) {
		gf := genesisFile{
			ChainID: cfg.ChainID, BlockTime: cfg.BlockTime, FounderWallet: *founder,
			FounderSupplyWei: nodeconfig.GenesisSupply().String(),
			ValidatorMinStake: nodeconfig.ValidatorMinStake().String(),
		}
		buf, _ := json.MarshalIndent(gf, "", "  ")
		if err := os.WriteFile(genPath, buf, 0o644); err != nil { log.Fatalf("write genesis: %v", err) }
		fmt.Printf("[genesis] wrote %s\n", genPath)
	} else {
		fmt.Printf("[genesis] existing %s (skipping write)\n", genPath)
	}
	if *writeOnly { return }

	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{EnableRPC: true, EnablePoS: true, EnableMining: true, MiningAPI: true, ValidatorAPI: true})
	if err != nil { log.Fatalf("build: %v", err) }
	stack.Start()
	fmt.Printf("[genesis] bootstrap validator on %s:%d (rpc %d) chain=%d\n", cfg.ListenAddr, cfg.P2PPort, cfg.RPCPort, cfg.ChainID)
	sig := make(chan os.Signal, 1); signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM); <-sig
	log.Println("[genesis] shutting down"); stack.Stop()
}
