// GYDSchain Dev Node — single-process all-in-one (chain + PoS + mining + RPC)
// with pre-funded accounts, intended for local dev + tests. Binds to 127.0.0.1.
// Ports: P2P 30304 / RPC 8554 by default.
package main

import (
	"flag"; "fmt"; "log"; "os"; "os/signal"; "strings"; "syscall"
	"chaincore/internal/nodebuilder"; "chaincore/internal/nodeconfig"
)

func main() {
	cfg := nodeconfig.Defaults(nodeconfig.RoleDev)
	cfg.MaxPeers = 0 // isolated
	fs := flag.NewFlagSet("devnode", flag.ExitOnError); cfg.Bind(fs)
	confPath := fs.String("config", "", "Optional JSON config file")
	prefund := fs.String("prefund", "", "Comma-separated wallet addresses to pre-fund with 1M GYDS")
	_ = fs.Parse(os.Args[1:])
	if err := cfg.LoadJSON(*confPath); err != nil { log.Fatalf("config: %v", err) }
	if *prefund != "" {
		for _, a := range strings.Split(*prefund, ",") {
			if a = strings.TrimSpace(a); a != "" { cfg.PrefundedAccounts = append(cfg.PrefundedAccounts, a) }
		}
	}

	stack, err := nodebuilder.Build(cfg, nodebuilder.Options{EnableRPC: true, EnablePoS: true, EnableMining: true, MiningAPI: true, ValidatorAPI: true})
	if err != nil { log.Fatalf("build: %v", err) }
	stack.Start()
	fmt.Printf("[devnode] LOCAL dev chain on %s:%d (rpc %d) chain=%d prefunded=%d\n",
		cfg.ListenAddr, cfg.P2PPort, cfg.RPCPort, cfg.ChainID, len(cfg.PrefundedAccounts))
	sig := make(chan os.Signal, 1); signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM); <-sig
	log.Println("[devnode] shutting down"); stack.Stop()
}
