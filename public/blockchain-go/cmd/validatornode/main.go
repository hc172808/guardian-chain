// GYDSchain Validator Node — full participant that produces PoS blocks.
// Ports: P2P 30301 / RPC 8551 by default (see internal/nodeconfig/ports.go).
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"chaincore/internal/nodebuilder"
	"chaincore/internal/nodeconfig"
)

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleValidator)
	fs := flag.NewFlagSet("validatornode", flag.ExitOnError)
	cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file (overrides flags)")
	moniker := fs.String("moniker", "validator", "Human-readable validator name")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil {
		log.Fatalf("config: %v", err)
	}
	if cfg.ValidatorWallet == "" {
		log.Fatal("--wallet is required for validator node")
	}

	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{
		EnableRPC: true, EnablePoS: true, EnableMining: false,
		MiningAPI: false, ValidatorAPI: true,
	})
	if err != nil {
		log.Fatalf("build: %v", err)
	}
	stack.Start()

	fmt.Printf("[validatornode] %s @ %s:%d (rpc %d) chain=%d wallet=%s stake=%s commission=%d%%\n",
		*moniker, cfg.ListenAddr, cfg.P2PPort, cfg.RPCPort, cfg.ChainID,
		cfg.ValidatorWallet, cfg.ValidatorStake, cfg.ValidatorCommission)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Println("[validatornode] shutting down")
	stack.Stop()
}
